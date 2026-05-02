// Anthropic's HTTP streaming endpoint emits SSE frames:
//   event: <name>\n
//   data: {<json>}\n
//   \n
// We reframe those into browser-friendly SSE:
//   event: thinking|text|done|error
//   data: {<small json>}

type AnthropicEvent =
  | { type: "content_block_delta"; delta: { type: "thinking_delta"; thinking: string } | { type: "text_delta"; text: string } }
  | { type: "message_stop" }
  | { type: "ping" }
  | { type: string };

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function transformAnthropicStream(
  upstream: ReadableStream<Uint8Array>,
  submissionId: string
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  let sentDone = false;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // SSE frames are separated by blank lines.
          let sepIdx: number;
          while ((sepIdx = buffer.indexOf("\n\n")) !== -1) {
            const raw = buffer.slice(0, sepIdx);
            buffer = buffer.slice(sepIdx + 2);
            const dataLine = raw.split("\n").find((l) => l.startsWith("data: "));
            if (!dataLine) continue;
            const json = dataLine.slice("data: ".length);
            let parsed: AnthropicEvent;
            try {
              parsed = JSON.parse(json);
            } catch {
              continue;
            }

            if (parsed.type === "content_block_delta" && "delta" in parsed) {
              const d = parsed.delta;
              if (d.type === "thinking_delta") {
                controller.enqueue(encoder.encode(sse("thinking", { delta: d.thinking })));
              } else if (d.type === "text_delta") {
                controller.enqueue(encoder.encode(sse("text", { delta: d.text })));
              }
            } else if (parsed.type === "message_stop") {
              controller.enqueue(encoder.encode(sse("done", { submission_id: submissionId })));
              sentDone = true;
            }
            // Other events (message_start, content_block_start/stop, ping, etc.) are intentionally ignored.
          }
        }
        if (!sentDone) {
          controller.enqueue(encoder.encode(sse("done", { submission_id: submissionId })));
        }
        controller.close();
      } catch {
        controller.enqueue(encoder.encode(sse("error", { message: "Stream interrupted" })));
        controller.close();
      }
    },
  });
}
