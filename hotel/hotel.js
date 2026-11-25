"use strict";

const upgrades = [
  { key: "rooms", name: "Habitaciones", action: "Construir habitación", icon: "🛏️", cost: 24, effect: "Más camas y más monedas por acierto.", space: true },
  { key: "dining", name: "Comedores", action: "Construir comedor", icon: "🍽️", cost: 30, effect: "Menos colas para desayunar.", space: true },
  { key: "baths", name: "Baños", action: "Construir baño", icon: "🚿", cost: 26, effect: "Menos esperas para ducharse.", space: true },
  { key: "staff", name: "Empleados", action: "Contratar empleado", icon: "🛎️", cost: 34, effect: "Más atención y menos desgaste." },
  { key: "expansions", name: "Ampliaciones", action: "Ampliar hotel", icon: "🧱", cost: 40, effect: "Abre 3 espacios para construir." },
];
const guests = [
  ["👩🏽", "Lola", "¡Espero que la cama sea cómoda!"],
  ["🧔🏻", "Leo", "¿Dónde se desayuna? ¡Tengo hambre!"],
  ["👵🏼", "Carmen", "Me vendría bien una ducha después del viaje."],
  ["👨🏾", "Hugo", "¡Hola! ¿Alguien puede ayudarme con la maleta?"],
  ["👩🏻", "Aitana", "¡Qué ganas de descansar en mi habitación!"],
  ["🧑🏼", "Nico", "Ojalá pueda desayunar antes de ir a la piscina."],
];
const defaults = { coins: 20, stays: 0, wear: 0, rooms: 1, dining: 0, baths: 1, staff: 1, expansions: 0, table: 0 };
const storageKey = "hotel-multiplica-v1";
const cleanCost = 12;
const numbers = Array.from({ length: 12 }, (_, index) => index + 1);
const byId = (id) => document.getElementById(id);
const table = byId("table");
const question = byId("question");
const answers = byId("answers");
const next = byId("next");
const clean = byId("clean");
const cards = new Map();
const decks = new Map();
const state = load();
let current;
let answered = false;
let guestIndex = state.stays;

function load() {
  const result = { ...defaults };
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    for (const [key, minimum] of Object.entries(defaults)) {
      const value = saved?.[key];
      const min = key === "coins" ? 0 : minimum;
      if (Number.isSafeInteger(value) && value >= min) result[key] = value;
    }
  } catch {
    // The hotel can still be played without local storage.
  }
  result.table = Math.min(12, result.table);
  result.wear = Math.min(36, result.wear);
  return result;
}

function save() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // The hotel remains playable for this session.
  }
}

function freeSpace() {
  return 4 + 3 * state.expansions - state.rooms - state.dining - state.baths;
}

function satisfaction() {
  const demand = Math.min(15, Math.floor(state.stays / 5));
  const comfort = 48 + state.rooms * 4 + state.dining * 12 + state.baths * 8 + state.staff * 9 + state.expansions * 4;
  return Math.max(20, Math.min(100, comfort - demand * 2 - state.wear));
}

function earnings() {
  return { base: 12 + Math.min(state.rooms - 1, 8) * 2, tip: Math.floor(satisfaction() / 10) };
}

function price(upgrade) {
  return upgrade.cost + (state[upgrade.key] - defaults[upgrade.key]) * 8;
}

function refresh() {
  const happy = satisfaction();
  const reward = earnings();
  const improvementCount = upgrades.reduce((sum, upgrade) => sum + state[upgrade.key] - defaults[upgrade.key], 0);
  const stars = Math.min(5, 1 + Math.floor(improvementCount / 2));
  byId("coins").textContent = state.coins;
  byId("happiness").textContent = happy + "%";
  byId("stays").textContent = state.stays;
  byId("space").textContent = freeSpace() + " espacio(s) libre(s)";
  byId("rating").textContent = stars === 1 ? "1 estrella" : stars + " estrellas";
  byId("stars").textContent = "★".repeat(stars) + "☆".repeat(5 - stars);
  byId("goal").textContent = stars === 5 ? "¡Tu hotel ya tiene cinco estrellas!" : "Cada dos mejoras, ganas una estrella.";
  byId("reward").textContent = "Por acertar ahora: " + reward.base + " monedas + " + reward.tip + " de propina.";
  byId("condition").textContent = state.wear === 0 ? "Todo limpio. Cada estancia desgasta un poco el hotel." :
    "El desgaste resta " + state.wear + " puntos de satisfacción. Limpia para recuperarlos.";
  clean.disabled = state.wear === 0 || state.coins < cleanCost;

  for (const upgrade of upgrades) {
    const { count, button } = cards.get(upgrade.key);
    const cost = price(upgrade);
    const needsSpace = upgrade.space && freeSpace() <= 0;
    count.textContent = upgrade.name + " · " + state[upgrade.key];
    button.textContent = needsSpace ? "Sin espacio" : "🪙 " + cost;
    button.setAttribute("aria-label", upgrade.action + (needsSpace ? ". Amplía el hotel para tener espacio." : " por " + cost + " monedas"));
    button.disabled = state.coins < cost || needsSpace;
  }
}

