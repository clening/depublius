const $ = (sel) => document.querySelector(sel);
const escapeHtml = (s) => s
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;");

// Inject Turnstile api.js, then render the widget once the library is ready.
// `window.turnstile` becomes an object before all its methods (like .render)
// are defined, so we wait until .render is actually a function — using
// turnstile.ready() if exposed, or polling as a fallback.
async function bootTurnstile() {
  let pollCount = 0;
  function actuallyRender(sitekey) {
    const div = document.getElementById("turnstile");
    if (!div || div.dataset.rendered) return;
    if (window.turnstile && typeof window.turnstile.render === "function") {
      window.turnstile.render(div, { sitekey, theme: "light" });
      div.dataset.rendered = "1";
      return;
    }
    if (pollCount++ < 50) setTimeout(() => actuallyRender(sitekey), 100);
  }

  try {
    const cfg = await fetch("/api/config").then((r) => r.json());
    if (!cfg.turnstile_site_key) return;

    if (window.turnstile && typeof window.turnstile.ready === "function") {
      window.turnstile.ready(() => actuallyRender(cfg.turnstile_site_key));
    } else if (window.turnstile && typeof window.turnstile.render === "function") {
      actuallyRender(cfg.turnstile_site_key);
    } else if (!document.querySelector('script[src*="turnstile/v0/api.js"]')) {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      script.async = true;
      script.defer = true;
      script.onload = () => actuallyRender(cfg.turnstile_site_key);
      document.head.appendChild(script);
    } else {
      // Script tag already in DOM but library still initializing — poll.
      actuallyRender(cfg.turnstile_site_key);
    }
  } catch {
    // /api/config unreachable — widget stays unrendered, user gets
    // "please complete the human-verification check" on submit.
  }
}
bootTurnstile();

const passageEl = $("#passage");
const wordCountEl = $("#word-count");
const formEl = $("#analyze-form");
const submitBtn = $("#submit-btn");
const errorEl = $("#form-error");
const resultsEl = $("#results");
const thinkingEl = $("#thinking");
const answerEl = $("#answer");
const useSearchEl = $("#use-search");
const surveyForm = $("#survey-form");
const surveySkip = $("#survey-skip");
const surveyStatus = $("#survey-status");
const ranWithoutCheckbox = surveyForm.querySelector('input[name="ran_without"]');
const ranWithCheckbox = surveyForm.querySelector('input[name="ran_with"]');
const searchAbleWrapper = $("#search-able-wrapper");

let currentSubmissionId = null;
let currentSearchUsed = false;

function countWords(s) {
  const t = s.trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

passageEl.addEventListener("input", () => {
  const n = countWords(passageEl.value);
  wordCountEl.textContent = `${n} word${n === 1 ? "" : "s"}` +
    (n < 150 || n > 500 ? " (must be 150–500)" : "");
});

formEl.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.textContent = "";
  const passage = passageEl.value;
  const n = countWords(passage);
  if (n < 150 || n > 500) {
    errorEl.textContent = `Passage must be 150–500 words (got ${n}).`;
    return;
  }
  // Use the real Turnstile token when the widget has rendered, otherwise
  // fall back to a non-empty placeholder. In local dev the server-side
  // TURNSTILE_SECRET is Cloudflare's "always-pass" test secret, so any
  // non-empty token verifies. In production with a real secret, the
  // placeholder will be rejected — which is the correct behavior, since
  // a real widget should always be present there.
  const turnstileToken = (window.turnstile && window.turnstile.getResponse
    ? window.turnstile.getResponse()
    : "") || "no-widget";

  submitBtn.disabled = true;
  submitBtn.textContent = "Thinking…";
  thinkingEl.textContent = "";
  answerEl.textContent = "";
  resultsEl.hidden = false;
  currentSearchUsed = useSearchEl.checked;

  try {
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        passage,
        use_search: currentSearchUsed,
        turnstile_token: turnstileToken,
      }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({ error: "Unknown error" }));
      errorEl.textContent = errBody.error || "Something went wrong.";
      submitBtn.disabled = false;
      submitBtn.textContent = "Identify me";
      return;
    }
    await consumeSse(res.body);
  } catch (err) {
    errorEl.textContent = "Connection lost. Please try again.";
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Identify me";
    if (window.turnstile && window.turnstile.reset) window.turnstile.reset();
  }
});

async function consumeSse(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      handleSseMessage(raw);
    }
  }
}

function handleSseMessage(raw) {
  let event = "message";
  let dataLine = "";
  for (const line of raw.split("\n")) {
    if (line.startsWith("event: ")) event = line.slice(7).trim();
    else if (line.startsWith("data: ")) dataLine += line.slice(6);
  }
  let data;
  try { data = JSON.parse(dataLine); } catch { return; }

  if (event === "thinking") {
    thinkingEl.textContent += data.delta;
  } else if (event === "text") {
    answerEl.textContent += data.delta;
  } else if (event === "done") {
    currentSubmissionId = data.submission_id;
  } else if (event === "error") {
    errorEl.textContent = data.message || "Stream error";
  }
}

// Thumbs
for (const btn of document.querySelectorAll("#thumbs button")) {
  btn.addEventListener("click", async () => {
    if (!currentSubmissionId) return;
    document.querySelectorAll("#thumbs button").forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        submission_id: currentSubmissionId,
        vote: btn.dataset.vote,
        search_used: currentSearchUsed,
      }),
    });
  });
}

// Survey: show "was Claude able without search?" question only when both
// "ran with" and "ran without" boxes are ticked.
function refreshSearchAbleVisibility() {
  const both = ranWithoutCheckbox.checked && ranWithCheckbox.checked;
  searchAbleWrapper.hidden = !both;
}
ranWithoutCheckbox.addEventListener("change", refreshSearchAbleVisibility);
ranWithCheckbox.addEventListener("change", refreshSearchAbleVisibility);

surveyForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentSubmissionId) return;
  const fd = new FormData(surveyForm);
  let bitmask = 0;
  if (fd.get("ran_without")) bitmask |= 1;
  if (fd.get("ran_with")) bitmask |= 2;
  const body = {
    submission_id: currentSubmissionId,
    has_public_writing: fd.get("has_public_writing") ? true : false,
    posts_per_month: fd.get("posts_per_month") ? Number(fd.get("posts_per_month")) : null,
    ran_with_search: bitmask || null,
    // Question is "was Claude able WITHOUT search?" — flip to the
    // server's "was search needed?" semantics: yes (able) → 0, no (not able) → 1.
    search_was_needed: searchAbleWrapper.hidden
      ? null
      : (fd.get("search_was_able") === "no" ? true
        : fd.get("search_was_able") === "yes" ? false
        : null),
    freeform_comment: fd.get("freeform_comment") || null,
  };
  const res = await fetch("/api/survey", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  surveyStatus.textContent = res.ok ? "Thanks!" : "Couldn't save survey, sorry.";
  if (res.ok) surveyForm.querySelector("button[type=submit]").disabled = true;
});

surveySkip.addEventListener("click", () => {
  $("#survey-section").open = false;
});
