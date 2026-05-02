import { describe, it, expect, beforeEach } from "vitest";
import { env, SELF } from "cloudflare:test";

beforeEach(async () => {
  await env.DB.exec("DELETE FROM surveys;");
});

describe("POST /api/survey", () => {
  it("inserts a complete survey", async () => {
    const res = await SELF.fetch("https://x/api/survey", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        submission_id: "sub-1",
        has_public_writing: true,
        posts_per_month: 8,
        ran_with_search: 3,
        search_was_needed: true,
        freeform_comment: "Cool tool",
      }),
    });
    expect(res.status).toBe(204);
    const row = await env.DB.prepare(
      "SELECT * FROM surveys WHERE submission_id = ?"
    ).bind("sub-1").first<any>();
    expect(row.has_public_writing).toBe(1);
    expect(row.posts_per_month).toBe(8);
    expect(row.ran_with_search).toBe(3);
    expect(row.search_was_needed).toBe(1);
    expect(row.freeform_comment).toBe("Cool tool");
  });

  it("accepts a sparse survey (only submission_id)", async () => {
    const res = await SELF.fetch("https://x/api/survey", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ submission_id: "sub-2" }),
    });
    expect(res.status).toBe(204);
  });

  it("rejects missing submission_id", async () => {
    const res = await SELF.fetch("https://x/api/survey", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ posts_per_month: 5 }),
    });
    expect(res.status).toBe(400);
  });

  it("truncates freeform comments at 2000 chars", async () => {
    const long = "a".repeat(3000);
    const res = await SELF.fetch("https://x/api/survey", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ submission_id: "sub-3", freeform_comment: long }),
    });
    expect(res.status).toBe(204);
    const row = await env.DB.prepare(
      "SELECT freeform_comment FROM surveys WHERE submission_id = ?"
    ).bind("sub-3").first<{ freeform_comment: string }>();
    expect(row?.freeform_comment.length).toBe(2000);
  });
});
