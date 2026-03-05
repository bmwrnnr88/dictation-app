// Dictation Spelling Game (no backend)

// ---------- Utilities ----------
function normalizeForLenientCompare(s) {
  return s
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeStrict(s) {
  return s
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function wordsOnly(s) {
  return s
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .match(/[A-Za-z0-9]+(?:'[A-Za-z0-9]+)*/g) || [];
}

function wordDiff(correct, typed) {
  const c = wordsOnly(correct);
  const t = wordsOnly(typed);
  const max = Math.max(c.length, t.length);

  const lines = [];
  for (let i = 0; i < max; i++) {
    const cw = c[i] ?? "";
    const tw = t[i] ?? "";
    if (!cw && tw) lines.push(`+ extra: "${tw}"`);
    else if (cw && !tw) lines.push(`- missing: "${cw}"`);
    else if (cw !== tw) lines.push(`! "${tw}" → "${cw}"`);
  }
  return lines;
}

function stripLeadingNumber(s) {
  return s.replace(/^\s*(\d+[\)\.\:]\s+|\-\s+)/, "");
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------- DOM ----------
const sentencesInput = document.getElementById("sentencesInput");
const startSessionBtn = document.getElementById("startSessionBtn");
const setupPanel = document.getElementById("setupPanel");

const shuffleBtn = document.getElementById("shuffleBtn");
const retryMissesBtn = document.getElementById("retryMissesBtn");

const speakBtn = document.getElementById("speakBtn");
const repeatBtn = document.getElementById("repeatBtn");
const stopBtn = document.getElementById("stopBtn");

const autoSpeak = document.getElementById("autoSpeak");
const strictMode = document.getElementById("strictMode");

const voiceSelect = document.getElementById("voiceSelect");
const rate = document.getElementById("rate");
const pitch = document.getElementById("pitch");
const rateVal = document.getElementById("rateVal");
const pitchVal = document.getElementById("pitchVal");

const studentInput = document.getElementById("studentInput");
const checkBtn = document.getElementById("checkBtn");
const nextBtn = document.getElementById("nextBtn");
const revealBtn = document.getElementById("revealBtn");

const roundNum = document.getElementById("roundNum");
const roundTotal = document.getElementById("roundTotal");
const correctCount = document.getElementById("correctCount");
const missCount = document.getElementById("missCount");

const feedback = document.getElementById("feedback");
const correctSentence = document.getElementById("correctSentence");
const maskedHint = document.getElementById("maskedHint");

// ElevenLabs controls (added in HTML)
const ttsProvider = document.getElementById("ttsProvider");
const elevenKey = document.getElementById("elevenKey");
const elevenVoiceId = document.getElementById("elevenVoiceId");
const elevenModel = document.getElementById("elevenModel");

// ---------- Game State ----------
let deck = [];
let misses = [];
let idx = 0;
let correct = 0;

let currentSentence = "";
let lastSpoken = "";

// ---------- Speech Synthesis (Browser) ----------
let voices = [];
function loadVoices() {
  voices = window.speechSynthesis?.getVoices?.() || [];
  voiceSelect.innerHTML = "";
  voices.forEach((v, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = `${v.name} (${v.lang})`;
    voiceSelect.appendChild(opt);
  });
  const enIndex = voices.findIndex(v => (v.lang || "").toLowerCase().startsWith("en"));
  if (enIndex >= 0) voiceSelect.value = String(enIndex);
}
if ("speechSynthesis" in window) {
  loadVoices();
  window.speechSynthesis.onvoiceschanged = loadVoices;
} else {
  voiceSelect.innerHTML = `<option>Speech not supported</option>`;
}

function speakBrowser(text) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();

  const utter = new SpeechSynthesisUtterance(text);
  const v = voices[Number(voiceSelect.value)] || null;
  if (v) utter.voice = v;
  utter.rate = Number(rate.value);
  utter.pitch = Number(pitch.value);

  lastSpoken = text;
  window.speechSynthesis.speak(utter);
}

function stopSpeakingBrowser() {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
}

// ---------- ElevenLabs TTS (Client-side: NOT secure) ----------
const elevenAudioCache = new Map(); // sentence -> objectURL
let currentAudio = null;

async function getElevenAudioUrl(text) {
  if (elevenAudioCache.has(text)) return elevenAudioCache.get(text);

  const key = (elevenKey?.value || "").trim();
  const voiceId = (elevenVoiceId?.value || "").trim();
  const modelId = (elevenModel?.value || "eleven_turbo_v2_5").trim();

  if (!key || !voiceId) {
    throw new Error("Missing ElevenLabs API key or voice ID.");
  }

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": key,
      "Accept": "audio/mpeg"
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      // Optional tweak if you want:
      // voice_settings: { stability: 0.5, similarity_boost: 0.75 }
    })
  });

  if (!resp.ok) {
    const msg = await resp.text().catch(() => "");
    throw new Error(`ElevenLabs error ${resp.status}: ${msg || resp.statusText}`);
  }

  const blob = await resp.blob();
  const objectUrl = URL.createObjectURL(blob);
  elevenAudioCache.set(text, objectUrl);
  return objectUrl;
}

async function speakEleven(text) {
  // stop any browser voice
  stopSpeakingBrowser();

  // stop any current HTMLAudioElement
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }

  const audioUrl = await getElevenAudioUrl(text);
  currentAudio = new Audio(audioUrl);
  lastSpoken = text;
  await currentAudio.play();
}

