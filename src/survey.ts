import type { Env, SurveyRequestBody } from "./types";

const MAX_COMMENT_CHARS = 2000;

export async function handleSurvey(request: Request, env: Env): Promise<Response> {
  let body: SurveyRequestBody;
  try {
    body = (await request.json()) as SurveyRequestBody;
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  if (!body.submission_id || typeof body.submission_id !== "string") {
    return jsonError(400, "submission_id required");
  }

  const hasPublic = boolToIntOrNull(body.has_public_writing);
  const posts = numOrNull(body.posts_per_month);
  const ranWith = numOrNull(body.ran_with_search);
  const searchNeeded = boolToIntOrNull(body.search_was_needed);
  const comment = body.freeform_comment
    ? body.freeform_comment.slice(0, MAX_COMMENT_CHARS)
    : null;

  await env.DB.prepare(
    `INSERT INTO surveys
       (submission_id, has_public_writing, posts_per_month,
        ran_with_search, search_was_needed, freeform_comment)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(body.submission_id, hasPublic, posts, ranWith, searchNeeded, comment).run();

  return new Response(null, { status: 204 });
}

function boolToIntOrNull(v: boolean | null | undefined): number | null {
  if (v === true) return 1;
  if (v === false) return 0;
  return null;
}

function numOrNull(v: number | null | undefined): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.floor(v);
  return null;
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}
