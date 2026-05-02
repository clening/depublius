import Anthropic from "@anthropic-ai/sdk";
import type { Env, AnalyzeRequestBody } from "./types";
import { validatePassage } from "./validation";
import { buildSystemPrompt, buildUserPrompt } from "./prompts";
import { transformAnthropicStream } from "./anthropic-stream";
import { verifyTurnstile } from "./turnstile";
import { checkRateLimit } from "./ratelimit";
import { isBudgetExhausted, recordCost, estimateCostCents } from "./budget";

const MODEL = "claude-sonnet-4-5";
const THINKING_BUDGET_TOKENS = 8000;
const MAX_OUTPUT_TOKENS = 4096;

export async function handleAnalyze(request: Request, env: Env): Promise<Response> {
  let body: AnalyzeRequestBody;
  try {
    body = (await request.json()) as AnalyzeRequestBody;
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  const validation = validatePassage(body.passage ?? "");
  if (!validation.ok) return jsonError(400, validation.error);

  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const turnstileOk = await verifyTurnstile(body.turnstile_token, env.TURNSTILE_SECRET, ip);
  if (!turnstileOk) return jsonError(403, "Could not verify you're human. Please refresh and try again.");

  const rate = await checkRateLimit(env, request);
  if (!rate.allowed) return jsonError(429, "Slow down — try again in an hour.");

  const cap = parseInt(env.DAILY_BUDGET_CENTS, 10) || 500;
  if (await isBudgetExhausted(env.DB, cap)) {
    return jsonError(503, "Free runs exhausted for today, please try again tomorrow.");
  }

  const submissionId = crypto.randomUUID();
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const params: Anthropic.MessageCreateParamsStreaming = {
    model: MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: buildSystemPrompt(),
    messages: [{ role: "user", content: buildUserPrompt(body.passage) }],
    thinking: { type: "enabled", budget_tokens: THINKING_BUDGET_TOKENS },
    stream: true,
  };
  if (body.use_search) {
    params.tools = [{ type: "web_search_20250305", name: "web_search" } as Anthropic.Messages.ToolUnion];
  }

  const upstream = client.messages.stream(params).toReadableStream();
  const transformed = transformAnthropicStream(upstream, submissionId);

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
  // Fire and forget; don't block the stream on the budget write.
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
