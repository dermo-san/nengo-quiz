"use strict";

const STORAGE = {
  questions: "nengo.questions",
  stats: "nengo.stats",
  sessions: "nengo.sessions",
  settings: "nengo.settings"
};

const TESTS = [
  { round: 1, label: "第1回", date: "2026-09-01", range: "問1〜30" },
  { round: 2, label: "第2回", date: "2026-09-08", range: "問31〜60" },
  { round: 3, label: "第3回", date: "2026-09-15", range: "問61〜90" },
  { round: 4, label: "第4回", date: "2026-09-29", range: "問91〜120" }
];

const FIRST_MASTER_STREAK = 3;
const REMASTER_STREAK = 2;

const $ = (id) => document.getElementById(id);
const views = ["homeView", "quizView", "feedbackView", "resultView", "recordsView", "settingsView"];

let questionDoc = null;
let questions = [];
let stats = {};
let sessions = [];
let settings = { order: "ordered", questionCount: 30, roundSegment: "first" };
let quiz = null;
let lastSessionPlan = null;

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindEvents();
  loadLocalState();
  await loadInitialQuestions();
  renderAll();
  showView("homeView");
  registerServiceWorker();
}

function bindEvents() {
  $("homeButton").addEventListener("click", () => showView("homeView"));
  $("recordsNav").addEventListener("click", () => { renderRecords(); showView("recordsView"); });
  $("settingsNav").addEventListener("click", () => showView("settingsView"));
  document.querySelectorAll("[data-nav-home]").forEach((button) => {
    button.addEventListener("click", () => showView("homeView"));
  });
  document.querySelectorAll("input[name='order']").forEach((radio) => {
    radio.addEventListener("change", () => {
      settings.order = radio.value;
      saveSettings();
      renderHome();
    });
  });
  document.querySelectorAll("input[name='questionCount']").forEach((radio) => {
    radio.addEventListener("change", () => {
      settings.questionCount = Number(radio.value);
      saveSettings();
      renderHome();
    });
  });
  document.querySelectorAll("input[name='roundSegment']").forEach((radio) => {
    radio.addEventListener("change", () => {
      settings.roundSegment = radio.value;
      saveSettings();
      renderHome();
    });
  });
  document.querySelectorAll(".round-start").forEach((button) => {
    button.addEventListener("click", () => startRound(Number(button.dataset.round)));
  });
  $("weakAllStart").addEventListener("click", () => startWeak(null));
  $("weakRoundStart").addEventListener("click", () => startWeak(Number($("weakRound").value)));
  $("randomAllStart").addEventListener("click", startRandomAll);
  $("keypad").addEventListener("click", handleKeypad);
  $("answerButton").addEventListener("click", submitAnswer);
  $("nextButton").addEventListener("click", nextQuestion);
  $("retryWrongButton").addEventListener("click", retryWrongOnly);
  $("againButton").addEventListener("click", repeatLastSession);
  $("resultHomeButton").addEventListener("click", () => { renderAll(); showView("homeView"); });
  $("fileInput").addEventListener("change", handleFileLoad);
  $("sampleLoadButton").addEventListener("click", async () => {
    const doc = await fetchSampleQuestions();
    applyQuestions(doc, true);
    showDataMessage("サンプルデータを読み込みました。", false);
  });
  $("exportButton").addEventListener("click", exportData);
  $("importButton").addEventListener("click", importData);
  $("clearAllButton").addEventListener("click", clearAllData);
}

function loadLocalState() {
  stats = readJson(STORAGE.stats, {});
  sessions = readJson(STORAGE.sessions, []);
  settings = normalizeSettings(readJson(STORAGE.settings, {}));
  document.querySelectorAll("input[name='order']").forEach((radio) => {
    radio.checked = radio.value === settings.order;
  });
  document.querySelectorAll("input[name='questionCount']").forEach((radio) => {
    radio.checked = Number(radio.value) === settings.questionCount;
  });
  document.querySelectorAll("input[name='roundSegment']").forEach((radio) => {
    radio.checked = radio.value === settings.roundSegment;
  });
}

