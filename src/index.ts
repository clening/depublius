import type { Env } from "./types";
import { handleAnalyze } from "./analyze";
import { handleFeedback } from "./feedback";
import { handleSurvey } from "./survey";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      if (url.pathname === "/api/analyze" && request.method === "POST") {
        return handleAnalyze(request, env);
      }
      if (url.pathname === "/api/feedback" && request.method === "POST") {
        return handleFeedback(request, env);
      }
      if (url.pathname === "/api/survey" && request.method === "POST") {
        return handleSurvey(request, env);
      }
      return new Response("not found", { status: 404 });
    }

    return env.ASSETS.fetch(request);
  },
};
