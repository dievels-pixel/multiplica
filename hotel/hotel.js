"use strict";

const upgrades = [
  { key: "rooms", name: "Habitaciones", action: "Construir habitación", icon: "🛏️", cost: 24, effect: "Dos plazas y más ingresos por estancia.", space: true },
  { key: "dining", name: "Comedores", action: "Construir comedor", icon: "🍽️", cost: 30, effect: "Uno por cada 4 huéspedes.", space: true },
  { key: "baths", name: "Baños", action: "Construir baño", icon: "🚿", cost: 26, effect: "Uno por cada 4 huéspedes.", space: true },
  { key: "staff", name: "Empleados", action: "Contratar empleado", icon: "🛎️", cost: 34, effect: "Uno por cada 6 huéspedes. Reduce desgaste." },
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
const defaults = { coins: 20, stays: 0, wear: 0, rooms: 1, dining: 0, baths: 1, staff: 1, expansions: 0, table: 0, streak: 0, gifts: 0, incident: 0, reputation: 1, stars: 1, prestige: 0 };
const storageKey = "hotel-multiplica-v1";
const seconds = 5;
const levels = [
  { target: null, gain: 24, lateLoss: 0, missLoss: 28 },
  { target: 4, gain: 23, lateLoss: 10, missLoss: 32 },
  { target: 3, gain: 21, lateLoss: 14, missLoss: 36 },
  { target: 2, gain: 19, lateLoss: 18, missLoss: 40 },
  { target: 1, gain: 15, lateLoss: 24, missLoss: 45 },
];
const prizes = ["🏊 Piscina", "🗿 Estatua", "🌴 Jardín tropical"];
const disasters = [
  "Se atascó una ducha y se inundó el pasillo.",
  "Se quemaron las tostadas y hubo que abrir las ventanas.",
  "Se extraviaron unas maletas y hubo que buscarlas.",
  "Se derramó zumo en el vestíbulo.",
];
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
let answered = true;
let startedAt = 0;
let frame;
const timer = byId("timer");
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
  result.gifts = Math.min(prizes.length, result.gifts);
  result.stars = Math.min(5, result.stars);
  result.prestige = Math.min(100, result.prestige);
  result.reputation = Math.max(result.stars, Math.min(5, result.reputation));
  result.incident = Math.min(36, result.incident);
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

function occupancy() {
  const demand = 2 + Math.floor(2 * (Math.sqrt(1 + state.stays / 2) - 1));
  const guests = Math.min(demand, state.rooms * 2);
  return {
    guests,
    waitlist: Math.min(6, demand - guests),
    dining: Math.max(0, Math.ceil(guests / 4) - state.dining),
    baths: Math.max(0, Math.ceil(guests / 4) - state.baths),
    staff: Math.max(0, Math.ceil(guests / 6) - state.staff),
  };
}

function satisfaction() {
  const needs = occupancy();
  return Math.max(15, Math.min(100, Math.round(100 - needs.waitlist * 3 - Math.min(32, needs.dining * 10 + needs.baths * 11 + needs.staff * 12)
    - Math.round(state.wear / 2) - state.incident + state.gifts * 3)));
}

function updatePrestige(correct, milliseconds) {
  const previousStars = state.stars;
  const level = levels[previousStars - 1];
  const fast = level.target === null || milliseconds <= level.target * 1000;
  const change = correct ? (fast ? level.gain : -level.lateLoss) : -level.missLoss;
  const oldPrestige = state.prestige;
  state.prestige = Math.max(0, Math.min(100, oldPrestige + change));
  const applied = state.prestige - oldPrestige;
  if (state.prestige === 100 && previousStars < 5) {
    state.stars++;
    state.prestige = 40;
  } else if (state.prestige === 0 && change < 0 && previousStars > 1) {
    state.stars--;
    state.prestige = 55;
  }
  return applied;
}

function earnings(fraction = 0) {
  const base = 12 + Math.min(state.rooms - 1, 12) * 2 + (state.reputation - 1) * 4;
  const maximum = Math.max(2, Math.floor(satisfaction() / 8) + state.reputation - 1);
  return { base, tip: 1 + Math.round((maximum - 1) * (1 - Math.min(1, fraction))) };
}

function price(upgrade) {
  return Math.round((upgrade.cost + (state[upgrade.key] - defaults[upgrade.key]) * 12)
    * (1 + (state.reputation - 1) * .23));
}

function paintTimer(fraction, waiting = false) {
  const remaining = Math.max(0, seconds * (1 - fraction));
  timer.firstElementChild.style.transform = "scaleX(" + remaining / seconds + ")";
  const target = levels[state.stars - 1].target;
  timer.dataset.phase = fraction >= 1 ? "slow" : target !== null && fraction > target / seconds ? "medium" : "fast";
  timer.dataset.target = target === null ? "none" : "marked";
  timer.style.setProperty("--target", (target / seconds * 100) + "%");
  timer.setAttribute("aria-valuenow", Math.ceil(remaining));
  byId("time-text").textContent = waiting ? seconds + " s por huésped" :
    (remaining ? (Math.ceil(remaining * 10) / 10).toLocaleString("es-ES") + " s" : "Propina mínima");
  const pay = earnings(fraction);
  byId("reward").textContent = pay.base + " monedas + " + pay.tip + " de propina";
}

function tick(now) {
  const fraction = elapsed(now);
  paintTimer(fraction);
  if (fraction < 1) frame = requestAnimationFrame(tick);
}

function elapsed(now = performance.now()) {
  return Math.min(1, Math.max(0, (now - startedAt) / (seconds * 1000)));
}

function shortage(quantity, singular, plural) {
  return quantity === 1 ? "Falta 1 " + singular + "." : "Faltan " + quantity + " " + plural + ".";
}

function refresh() {
  const happy = Math.min(100, satisfaction());
  const stars = state.stars;
  const needs = occupancy();
  byId("coins").textContent = state.coins;
  byId("happiness").textContent = happy + "%";
  byId("stays").textContent = state.stays;
  const space = freeSpace();
  byId("space").textContent = space + (space === 1 ? " espacio libre" : " espacios libres");
  byId("rating").textContent = stars === 1 ? "1 estrella" : stars + " estrellas";
  byId("stars").textContent = "★".repeat(stars) + "☆".repeat(5 - stars);
  byId("prestige").value = state.prestige;
  byId("prestige-value").textContent = state.prestige + "%";
  const target = levels[stars - 1].target;
  byId("pace").textContent = target === null ? "Cada acierto suma prestigio, aunque se agote el tiempo." :
    "Acierta en " + target + (target === 1 ? " segundo" : " segundos") + (stars === 5 ? " para mantener el nivel." : " o menos para ganar prestigio.");
  byId("goal").textContent = "Reputación histórica " + state.reputation + "/5 · Cuanto más alta, mayores ingresos y precios.";
  byId("streak").textContent = "🔥 Racha: " + state.streak + " · Próximo premio a los " + (Math.floor(state.streak / 10) + 1) * 10 + " aciertos.";
  byId("capacity").textContent = needs.guests + " huéspedes en " + state.rooms * 2 + " plazas";
  const complaints = [];
  if (needs.waitlist) complaints.push("«¡No quedan camas!» Construye habitaciones.");
  if (needs.dining) complaints.push("«¡Qué cola para desayunar!» " + shortage(needs.dining, "comedor", "comedores"));
  if (needs.baths) complaints.push("«¡Los baños están ocupados!» " + shortage(needs.baths, "baño", "baños"));
  if (needs.staff) complaints.push("«¡Nadie nos atiende!» " + shortage(needs.staff, "empleado", "empleados"));
  const list = byId("complaints");
  list.replaceChildren(...(complaints.length ? complaints : ["Los huéspedes tienen todo lo que necesitan."]).map((message) => {
    const item = document.createElement("li");
    item.textContent = message;
    return item;
  }));
  byId("guest-request").textContent = complaints[0]?.split("»")[0]?.concat("»") || guests[guestIndex % guests.length][2];
  const awards = byId("awards");
  if (awards.children.length !== state.gifts) {
    const prize = document.createElement("span");
    prize.className = "award";
    for (let index = awards.children.length; index < state.gifts; index++) {
      const badge = prize.cloneNode();
      badge.textContent = prizes[index];
      awards.append(badge);
    }
  }
  awards.hidden = !state.gifts;
  byId("condition").textContent = state.wear === 0 ? "Todo limpio. Cada estancia desgasta un poco el hotel." :
    "Desgaste: " + state.wear + "/36. Limpia para recuperar satisfacción.";
  const cleaning = 10 + state.reputation * 2;
  clean.textContent = "🪙 " + cleaning;
  clean.setAttribute("aria-label", "Limpiar el hotel por " + cleaning + " monedas");
  clean.disabled = state.wear === 0 || state.coins < cleaning;

  for (const upgrade of upgrades) {
    const { count, button, row, inventory } = cards.get(upgrade.key);
    const cost = price(upgrade);
    const needsSpace = upgrade.space && space <= 0;
    const quantity = state[upgrade.key];
    count.textContent = upgrade.name + " · " + quantity;
    row.dataset.shortage = Boolean(needs[upgrade.key]);
    if (inventory.dataset.quantity !== String(quantity)) {
      const oldCount = Number(inventory.dataset.quantity || quantity);
      inventory.dataset.quantity = quantity;
      inventory.replaceChildren();
      for (let index = 0; index < Math.min(6, quantity); index++) {
        const item = document.createElement("span");
        item.textContent = upgrade.key === "staff" ? "🧑‍💼" : upgrade.icon;
        inventory.append(item);
      }
      if (quantity > 6) {
        const extra = document.createElement("b");
        extra.textContent = "+" + (quantity - 6);
        inventory.append(extra);
      }
      if (quantity > oldCount && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
        inventory.lastElementChild?.animate([
          { transform: "translateY(6px) scale(.75)", opacity: .3 },
          { transform: "translateY(-5px) scale(1.25)", opacity: 1 },
          { transform: "translateY(0) scale(1)", opacity: 1 },
        ], { duration: 440, easing: "ease-out" });
      }
    }
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
  table.disabled = true;
  const [avatar, name] = guests[guestIndex % guests.length];
  byId("avatar").textContent = avatar;
  byId("guest-name").textContent = name;

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
  refresh();
  startedAt = performance.now();
  cancelAnimationFrame(frame);
  tick(startedAt);
  if (focus) question.focus();
}

function answer(value) {
  if (answered) return;
  const now = performance.now();
  const fraction = elapsed(now);
  cancelAnimationFrame(frame);
  paintTimer(fraction);
  answered = true;
  table.disabled = false;
  const correct = value === current.product;
  const previousStars = state.stars;
  let message;
  let event = "";
  if (correct) {
    const { base, tip } = earnings(fraction);
    state.coins += base + tip;
    state.stays++;
    state.streak++;
    state.incident = Math.max(0, state.incident - 3);
    const workload = Math.floor(occupancy().guests / Math.max(1, state.staff * 3));
    state.wear = Math.min(36, state.wear + Math.max(1, 1 + workload - Math.min(2, state.staff)));
    message = "¡Acierto! +" + base + " monedas y +" + tip + " de propina.";
    if (state.streak % 10 === 0) {
      if (state.gifts < prizes.length) {
        event = "¡Racha de " + state.streak + "! Los huéspedes te regalan: " + prizes[state.gifts++] + ".";
      } else {
        const bonus = base * 3;
        state.coins += bonus;
        event = "¡Racha de " + state.streak + "! Fiesta en el hotel: +" + bonus + " monedas.";
      }
    }
    next.textContent = "Siguiente huésped";
  } else {
    state.streak = 0;
    state.incident = Math.min(36, state.incident + 9);
    state.wear = Math.min(36, state.wear + 4);
    event = disasters[Math.floor(Math.random() * disasters.length)] + " Baja la satisfacción.";
    message = "Casi. " + current.a + " × " + current.b + " = " + current.product + ".";
    next.textContent = "Otra multiplicación";
  }
  const prestige = updatePrestige(correct, now - startedAt);
  const stars = state.stars;
  const reputation = state.reputation;
  state.reputation = Math.max(reputation, stars);
  if (stars > previousStars) event += " ¡Subes a " + stars + " estrellas!";
  if (stars < previousStars) event += " El hotel baja a " + stars + (stars === 1 ? " estrella." : " estrellas.");
  if (state.reputation > reputation) event += " Aumentan los ingresos y los precios.";
  if (prestige) message += " " + (prestige > 0 ? "+" : "−") + Math.abs(prestige) + " de prestigio.";
  byId("event").textContent = event.trim();
  byId("event").dataset.kind = correct && stars >= previousStars ? "good" : "bad";
  byId("feedback").textContent = message;
  save();
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
  const inventory = document.createElement("div");
  inventory.className = "inventory";
  inventory.setAttribute("aria-hidden", "true");
  details.append(count, effect, inventory);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "purchase";
  button.addEventListener("click", () => purchase(upgrade));
  row.append(icon, details, button);
  byId("upgrades").append(row);
  cards.set(upgrade.key, { count, button, row, inventory });
}

clean.addEventListener("click", () => {
  const cost = 10 + state.reputation * 2;
  if (!state.wear || state.coins < cost) return;
  state.coins -= cost;
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
paintTimer(0, true);
question.textContent = "¿Listo para abrir?";
next.textContent = "Empezar turno";
next.hidden = false;
byId("guest-name").textContent = "Recepción cerrada";
byId("guest-request").textContent = "Pulsa Empezar turno cuando estés listo.";
byId("avatar").textContent = "🛎️";