async function loadInitialQuestions() {
  const stored = readJson(STORAGE.questions, null);
  if (stored) {
    const errors = validateQuestionDoc(stored);
    if (!errors.length) {
      applyQuestions(stored, false);
      return;
    }
  }
  const sample = await fetchSampleQuestions();
  applyQuestions(sample, true);
}

async function fetchSampleQuestions() {
  const response = await fetch("questions.sample.json", { cache: "no-store" });
  if (!response.ok) throw new Error("サンプルデータを読み込めませんでした。");
  return response.json();
}

function applyQuestions(doc, persist) {
  const errors = validateQuestionDoc(doc);
  if (errors.length) {
    throw new Error(errors.join("\n"));
  }
  questionDoc = doc;
  questions = [...doc.questions].sort((a, b) => a.id - b.id);
  ensureStats();
  if (persist) {
    localStorage.setItem(STORAGE.questions, JSON.stringify(questionDoc));
  }
  saveStats();
  $("dataStatus").textContent = doc.title || "問題120問";
  renderAll();
}

function validateQuestionDoc(doc) {
  const errors = [];
  if (!doc || typeof doc !== "object") return ["JSONの形式が正しくありません。"];
  if (!Array.isArray(doc.questions)) errors.push("questions が配列ではありません。");
  if (errors.length) return errors;
  if (doc.questions.length !== 120) errors.push("問題数は120問にしてください。");

  const ids = new Set();
  for (const q of doc.questions) {
    if (!Number.isInteger(q.id) || q.id < 1 || q.id > 120) errors.push(`id ${q.id} が1〜120ではありません。`);
    if (ids.has(q.id)) errors.push(`id ${q.id} が重複しています。`);
    ids.add(q.id);
    if (!Number.isInteger(q.year) || q.year < 1 || q.year > 9999) errors.push(`id ${q.id}: year は1〜4桁の整数にしてください。`);
    if (!Number.isInteger(q.round) || q.round < 1 || q.round > 4) errors.push(`id ${q.id}: round は1〜4にしてください。`);
    if (!Number.isInteger(q.col) || q.col < 1 || q.col > 8) errors.push(`id ${q.id}: col は1〜8にしてください。`);
    if (!Number.isInteger(q.row) || q.row < 1 || q.row > 15) errors.push(`id ${q.id}: row は1〜15にしてください。`);
    const expectedRound = Math.ceil(q.col / 2);
    if (Number.isInteger(q.col) && q.round !== expectedRound) errors.push(`id ${q.id}: col と round が合いません。`);
    if (typeof q.event !== "string" || !q.event.trim()) errors.push(`id ${q.id}: event が空です。`);
    if (typeof q.goro !== "string") errors.push(`id ${q.id}: goro は文字列にしてください。`);
  }
  for (let id = 1; id <= 120; id += 1) {
    if (!ids.has(id)) errors.push(`id ${id} がありません。`);
  }
  return [...new Set(errors)].slice(0, 20);
}

function ensureStats() {
  const next = {};
  for (const q of questions) {
    const current = stats[q.id] || {};
    const mastered = Boolean(current.mastered);
    next[q.id] = {
      attempts: Number(current.attempts) || 0,
      correct: Number(current.correct) || 0,
      streak: Number(current.streak) || 0,
      mastered,
      everMastered: typeof current.everMastered === "boolean" ? current.everMastered : mastered,
      lastCorrect: typeof current.lastCorrect === "boolean" ? current.lastCorrect : null
    };
  }
  stats = next;
}

function startRound(round) {
  let selected = questions.filter((q) => q.round === round).sort((a, b) => a.id - b.id);
  const questionCount = getQuestionCount();
  const segment = getRoundSegment();
  if (questionCount === 15) {
    const col = (round - 1) * 2 + (segment === "second" ? 2 : 1);
    selected = selected.filter((q) => q.col === col);
  }
  if (settings.order === "shuffle") selected = shuffle(selected);
  startQuiz({
    mode: "round",
    round,
    questionCount,
    segment: questionCount === 15 ? segment : null,
    label: `${TESTS[round - 1].label} ${questionCount}問${questionCount === 15 ? ` ${segment === "second" ? "後半" : "前半"}` : ""} ${settings.order === "shuffle" ? "シャッフル" : "順番"}`,
    questions: selected
  });
}

