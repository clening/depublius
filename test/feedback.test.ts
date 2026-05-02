import { describe, it, expect, beforeEach } from "vitest";
import { env, SELF } from "cloudflare:test";

beforeEach(async () => {
  await env.DB.exec("DELETE FROM feedback;");
});

describe("POST /api/feedback", () => {
  it("inserts a thumbs-up vote", async () => {
    const res = await SELF.fetch("https://x/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ submission_id: "sub-1", vote: "up", search_used: false }),
    });
    expect(res.status).toBe(204);
    const row = await env.DB.prepare(
      "SELECT submission_id, vote, search_used FROM feedback WHERE submission_id = ?"
    ).bind("sub-1").first();
    expect(row).toEqual({ submission_id: "sub-1", vote: "up", search_used: 0 });
  });

  it("rejects an invalid vote value", async () => {
    const res = await SELF.fetch("https://x/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ submission_id: "sub-2", vote: "sideways", search_used: false }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects missing submission_id", async () => {
    const res = await SELF.fetch("https://x/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ vote: "up", search_used: false }),
    });
    expect(res.status).toBe(400);
  });
});
