import { describe, it, expect, vi, beforeEach } from "vitest";
import { verifyTurnstile } from "../src/turnstile";

describe("verifyTurnstile", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns true when Cloudflare confirms the token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true }), { status: 200 })
      )
    );
    const ok = await verifyTurnstile("token-good", "secret", "1.2.3.4");
    expect(ok).toBe(true);
  });

  it("returns false when Cloudflare rejects the token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: false, "error-codes": ["invalid-input-response"] }), { status: 200 })
      )
    );
    const ok = await verifyTurnstile("token-bad", "secret", "1.2.3.4");
    expect(ok).toBe(false);
  });

  it("returns false when the verification request itself errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    const ok = await verifyTurnstile("token", "secret", "1.2.3.4");
    expect(ok).toBe(false);
  });
});