function startRandomAll() {
  const questionCount = getQuestionCount();
  startQuiz({
    mode: "random",
    round: null,
    questionCount,
    segment: null,
    label: `全範囲ランダム ${questionCount}問`,
    questions: shuffle(questions).slice(0, questionCount)
  });
}

function startWeak(round) {
  const pool = round ? questions.filter((q) => q.round === round) : questions;
  const questionCount = getQuestionCount();
  startQuiz({
    mode: "weak",
    round,
    questionCount,
    segment: null,
    label: round ? `${TESTS[round - 1].label} 苦手優先 ${questionCount}問` : `苦手優先 全範囲 ${questionCount}問`,
    questions: weightedPick(pool, Math.min(questionCount, pool.length))
  });
}

function startQuiz(plan) {
  if (!plan.questions.length) return;
  quiz = {
    ...plan,
    index: 0,
    input: "",
    answers: [],
    combo: 0,
    bestCombo: Math.max(0, Number(settings.bestCombo) || 0)
  };
  lastSessionPlan = { mode: plan.mode, round: plan.round, questionCount: plan.questionCount, segment: plan.segment };
  renderQuestion();
  showView("quizView");
}

function handleKeypad(event) {
  const button = event.target.closest("button");
  if (!button || !quiz) return;
  const key = button.dataset.key;
  const action = button.dataset.action;
  if (key !== undefined && quiz.input.length < 4) quiz.input += key;
  if (action === "backspace") quiz.input = quiz.input.slice(0, -1);
  if (action === "clear") quiz.input = "";
  renderInput();
}

function submitAnswer() {
  if (!quiz || !quiz.input) return;
  const q = quiz.questions[quiz.index];
  const value = Number.parseInt(quiz.input, 10);
  const isCorrect = value === q.year;
  quiz.combo = isCorrect ? quiz.combo + 1 : 0;
  if (quiz.combo > quiz.bestCombo) {
    quiz.bestCombo = quiz.combo;
    settings.bestCombo = quiz.bestCombo;
    saveSettings();
  }
  quiz.answers.push({ questionId: q.id, input: value, correct: isCorrect });
  updateQuestionStats(q.id, isCorrect);
  renderFeedback(q, value, isCorrect);
  showView("feedbackView");
}

function nextQuestion() {
  if (!quiz) return;
  quiz.index += 1;
  quiz.input = "";
  if (quiz.index >= quiz.questions.length) {
    finishQuiz();
    return;
  }
  renderQuestion();
  showView("quizView");
}

function finishQuiz() {
  const correct = quiz.answers.filter((a) => a.correct).length;
  const session = {
    id: Date.now(),
    date: new Date().toISOString(),
    mode: quiz.mode,
    label: quiz.label,
    round: quiz.round,
    count: quiz.questions.length,
    correct,
    answers: quiz.answers,
    questionIds: quiz.questions.map((q) => q.id)
  };
  sessions.push(session);
  saveSessions();
  renderResult(session);
  renderAll();
  showView("resultView");
}

function retryWrongOnly() {
  const latest = sessions[sessions.length - 1];
  if (!latest) return;
  const wrongIds = latest.answers.filter((a) => !a.correct).map((a) => a.questionId);
  const selected = wrongIds.map((id) => getQuestion(id)).filter(Boolean);
  if (!selected.length) return;
  startQuiz({ mode: "retry", round: latest.round, label: "間違いだけ再挑戦", questions: selected });
}

function repeatLastSession() {
  if (!lastSessionPlan) {
    startRandomAll();
    return;
  }
  if (lastSessionPlan.questionCount) {
    settings.questionCount = lastSessionPlan.questionCount;
  }
  if (lastSessionPlan.segment) {
    settings.roundSegment = lastSessionPlan.segment;
  }
  syncSettingsControls();
  renderHome();
  if (lastSessionPlan.mode === "round") startRound(lastSessionPlan.round);
  else if (lastSessionPlan.mode === "weak") startWeak(lastSessionPlan.round);
  else startRandomAll();
}

