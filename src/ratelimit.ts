import type { Env } from "./types";

export async function checkRateLimit(
  env: Env,
  request: Request
): Promise<{ allowed: boolean }> {
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for") ??
    "unknown";
  try {
    const { success } = await env.RATE_LIMITER.limit({ key: ip });
    return { allowed: success };
  } catch {
    // If the rate-limiting binding errors (e.g., not yet provisioned),
    // fail open — better to allow than to break the page entirely.
    return { allowed: true };
  }
}
