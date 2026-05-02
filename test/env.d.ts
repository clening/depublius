/// <reference types="@cloudflare/vitest-pool-workers/types" />

import type { D1Migration } from "cloudflare:test";

declare global {
  namespace Cloudflare {
    interface Env {
      ASSETS: Fetcher;
      DB: D1Database;
      RATE_LIMITER: { limit: (opts: { key: string }) => Promise<{ success: boolean }> };
      ANTHROPIC_API_KEY: string;
      TURNSTILE_SECRET: string;
      TURNSTILE_SITE_KEY: string;
      DAILY_BUDGET_CENTS: string;
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}

export {};