function stopSpeakingEleven() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
}

async function speak(text) {
  const provider = (ttsProvider?.value || "browser");
  if (provider === "elevenlabs") {
    try {
      await speakEleven(text);
    } catch (e) {
      // fallback to browser voice if ElevenLabs fails
      feedback.innerHTML = `<span class="bad">TTS error:</span> <div class="diff">${String(e.message || e)}</div>`;
      speakBrowser(text);
    }
  } else {
    speakBrowser(text);
  }
}

function stopSpeaking() {
  stopSpeakingBrowser();
  stopSpeakingEleven();
}

// ---------- UI Helpers ----------
function setEnabled(enabled) {
  shuffleBtn.disabled = !enabled;
  speakBtn.disabled = !enabled;
  repeatBtn.disabled = !enabled;
  stopBtn.disabled = !enabled;
  studentInput.disabled = !enabled;
  checkBtn.disabled = !enabled;
  nextBtn.disabled = !enabled;
  revealBtn.disabled = !enabled;
  retryMissesBtn.disabled = (misses.length === 0);
}

function renderStatus() {
  roundNum.textContent = String(deck.length ? idx + 1 : 0);
  roundTotal.textContent = String(deck.length);
  correctCount.textContent = String(correct);
  missCount.textContent = String(misses.length);
  retryMissesBtn.disabled = (misses.length === 0);
}

function setRound(sentence) {
  currentSentence = sentence;
  correctSentence.textContent = sentence;
  studentInput.value = "";
  feedback.innerHTML = "";
  maskedHint.textContent = "";
  renderStatus();

  if (autoSpeak.checked) speak(sentence);
  studentInput.focus();
}

// ---------- Start Session (Hide sentence window) ----------
function startSession() {
  const lines = sentencesInput.value
    .split("\n")
    .map(s => stripLeadingNumber(s).trim())
    .filter(Boolean);

  if (lines.length === 0) {
    alert("Paste at least one sentence (one per line).");
    return;
  }

  deck = lines;
  misses = [];
  idx = 0;
  correct = 0;

  // Hide the sentence editor UI after loading the deck
  if (setupPanel) setupPanel.style.display = "none";

  setEnabled(true);
  renderStatus();
  setRound(deck[idx]);
}

startSessionBtn.addEventListener("click", startSession);

// ---------- Buttons ----------
shuffleBtn.addEventListener("click", () => {
  if (!deck.length) return;
  shuffle(deck);
  idx = 0;
  feedback.innerHTML = `<span class="good">Shuffled.</span>`;
  setRound(deck[idx]);
});

retryMissesBtn.addEventListener("click", () => {
  if (misses.length === 0) return;
  deck = [...misses];
  misses = [];
  idx = 0;
  correct = 0;
  feedback.innerHTML = `<span class="good">Retrying misses only.</span>`;
  renderStatus();
  setRound(deck[idx]);
});

speakBtn.addEventListener("click", () => {
  if (!currentSentence) return;
  speak(currentSentence);
});

repeatBtn.addEventListener("click", () => {
  if (!lastSpoken) lastSpoken = currentSentence;
  if (!lastSpoken) return;
  speak(lastSpoken);
});

stopBtn.addEventListener("click", stopSpeaking);

rate.addEventListener("input", () => rateVal.textContent = Number(rate.value).toFixed(2));
pitch.addEventListener("input", () => pitchVal.textContent = Number(pitch.value).toFixed(2));

revealBtn.addEventListener("click", () => {
  correctSentence.textContent = currentSentence;
  feedback.innerHTML = `<span class="bad">Revealed.</span> Compare, then continue.`;
});

checkBtn.addEventListener("click", () => {
  if (!currentSentence) return;

  const typedRaw = studentInput.value;
  const correctRaw = currentSentence;

  const strict = strictMode.checked;
  const typed = strict ? normalizeStrict(typedRaw) : normalizeForLenientCompare(typedRaw);
  const corr  = strict ? normalizeStrict(correctRaw) : normalizeForLenientCompare(correctRaw);

  const dist = levenshtein(corr, typed);
  const isExact = (corr === typed);

  if (isExact) {
    correct += 1;
    feedback.innerHTML = `<span class="good">Correct.</span> <div class="diff">distance: ${dist}</div>`;
    nextBtn.disabled = false;
  } else {
    if (!misses.includes(currentSentence)) misses.push(currentSentence);

    const diffs = wordDiff(correctRaw, typedRaw);
    const diffHtml = diffs.length
      ? `<div class="diff">${diffs.join("\n")}</div>`
      : `<div class="diff">(Differences detected.)</div>`;

    feedback.innerHTML = `<span class="bad">Not quite.</span> <div class="diff">distance: ${dist}</div>${diffHtml}`;
    nextBtn.disabled = false;
  }

  renderStatus();
});

nextBtn.addEventListener("click", () => {
  if (!deck.length) return;

  idx += 1;
  if (idx >= deck.length) {
    const total = deck.length;
    const missed = misses.length;
    feedback.innerHTML =
      `<span class="good">Done.</span> <div class="diff">Correct: ${correct}/${total}. Missed: ${missed}. Use “Retry Misses” if you want.</div>`;
    nextBtn.disabled = true;
    retryMissesBtn.disabled = (misses.length === 0);
    return;
  }

  nextBtn.disabled = true;
  setRound(deck[idx]);
});

studentInput.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    if (!checkBtn.disabled) checkBtn.click();
  }
});
