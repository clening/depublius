# (De)Publius

A single-page tool that asks Claude to identify the author of a 150–500 word
writing sample, streaming its reasoning back in real time. Built as the
companion to an article on AI-driven deanonymization at scale.

**Live:** https://depublius-production.carey-lening.workers.dev

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
2. `cp .dev.vars.example .dev.vars` and paste your Anthropic key (and
   optionally a real Turnstile secret; the example uses Cloudflare's
   "always-pass" test secret for local dev).
3. `npx wrangler d1 create depublius` and paste the resulting database ID
   into `wrangler.toml`.
4. `npm run db:migrate:local`
5. `npm run dev`

## Deploy

1. `npx wrangler secret put ANTHROPIC_API_KEY --env production`
2. `npx wrangler secret put TURNSTILE_SECRET --env production`
3. `npm run db:migrate:remote`
4. `npm run deploy`

---

## Operations

### Pull survey + feedback data

Whenever you want a snapshot of what people have submitted:

```bash
cd "/home/privacat/Software Projects/depublius"
npx wrangler d1 execute depublius --remote --command "SELECT * FROM surveys"  --json > /tmp/surveys.json
npx wrangler d1 execute depublius --remote --command "SELECT * FROM feedback" --json > /tmp/feedback.json
npx wrangler d1 execute depublius --remote --command "SELECT * FROM daily_budget" --json > /tmp/budget.json
```

Or a full SQL dump of everything:

```bash
npm run db:export   # writes ./export.sql in the project dir
```

To convert a JSON export to CSV with `jq`:

```bash
jq -r '.[0].results | (map(keys) | add | unique) as $cols
  | $cols, (.[] | [.[$cols[]]]) | @csv' /tmp/surveys.json > /tmp/surveys.csv
```

### Watch live production logs

Useful when something looks wrong or you want to see real-time traffic:

```bash
cd "/home/privacat/Software Projects/depublius"
npx wrangler tail --env production --format pretty
```

Leave it running in one terminal, hit the live URL in a browser, and you'll see request lines + any `console.error` from the Worker (including upstream Anthropic errors with the actual response body).

### Bump the daily spend cap

Default is `DAILY_BUDGET_CENTS = "500"` (= $5/day) per `wrangler.toml`'s
`[env.production.vars]` block. To raise it (e.g. to $20):

1. Edit `wrangler.toml` → `[env.production.vars]` → `DAILY_BUDGET_CENTS = "2000"`
2. `npm run deploy`

### Rotate the Anthropic API key

```bash
cd "/home/privacat/Software Projects/depublius"
npx wrangler secret put ANTHROPIC_API_KEY --env production
# paste the new key when prompted
```

No redeploy needed — secrets take effect immediately.

### Re-enable Turnstile (currently disabled)

Turnstile is wired up but not in the request path because the widget refused
to render reliably in v1 testing. To turn it back on:

1. In `src/analyze.ts`, uncomment the `verifyTurnstile` block.
2. In `public/app.js`, re-add a working bootstrap (the previous attempts are
   in git history under commits with `turnstile` in the message).
3. In `public/index.html`, re-add the `<div class="cf-turnstile" ... id="turnstile">`.
4. Confirm the production Turnstile site has the deployed hostname in its
   allowed-domains list.
5. `npm run deploy`.

### Roll back a bad deploy

```bash
cd "/home/privacat/Software Projects/depublius"
npx wrangler rollback --env production
# pick the previous version from the interactive list
```

### Take the site down

```bash
cd "/home/privacat/Software Projects/depublius"
npx wrangler delete --env production
# or, gentler: edit wrangler.toml to add `workers_dev = false`, then `npm run deploy`
```

## License

MIT
