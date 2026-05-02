# (De)Publius

A single-page tool that asks Claude to identify the author of a 150–500 word
writing sample, streaming its reasoning back in real time. Built as the
companion to an article on AI-driven deanonymization at scale.

**Live:** (link goes here once deployed)

## How it works

You paste a passage you wrote (please use unpublished drafts, not
already-public work). Claude reads it, thinks out loud, and tells you who
it thinks wrote it. You can optionally turn on web search to let it cross-
reference public corpora. Then you can tell us whether it got you right.

## Privacy

Your writing is not stored anywhere. The optional survey responses are
stored anonymously in a SQLite database on Cloudflare. See `DESIGN.md`
for details.

## Run your own copy

1. `npm install`
2. `cp .dev.vars.example .dev.vars` and fill in your Anthropic key and
   Turnstile secret (use Cloudflare's test secret for local dev).
3. `wrangler d1 create depublius` and paste the resulting database ID into
   `wrangler.toml`.
4. `npm run db:migrate:local`
5. `npm run dev`

## Deploy

1. `wrangler secret put ANTHROPIC_API_KEY`
2. `wrangler secret put TURNSTILE_SECRET` (real Turnstile site secret, not
   the test one)
3. `npm run db:migrate:remote`
4. `npm run deploy`

## License

MIT
