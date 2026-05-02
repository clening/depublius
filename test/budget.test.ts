import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { isBudgetExhausted, recordCost, estimateCostCents } from "../src/budget";

beforeEach(async () => {
  await env.DB.exec("DELETE FROM daily_budget;");
});

describe("isBudgetExhausted", () => {
  it("returns false when no spend recorded today", async () => {
    expect(await isBudgetExhausted(env.DB, 500)).toBe(false);
  });

  it("returns true when today's spend meets the cap", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await env.DB.prepare(
      "INSERT INTO daily_budget (date, request_count, estimated_cost_cents) VALUES (?, 1, 500)"
    ).bind(today).run();
    expect(await isBudgetExhausted(env.DB, 500)).toBe(true);
  });
});

describe("recordCost", () => {
  it("creates a row for today and increments on subsequent calls", async () => {
    await recordCost(env.DB, 7);
    await recordCost(env.DB, 3);
    const today = new Date().toISOString().slice(0, 10);
    const row = await env.DB.prepare(
      "SELECT request_count, estimated_cost_cents FROM daily_budget WHERE date = ?"
    ).bind(today).first<{ request_count: number; estimated_cost_cents: number }>();
    expect(row?.request_count).toBe(2);
    expect(row?.estimated_cost_cents).toBe(10);
  });
});

describe("estimateCostCents", () => {
  it("returns at least 1 cent for any non-empty interaction", () => {
    expect(estimateCostCents({ inputTokens: 100, outputTokens: 0, searchUsed: false })).toBeGreaterThanOrEqual(1);
  });

  it("charges more when search is used", () => {
    const without = estimateCostCents({ inputTokens: 200, outputTokens: 1000, searchUsed: false });
    const withSearch = estimateCostCents({ inputTokens: 200, outputTokens: 1000, searchUsed: true });
    expect(withSearch).toBeGreaterThan(without);
  });
});