function updateQuestionStats(id, isCorrect) {
  const s = stats[id] || { attempts: 0, correct: 0, streak: 0, mastered: false, everMastered: false, lastCorrect: null };
  s.attempts += 1;
  s.correct += isCorrect ? 1 : 0;
  if (isCorrect) {
    s.streak += 1;
    const threshold = s.everMastered ? REMASTER_STREAK : FIRST_MASTER_STREAK;
    if (s.streak >= threshold) {
      s.mastered = true;
      s.everMastered = true;
    }
  } else {
    s.streak = 0;
    s.mastered = false;
  }
  s.lastCorrect = isCorrect;
  stats[id] = s;
  saveStats();
}

function renderAll() {
  renderHome();
  renderRecords();
}

function renderHome() {
  const questionCount = getQuestionCount();
  $("roundModeTitle").textContent = `回別${questionCount}問`;
  $("roundSegmentRow").classList.toggle("active", questionCount === 15);
  $("countdownGrid").innerHTML = TESTS.map(renderCountdownCard).join("");
  $("roundMeters").innerHTML = TESTS.map(renderRoundMeter).join("");
  renderCalendar($("miniCalendar"));
  $("streakLine").textContent = `連続 ${calculateStreak()} 日`;
}

function renderCountdownCard(test) {
  const today = startOfLocalDay(new Date());
  const target = startOfLocalDay(new Date(`${test.date}T00:00:00+09:00`));
  const diff = Math.ceil((target - today) / 86400000);
  const main = diff < 0 ? "終了" : `あと${diff}日`;
  return `<article class="count-card"><span>${formatDate(test.date)} ${test.label} ${test.range}</span><strong>${main}</strong></article>`;
}

function renderRoundMeter(test) {
  const relevant = sessions.filter((s) => s.round === test.round && s.mode !== "retry").slice(-3);
  const avg = relevant.length
    ? Math.round(relevant.reduce((sum, s) => sum + (s.correct / s.count) * 100, 0) / relevant.length)
    : 0;
  const mastered = questions.filter((q) => q.round === test.round && stats[q.id]?.mastered).length;
  return `<article class="meter-card">
    <strong>${test.label}</strong>
    <span>直近${relevant.length || 0}回 ${avg}% / マスター ${mastered}/30</span>
    <div class="mini-meter"><div class="mini-fill" style="width:${avg}%"></div><i class="line pass-line"></i><i class="line goal-line"></i></div>
  </article>`;
}

function renderQuestion() {
  const q = quiz.questions[quiz.index];
  $("quizProgress").textContent = `${quiz.index + 1}/${quiz.questions.length}`;
  $("comboLine").textContent = quiz.combo > quiz.bestCombo && quiz.combo > 1
    ? `コンボ ${quiz.combo} 自己ベスト`
    : `コンボ ${quiz.combo}`;
  $("questionEvent").textContent = q.event;
  renderInput();
}

function renderInput() {
  $("answerDisplay").textContent = quiz?.input || "";
  $("answerButton").disabled = !quiz?.input;
}

function renderFeedback(q, input, isCorrect) {
  $("feedbackMark").textContent = isCorrect ? "○" : "×";
  $("feedbackMark").classList.toggle("wrong", !isCorrect);
  $("feedbackTitle").textContent = isCorrect ? "正解！" : "次で覚えよう";
  $("feedbackCorrect").textContent = `${q.event} → ${q.year}年`;
  $("feedbackYourAnswer").textContent = isCorrect ? "" : `自分の答え: ${input}年`;
  $("feedbackGoro").textContent = q.goro ? `語呂: ${q.goro}` : "";
}

function renderResult(session) {
  const percent = Math.round((session.correct / session.count) * 100);
  $("resultPercent").textContent = `${percent}%`;
  $("resultScore").textContent = `${session.correct}/${session.count}`;
  $("againButton").textContent = `もう一回${session.count}問`;
  $("scoreFill").style.width = `${percent}%`;
  $("resultMessage").textContent = percent === 100 ? "満点マスター！" : percent >= 90 ? "目標クリア！" : percent >= 80 ? "合格ラインクリア！" : "あと少しで合格";
  const wrong = session.answers.filter((a) => !a.correct);
  $("retryWrongButton").disabled = wrong.length === 0;
  $("wrongList").innerHTML = wrong.length
    ? wrong.map((a) => {
      const q = getQuestion(a.questionId);
      return `<div class="wrong-item"><strong>${escapeHtml(q.event)}</strong><span>正解 ${q.year}年 / 自分 ${a.input}年</span></div>`;
    }).join("")
    : `<p class="muted">まちがいはありません。</p>`;
  if (percent >= 90) runConfetti(percent === 100);
}

