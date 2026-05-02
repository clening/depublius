# (De)Publius — Claude Project Instructions

**This project intentionally does not inherit parent-directory Claude
instructions or user skills.** Treat this `CLAUDE.md` as the complete
guidance file. Do not load `../CLAUDE.md` or apply any user-installed
skills unless explicitly invoked by the user.

## Project Purpose

A single-page Cloudflare Worker that takes a writing sample (150–500 words)
and asks Claude to identify the author, streaming reasoning + answer back
to the browser. Companion tool for an article on AI deanonymization.

## Local Development

```bash
npm install
cp .dev.vars.example .dev.vars   # fill in ANTHROPIC_API_KEY
npm run db:migrate:local
npm run dev                       # serves on http://localhost:8787
```

## Tests

```bash
npm test            # one-shot
npm run test:watch  # watch mode
```

## Deployment

```bash
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put TURNSTILE_SECRET
npm run db:migrate:remote
npm run deploy
```

## Repo Layout

- `src/` — Worker TypeScript source
- `public/` — static frontend served by Workers Static Assets
- `migrations/` — D1 schema migrations (numbered)
- `test/` — Vitest tests, mirrors `src/` structure
- `docs/superpowers/` — design spec and implementation plan

## Known Gotchas

- The Workers `rate-limiting` binding is in beta; `wrangler.toml` uses
  `[[unsafe.bindings]]` syntax. Watch for breaking changes.
- Anthropic web search tool (`web_search_20250305`) bills per search; keep
  it gated behind the user's checkbox.
- Writing samples MUST NOT be logged or stored. Only the model's output
  is streamed; the input vanishes once the request completes.
- D1 migrations applied to local and remote are tracked separately —
  always run `db:migrate:remote` before `deploy` if the schema changed.
