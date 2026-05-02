const $ = (sel) => document.querySelector(sel);
const escapeHtml = (s) => s
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;");

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
const searchNeededWrapper = $("#search-needed-wrapper");

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
  const turnstileToken = window.turnstile && window.turnstile.getResponse
    ? window.turnstile.getResponse()
    : "";
  if (!turnstileToken) {
    errorEl.textContent = "Please complete the human-verification check.";
    return;
  }

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

// Survey: show "search was needed" question only when both checkboxes ticked.
function refreshSearchNeededVisibility() {
  const both = ranWithoutCheckbox.checked && ranWithCheckbox.checked;
  searchNeededWrapper.hidden = !both;
}
ranWithoutCheckbox.addEventListener("change", refreshSearchNeededVisibility);
ranWithCheckbox.addEventListener("change", refreshSearchNeededVisibility);

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
    search_was_needed: searchNeededWrapper.hidden ? null : !!fd.get("search_was_needed"),
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
