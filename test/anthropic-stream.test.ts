import { describe, it, expect } from "vitest";
import { transformAnthropicStream } from "../src/anthropic-stream";

function makeUpstream(events: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const e of events) controller.enqueue(encoder.encode(e));
      controller.close();
    },
  });
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value);
  }
  return out;
}

describe("transformAnthropicStream", () => {
  it("emits thinking deltas as 'thinking' events", async () => {
    const upstream = makeUpstream([
      `event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"Let me consider..."}}\n\n`,
    ]);
    const out = await readAll(transformAnthropicStream(upstream, "sub-123"));
    expect(out).toContain("event: thinking");
    expect(out).toContain(`"delta":"Let me consider..."`);
  });

  it("emits text deltas as 'text' events", async () => {
    const upstream = makeUpstream([
      `event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"The author is..."}}\n\n`,
    ]);
    const out = await readAll(transformAnthropicStream(upstream, "sub-123"));
    expect(out).toContain("event: text");
    expect(out).toContain(`"delta":"The author is..."`);
  });

  it("emits 'done' event with submission_id when stream closes", async () => {
    const upstream = makeUpstream([
      `event: message_stop\ndata: {"type":"message_stop"}\n\n`,
    ]);
    const out = await readAll(transformAnthropicStream(upstream, "sub-abc"));
    expect(out).toContain("event: done");
    expect(out).toContain(`"submission_id":"sub-abc"`);
  });

  it("ignores ping events", async () => {
    const upstream = makeUpstream([
      `event: ping\ndata: {"type":"ping"}\n\n`,
    ]);
    const out = await readAll(transformAnthropicStream(upstream, "sub-1"));
    expect(out).not.toContain("ping");
  });

  it("handles multiple deltas split across chunks", async () => {
    const upstream = makeUpstream([
      `event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hel`,
      `lo"}}\n\n`,
    ]);
    const out = await readAll(transformAnthropicStream(upstream, "sub-1"));
    expect(out).toContain(`"delta":"hello"`);
  });
});