function renderRecords() {
  renderCalendar($("recordCalendar"));
  $("recordStreak").textContent = `連続 ${calculateStreak()} 日`;
  $("sessionHistory").innerHTML = sessions.length
    ? sessions.slice(-8).reverse().map((s) => {
      const percent = Math.round((s.correct / s.count) * 100);
      return `<div class="history-row"><span>${formatDateTime(s.date)} ${escapeHtml(s.label)}</span><strong>${percent}%</strong></div>`;
    }).join("")
    : `<p class="muted">まだ記録はありません。</p>`;
  $("masterList").innerHTML = TESTS.map((test) => {
    const mastered = questions.filter((q) => q.round === test.round && stats[q.id]?.mastered).length;
    return `<div class="master-row"><span>${test.label}</span><strong>${mastered}/30</strong></div>`;
  }).join("");
}

function renderCalendar(container) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const stamped = new Set(sessions.map((s) => localDateKey(new Date(s.date))));
  const week = ["日", "月", "火", "水", "木", "金", "土"];
  let html = week.map((d) => `<div class="weekday">${d}</div>`).join("");
  for (let i = 0; i < first.getDay(); i += 1) html += `<div></div>`;
  for (let day = 1; day <= last.getDate(); day += 1) {
    const date = new Date(year, month, day);
    const stampedClass = stamped.has(localDateKey(date)) ? " stamped" : "";
    html += `<div class="day${stampedClass}">${stampedClass ? "★" : day}</div>`;
  }
  container.innerHTML = html;
}

function weightedPick(pool, count) {
  const remaining = [...pool];
  const selected = [];
  while (selected.length < count && remaining.length) {
    const weights = remaining.map((q) => {
      const s = stats[q.id] || {};
      const wrong = Math.max(0, (s.attempts || 0) - (s.correct || 0));
      if (s.mastered) return 0.2;
      return 1 + wrong * 2 + (s.lastCorrect === false ? 3 : 0);
    });
    const total = weights.reduce((sum, w) => sum + w, 0);
    let pick = Math.random() * total;
    let index = 0;
    for (; index < weights.length; index += 1) {
      pick -= weights[index];
      if (pick <= 0) break;
    }
    selected.push(remaining.splice(Math.min(index, remaining.length - 1), 1)[0]);
  }
  return selected;
}

function runConfetti(isPerfect) {
  const canvas = $("confetti");
  const ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.floor(rect.width * ratio);
  canvas.height = Math.floor(rect.height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  const colors = isPerfect ? ["#e0a824", "#d44932", "#2f9e6d", "#2b6ea6"] : ["#2f9e6d", "#e0a824", "#ffffff"];
  const pieces = Array.from({ length: isPerfect ? 140 : 90 }, () => ({
    x: Math.random() * rect.width,
    y: -20 - Math.random() * rect.height * 0.5,
    r: 4 + Math.random() * 7,
    color: colors[Math.floor(Math.random() * colors.length)],
    vx: -2 + Math.random() * 4,
    vy: 2 + Math.random() * 4,
    spin: Math.random() * Math.PI
  }));
  let frame = 0;
  function draw() {
    frame += 1;
    ctx.clearRect(0, 0, rect.width, rect.height);
    for (const p of pieces) {
      p.x += p.vx;
      p.y += p.vy;
      p.spin += 0.12;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.spin);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.7);
      ctx.restore();
    }
    if (frame < 150) requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, rect.width, rect.height);
  }
  draw();
}

async function handleFileLoad(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const doc = JSON.parse(await file.text());
    applyQuestions(doc, true);
    showDataMessage("問題データを差し替えました。", false);
  } catch (error) {
    showDataMessage(`読み込み失敗: ${error.message}`, true);
  } finally {
    event.target.value = "";
  }
}

function exportData() {
  const bundle = {
    version: "2026-07-08",
    exportedAt: new Date().toISOString(),
    [STORAGE.questions]: questionDoc,
    [STORAGE.stats]: stats,
    [STORAGE.sessions]: sessions,
    [STORAGE.settings]: settings
  };
  $("dataText").value = JSON.stringify(bundle, null, 2);
  showDataMessage("JSONを書き出しました。", false);
}

