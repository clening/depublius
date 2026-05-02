import type { Env, FeedbackRequestBody } from "./types";

export async function handleFeedback(request: Request, env: Env): Promise<Response> {
  let body: FeedbackRequestBody;
  try {
    body = (await request.json()) as FeedbackRequestBody;
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  if (!body.submission_id || typeof body.submission_id !== "string") {
    return jsonError(400, "submission_id required");
  }
  if (body.vote !== "up" && body.vote !== "down") {
    return jsonError(400, "vote must be 'up' or 'down'");
  }
  const searchUsedInt = body.search_used ? 1 : 0;

  await env.DB.prepare(
    "INSERT INTO feedback (submission_id, vote, search_used) VALUES (?, ?, ?)"
  ).bind(body.submission_id, body.vote, searchUsedInt).run();

  return new Response(null, { status: 204 });
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}
