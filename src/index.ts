import type { Env } from "./types";
import { handleAnalyze } from "./analyze";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      if (url.pathname === "/api/analyze" && request.method === "POST") {
        return handleAnalyze(request, env);
      }
      if (url.pathname === "/api/feedback" && request.method === "POST") {
        return new Response("not implemented", { status: 501 });
      }
      if (url.pathname === "/api/survey" && request.method === "POST") {
        return new Response("not implemented", { status: 501 });
      }
      return new Response("not found", { status: 404 });
    }

    return env.ASSETS.fetch(request);
  },
};