function importData() {
  try {
    const bundle = JSON.parse($("dataText").value);
    const doc = bundle[STORAGE.questions] || bundle.questions || bundle;
    const errors = validateQuestionDoc(doc);
    if (errors.length) throw new Error(errors.join("\n"));
    questionDoc = doc;
    questions = [...doc.questions].sort((a, b) => a.id - b.id);
    stats = bundle[STORAGE.stats] || {};
    sessions = Array.isArray(bundle[STORAGE.sessions]) ? bundle[STORAGE.sessions] : [];
    settings = normalizeSettings(bundle[STORAGE.settings] || settings);
    ensureStats();
    saveAll();
    syncSettingsControls();
    renderAll();
    showDataMessage("インポートしました。", false);
    $("dataStatus").textContent = questionDoc.title || "問題120問";
  } catch (error) {
    showDataMessage(`インポート失敗: ${error.message}`, true);
  }
}

function clearAllData() {
  if (!window.confirm("保存データを全消去しますか？")) return;
  Object.values(STORAGE).forEach((key) => localStorage.removeItem(key));
  stats = {};
  sessions = [];
  settings = { order: "ordered", questionCount: 30, roundSegment: "first" };
  syncSettingsControls();
  loadInitialQuestions().then(() => {
    showDataMessage("保存データを消去しました。サンプルを読み込み直しました。", false);
  });
}

function showDataMessage(message, isError) {
  const el = $("dataMessage");
  el.textContent = message;
  el.style.color = isError ? "#9c2c1d" : "#60736e";
}

function saveAll() {
  localStorage.setItem(STORAGE.questions, JSON.stringify(questionDoc));
  saveStats();
  saveSessions();
  saveSettings();
}

function saveStats() {
  localStorage.setItem(STORAGE.stats, JSON.stringify(stats));
}

function saveSessions() {
  localStorage.setItem(STORAGE.sessions, JSON.stringify(sessions));
}

function saveSettings() {
  localStorage.setItem(STORAGE.settings, JSON.stringify(settings));
}

function normalizeSettings(source) {
  const next = { order: "ordered", questionCount: 30, roundSegment: "first", ...source };
  next.order = next.order === "shuffle" ? "shuffle" : "ordered";
  next.questionCount = Number(next.questionCount) === 15 ? 15 : 30;
  next.roundSegment = next.roundSegment === "second" ? "second" : "first";
  if (Number.isFinite(Number(next.bestCombo))) {
    next.bestCombo = Number(next.bestCombo);
  }
  return next;
}

function syncSettingsControls() {
  document.querySelectorAll("input[name='order']").forEach((radio) => {
    radio.checked = radio.value === settings.order;
  });
  document.querySelectorAll("input[name='questionCount']").forEach((radio) => {
    radio.checked = Number(radio.value) === settings.questionCount;
  });
  document.querySelectorAll("input[name='roundSegment']").forEach((radio) => {
    radio.checked = radio.value === settings.roundSegment;
  });
}

function getQuestionCount() {
  return Number(settings.questionCount) === 15 ? 15 : 30;
}

function getRoundSegment() {
  return settings.roundSegment === "second" ? "second" : "first";
}

function readJson(key, fallback) {
  try {
    const text = localStorage.getItem(key);
    return text ? JSON.parse(text) : fallback;
  } catch {
    return fallback;
  }
}

function getQuestion(id) {
  return questions.find((q) => q.id === id);
}

function shuffle(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function showView(id) {
  views.forEach((viewId) => $(viewId).classList.toggle("active", viewId === id));
  window.scrollTo({ top: 0, behavior: "instant" });
}

function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function localDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function calculateStreak() {
  const stamped = new Set(sessions.map((s) => localDateKey(new Date(s.date))));
  let date = startOfLocalDay(new Date());
  let count = 0;
  while (stamped.has(localDateKey(date))) {
    count += 1;
    date = new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1);
  }
  return count;
}

function formatDate(dateText) {
  const date = new Date(`${dateText}T00:00:00+09:00`);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatDateTime(iso) {
  const date = new Date(iso);
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}
