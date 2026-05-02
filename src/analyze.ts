import type { Env, AnalyzeRequestBody } from "./types";
import { validatePassage } from "./validation";
import { buildSystemPrompt, buildUserPrompt } from "./prompts";
import { transformAnthropicStream } from "./anthropic-stream";
import { verifyTurnstile } from "./turnstile";
import { checkRateLimit } from "./ratelimit";
import { isBudgetExhausted, recordCost, estimateCostCents } from "./budget";

const MODEL = "claude-opus-4-6";
// Anthropic requires max_tokens > thinking.budget_tokens.
// 4000 thinking + 4000 answer headroom = 8000 max_tokens cap.
const THINKING_BUDGET_TOKENS = 4000;
const MAX_OUTPUT_TOKENS = 8000;
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

interface AnthropicRequestBody {
  model: string;
  max_tokens: number;
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  thinking: { type: "enabled"; budget_tokens: number };
  stream: true;
  tools?: Array<{ type: string; name: string }>;
}

export async function handleAnalyze(request: Request, env: Env): Promise<Response> {
  let body: AnalyzeRequestBody;
  try {
    body = (await request.json()) as AnalyzeRequestBody;
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  const validation = validatePassage(body.passage ?? "");
  if (!validation.ok) return jsonError(400, validation.error);

  // Turnstile verification disabled — the widget refused to render reliably
  // across browsers/environments and was blocking all legitimate users.
  // Defense-in-depth still in place: per-IP rate limit, daily budget cap,
  // input validation, prompt-injection wrapping, and Cloudflare's free
  // bot/DDoS mitigation. The verifyTurnstile helper, secret, and site key
  // are intentionally preserved so re-enabling is a one-block change.
  // const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  // const turnstileOk = await verifyTurnstile(body.turnstile_token, env.TURNSTILE_SECRET, ip);
  // if (!turnstileOk) return jsonError(403, "Could not verify you're human. Please refresh and try again.");

  const rate = await checkRateLimit(env, request);
  if (!rate.allowed) return jsonError(429, "Slow down — try again in an hour.");

  const cap = parseInt(env.DAILY_BUDGET_CENTS, 10) || 500;
  if (await isBudgetExhausted(env.DB, cap)) {
    return jsonError(503, "Free runs exhausted for today, please try again tomorrow.");
  }

  const submissionId = crypto.randomUUID();

  const apiBody: AnthropicRequestBody = {
    model: MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: buildSystemPrompt(),
    messages: [{ role: "user", content: buildUserPrompt(body.passage) }],
    thinking: { type: "enabled", budget_tokens: THINKING_BUDGET_TOKENS },
    stream: true,
  };
  if (body.use_search) {
    apiBody.tools = [{ type: "web_search_20250305", name: "web_search" }];
  }

  const upstreamRes = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify(apiBody),
  });
  if (!upstreamRes.ok || !upstreamRes.body) {
    const errText = await upstreamRes.text().catch(() => "");
    console.error("Anthropic upstream error", upstreamRes.status, errText.slice(0, 500));
    return jsonError(502, "Upstream error from Anthropic");
  }

  const transformed = transformAnthropicStream(upstreamRes.body, submissionId);

  // Best-effort post-stream cost recording. We don't have exact token counts
  // here without consuming the stream twice; estimate based on input length
  // and assume the model used most of the thinking + output budget.
  const inputTokens = Math.ceil(body.passage.length / 4) + 200; // rough heuristic
  const outputTokens = THINKING_BUDGET_TOKENS + MAX_OUTPUT_TOKENS / 2;
  const cents = estimateCostCents({
    inputTokens,
    outputTokens,
    searchUsed: body.use_search === true,
  });
  recordCost(env.DB, cents).catch(() => {});

  return new Response(transformed, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-store",
      "connection": "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}