function purchase(upgrade) {
  const cost = price(upgrade);
  if (state.coins < cost || (upgrade.space && freeSpace() <= 0)) return;
  state.coins -= cost;
  state[upgrade.key]++;
  save();
  refresh();
  byId("hotel-message").textContent = upgrade.action + ": ¡hecho! Satisfacción " + satisfaction() + "%.";
}

function shuffle(values) {
  for (let index = values.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [values[index], values[other]] = [values[other], values[index]];
  }
  return values;
}

function drawQuestion(mode) {
  if (!decks.get(mode)?.length) {
    const factors = mode ? [mode] : numbers;
    decks.set(mode, shuffle(factors.flatMap((a) => numbers.map((b) => ({ a, b, product: a * b })))));
  }
  return decks.get(mode).pop();
}

function choices({ a, b, product }) {
  const wrong = new Set([b - 2, b - 1, b + 1, b + 2]
    .filter((factor) => factor >= 1 && factor <= 12).map((factor) => a * factor));
  for (const offset of [-1, 1, -2, 2, -3, 3]) {
    if (wrong.size >= 3) break;
    if (product + offset >= 1 && product + offset <= 144) wrong.add(product + offset);
  }
  return shuffle([product, ...shuffle([...wrong]).slice(0, 3)]);
}

function showQuestion(focus = true) {
  current = drawQuestion(state.table);
  answered = false;
  const [avatar, name, request] = guests[guestIndex % guests.length];
  byId("avatar").textContent = avatar;
  byId("guest-name").textContent = name;
  byId("guest-request").textContent = request;
  question.textContent = current.a + " × " + current.b + " = ?";
  byId("feedback").textContent = "";
  next.hidden = true;
  answers.replaceChildren();
  for (const [index, value] of choices(current).entries()) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "answer";
    button.dataset.value = value;
    const key = document.createElement("kbd");
    key.textContent = index + 1;
    key.setAttribute("aria-hidden", "true");
    button.append(key, String(value));
    button.addEventListener("click", () => answer(value));
    answers.append(button);
  }
  if (focus) question.focus();
}

function answer(value) {
  if (answered) return;
  answered = true;
  const correct = value === current.product;
  if (correct) {
    const { base, tip } = earnings();
    state.coins += base + tip;
    state.stays++;
    state.wear = Math.min(36, state.wear + Math.max(1, 4 - state.staff));
    byId("feedback").textContent = "¡Acierto! +" + base + " monedas y +" + tip + " de propina.";
    next.textContent = "Siguiente huésped";
    save();
  } else {
    byId("feedback").textContent = "Casi. " + current.a + " × " + current.b + " = " + current.product + ". Prueba otra.";
    next.textContent = "Otra multiplicación";
  }
  for (const button of answers.children) {
    const option = Number(button.dataset.value);
    button.disabled = true;
    if (option === current.product) button.classList.add("correct");
    else if (option === value) button.classList.add("incorrect");
  }
  refresh();
  next.hidden = false;
  next.focus();
}

for (const number of numbers) table.add(new Option("Tabla del " + number, number));
table.value = String(state.table);
table.addEventListener("change", () => {
  state.table = Number(table.value);
  save();
  guestIndex = state.stays;
  showQuestion();
});

for (const upgrade of upgrades) {
  const row = document.createElement("div");
  row.className = "upgrade";
  const icon = document.createElement("span");
  icon.className = "upgrade-icon";
  icon.textContent = upgrade.icon;
  icon.setAttribute("aria-hidden", "true");
  const details = document.createElement("div");
  const count = document.createElement("strong");
  const effect = document.createElement("p");
  effect.textContent = upgrade.effect;
  details.append(count, effect);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "purchase";
  button.addEventListener("click", () => purchase(upgrade));
  row.append(icon, details, button);
  byId("upgrades").append(row);
  cards.set(upgrade.key, { count, button });
}

clean.setAttribute("aria-label", "Limpiar el hotel por 12 monedas");
clean.addEventListener("click", () => {
  if (!state.wear || state.coins < cleanCost) return;
  state.coins -= cleanCost;
  state.wear = 0;
  save();
  refresh();
  byId("hotel-message").textContent = "¡Hotel limpio! Satisfacción " + satisfaction() + "%.";
});

next.addEventListener("click", () => {
  if (!answered) return;
  guestIndex = state.stays;
  showQuestion();
});

document.addEventListener("keydown", (event) => {
  if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.target === table) return;
  if (!answered && /^[1-4]$/.test(event.key)) {
    event.preventDefault();
    answers.children[Number(event.key) - 1].click();
  } else if (answered && event.key === "Enter" && event.target.tagName !== "BUTTON") {
    event.preventDefault();
    next.click();
  }
});

refresh();
showQuestion(false);
