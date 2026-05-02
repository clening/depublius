// Anthropic's HTTP streaming endpoint emits SSE frames:
//   event: <name>\n
//   data: {<json>}\n
//   \n
// We reframe those into browser-friendly SSE:
//   event: thinking|text|done|error
//   data: {<small json>}
//
// The transformer also injects SSE comments (`: heartbeat\n\n`) every
// HEARTBEAT_INTERVAL_MS of upstream silence. This keeps Cloudflare's edge
// from terminating the connection during long no-byte gaps — most commonly
// the period when Anthropic's web_search tool is fetching results and the
// model is paused waiting for them. Comments are part of the SSE spec and
// silently ignored by EventSource and our manual parser, so they cost
// nothing on the client.

const HEARTBEAT_INTERVAL_MS = 10_000;
const MAX_REQUEST_MS = 90_000;

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
  const heartbeat = encoder.encode(": heartbeat\n\n");
  let buffer = "";
  let sentDone = false;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.getReader();
      const startTime = Date.now();
      try {
        // Race each pending read() against a heartbeat timer. When the timer
        // wins, push a keepalive comment and re-race the same pending read.
        // If total wall-clock exceeds MAX_REQUEST_MS, abort with a real error
        // — covers the case where the upstream fetch goes truly silent
        // (no bytes, no close, no throw) and reader.read() would hang forever.
        let pendingRead = reader.read();
        while (true) {
          if (Date.now() - startTime > MAX_REQUEST_MS) {
            console.error(`Analyze stream exceeded ${MAX_REQUEST_MS}ms, aborting`);
            controller.enqueue(
              encoder.encode(sse("error", {
                message: "Analysis took longer than 90 seconds and was aborted. " +
                  "If you had web search enabled, please try again without it.",
              }))
            );
            reader.cancel().catch(() => {});
            controller.close();
            return;
          }

          let timer: ReturnType<typeof setTimeout> | null = null;
          const tickPromise = new Promise<{ kind: "tick" }>((resolve) => {
            timer = setTimeout(() => resolve({ kind: "tick" }), HEARTBEAT_INTERVAL_MS);
          });
          const dataPromise = pendingRead.then((r) => ({ kind: "data" as const, value: r }));
          const winner = await Promise.race([dataPromise, tickPromise]);
          if (timer) clearTimeout(timer);

          if (winner.kind === "tick") {
            controller.enqueue(heartbeat);
            continue; // pendingRead is still in flight; loop and race again
          }

          const { done, value } = winner.value;
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

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
          }

          pendingRead = reader.read();
        }
        if (!sentDone) {
          console.error("Anthropic stream closed without message_stop");
          controller.enqueue(
            encoder.encode(sse("error", {
              message: "The model's response was cut off before completing. " +
                "If you had web search enabled, try again without it — search " +
                "queries can sometimes take longer than the platform allows.",
            }))
          );
        }
        controller.close();
      } catch (err) {
        console.error("Anthropic stream threw:", err instanceof Error ? err.message : String(err));
        controller.enqueue(encoder.encode(sse("error", { message: "Stream interrupted" })));
        controller.close();
      }
    },
  });
}
