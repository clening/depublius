export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  RATE_LIMITER: { limit: (opts: { key: string }) => Promise<{ success: boolean }> };
  ANTHROPIC_API_KEY: string;
  TURNSTILE_SECRET: string;
  TURNSTILE_SITE_KEY: string;
  DAILY_BUDGET_CENTS: string;
}

export interface AnalyzeRequestBody {
  passage: string;
  use_search: boolean;
  turnstile_token: string;
}

export interface FeedbackRequestBody {
  submission_id: string;
  vote: "up" | "down";
  search_used: boolean;
}

export interface SurveyRequestBody {
  submission_id: string;
  has_public_writing: boolean | null;
  posts_per_month: number | null;
  ran_with_search: number | null;        // bitmask 1|2|3
  search_was_needed: boolean | null;
  freeform_comment: string | null;
}
