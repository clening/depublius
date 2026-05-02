// Rough Sonnet 4.5 pricing as of 2026-05: $3 / MTok input, $15 / MTok output.
// Web search add-on: ~$10 per 1000 searches = 1 cent per search.
const INPUT_CENTS_PER_MTOK = 300;   // $3.00
const OUTPUT_CENTS_PER_MTOK = 1500; // $15.00
const SEARCH_FLAT_CENTS = 1;

export function estimateCostCents(opts: {
  inputTokens: number;
  outputTokens: number;
  searchUsed: boolean;
}): number {
  const inputCost = (opts.inputTokens / 1_000_000) * INPUT_CENTS_PER_MTOK;
  const outputCost = (opts.outputTokens / 1_000_000) * OUTPUT_CENTS_PER_MTOK;
  const searchCost = opts.searchUsed ? SEARCH_FLAT_CENTS : 0;
  return Math.max(1, Math.ceil(inputCost + outputCost + searchCost));
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function isBudgetExhausted(
  db: D1Database,
  dailyCapCents: number
): Promise<boolean> {
  const row = await db
    .prepare("SELECT estimated_cost_cents FROM daily_budget WHERE date = ?")
    .bind(todayUtc())
    .first<{ estimated_cost_cents: number }>();
  if (!row) return false;
  return row.estimated_cost_cents >= dailyCapCents;
}

export async function recordCost(db: D1Database, cents: number): Promise<void> {
  const today = todayUtc();
  await db
    .prepare(
      `INSERT INTO daily_budget (date, request_count, estimated_cost_cents)
       VALUES (?, 1, ?)
       ON CONFLICT(date) DO UPDATE SET
         request_count = request_count + 1,
         estimated_cost_cents = estimated_cost_cents + excluded.estimated_cost_cents`
    )
    .bind(today, cents)
    .run();
}
