"use strict";

const tableNumbers = Array.from({ length: 12 }, (_, index) => index + 1);
const roundLength = 10;
const recordKey = "multiplica-al-vuelo-record";

const byId = (id) => document.getElementById(id);
const answers = byId("answers");
const problem = byId("problem");
const next = byId("next");
let selectedTable = 0;
let questions;
let index;
let score;
let streak;
let bestStreak;
let mistakes;
let answered;
let finished;
let record = 0;

try {
  const saved = Number(localStorage.getItem(recordKey));
  if (Number.isInteger(saved) && saved >= 0 && saved <= roundLength) record = saved;
} catch {
  // The game still runs if browser storage is unavailable.
}
byId("record").textContent = record + "/" + roundLength;

function shuffle(items) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function makeQuestions(table) {
  const leftFactors = table ? Array(roundLength).fill(table) : shuffle([...tableNumbers]);
  const rightFactors = shuffle([...tableNumbers]);
  return leftFactors.slice(0, roundLength).map((a, position) => ({
    a,
    b: rightFactors[position],
    correct: a * rightFactors[position],
  }));
}

function makeOptions({ a, b, correct }) {
  const nearbyFactors = [b - 2, b - 1, b + 1, b + 2];
  const alternatives = new Set(nearbyFactors.filter((n) => n >= 1 && n <= 12).map((n) => n * a));
  for (const offset of [-1, 1, -2, 2, -3, 3]) {
    if (alternatives.size >= 3) break;
    const candidate = correct + offset;
    if (candidate >= 1 && candidate <= 144) alternatives.add(candidate);
  }
  return shuffle([correct, ...shuffle([...alternatives]).slice(0, 3)]);
}

function showQuestion(moveFocus) {
  answered = false;
  const { a, b } = questions[index];
  byId("progress-label").textContent = "Pregunta " + (index + 1) + " de " + roundLength;
  problem.replaceChildren(a + " × " + b + " = ");
  const unknown = document.createElement("span");
  unknown.textContent = "?";
  problem.append(unknown);
  byId("message").textContent = "";
  next.hidden = true;
  answers.replaceChildren();
  for (const [position, number] of makeOptions(questions[index]).entries()) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "answer";
    button.dataset.number = number;
    const shortcut = document.createElement("kbd");
    shortcut.textContent = position + 1;
    shortcut.setAttribute("aria-hidden", "true");
    button.append(shortcut, String(number));
    button.addEventListener("click", () => answer(number));
    answers.append(button);
  }
  if (moveFocus) problem.focus();
}

function updateStreak() {
  byId("streak").lastChild.textContent = " Racha " + streak;
}

function startRound(table, moveFocus = true) {
  selectedTable = table;
  questions = makeQuestions(table);
  index = score = streak = bestStreak = 0;
  mistakes = [];
  finished = false;
  byId("progress").value = 0;
  byId("summary").hidden = true;
  byId("round").hidden = false;
  for (const button of document.querySelectorAll("[data-table]")) {
    button.setAttribute("aria-pressed", Number(button.dataset.table) === table);
  }
  updateStreak();
  showQuestion(moveFocus);
}

function answer(number) {
  if (answered || finished) return;
  answered = true;
  const question = questions[index];
  if (number === question.correct) {
    score++;
    streak++;
    bestStreak = Math.max(bestStreak, streak);
    byId("message").textContent = streak >= 3 ? "¡En racha! Llevas " + streak + " seguidas." : "¡Correcto!";
  } else {
    streak = 0;
    mistakes.push(question);
    byId("message").textContent = "Casi. La respuesta es " + question.correct + ".";
  }
  for (const button of answers.children) {
    const value = Number(button.dataset.number);
    button.disabled = true;
    if (value === question.correct) button.classList.add("correct");
    else if (value === number) button.classList.add("incorrect");
  }
  updateStreak();
  byId("progress").value = index + 1;
  next.textContent = index + 1 === roundLength ? "Ver resultado" : "Siguiente";
  next.hidden = false;
  next.focus();
}

function advance() {
  if (!answered || finished) return;
  index++;
  if (index < roundLength) {
    showQuestion(true);
    return;
  }
  finished = true;
  const newRecord = score > record;
  if (newRecord) {
    record = score;
    byId("record").textContent = record + "/" + roundLength;
    try {
      localStorage.setItem(recordKey, String(record));
    } catch {
      // The score still appears in this session.
    }
  }
  byId("progress-label").textContent = "Ronda completa";
  byId("round").hidden = true;
  byId("summary").hidden = false;
  byId("result").textContent = "¡" + score + " de " + roundLength + "!";
  byId("result-note").textContent = (newRecord ? "¡Nuevo récord! " : "") +
    "Tu mejor racha fue de " + bestStreak + (bestStreak === 1 ? " acierto." : " aciertos.");
  const review = byId("review");
  review.replaceChildren();
  for (const { a, b, correct } of mistakes) {
    const item = document.createElement("li");
    item.textContent = a + " × " + b + " = " + correct;
    review.append(item);
  }
  byId("result").focus();
}

for (const number of tableNumbers) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.table = number;
  button.textContent = number;
  button.setAttribute("aria-label", "Tabla del " + number);
  byId("tables").append(button);
}

for (const button of document.querySelectorAll("[data-table]")) {
  button.addEventListener("click", () => {
    const table = Number(button.dataset.table);
    if (table !== selectedTable) startRound(table);
  });
}

next.addEventListener("click", advance);
byId("again").addEventListener("click", () => startRound(selectedTable));
document.addEventListener("keydown", (event) => {
  if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
  if (!answered && !finished && /^[1-4]$/.test(event.key)) {
    event.preventDefault();
    answers.children[Number(event.key) - 1].click();
  } else if (event.key === "Enter" && answered && !finished && event.target.tagName !== "BUTTON") {
    event.preventDefault();
    advance();
  }
});

startRound(0, false);
