import { BugEngine } from "./engine.js";
import { NATURAL_BUGS, makeHybrid, fillGenome } from "./genome.js";
import { createBugView, renderHero, baseStage, HYBRID_COUNT } from "./hero.js";
import { createOrgans, ORGANS } from "./organs.js";

const SEEN_KEY = "bugsynth.seenIntro";

const STORAGE_KEY = "bugsynth.hybrids";
const MAX_HYBRIDS = 6;
// пока для двух жуков есть и звук, и нарисованное тело
const PARENTS = NATURAL_BUGS.slice(0, 2);
const SAMPLES = ["longhorn", "cicada"];

// диагностика звука: ?fx=nocomp,noclip,notone,nolfo,nofm,nonoise,noreso,slow,nomut,nosample
const FX = new Set((new URLSearchParams(location.search).get("fx") || "").split(",").filter(Boolean));

let ctx = null;
let engine = null;
let hybrids = loadHybrids();
let active = PARENTS[0];
let view = null;
let organs = null;
// зажим у каждого жука свой: включил на одном, на других остаётся как было
const latchedBy = new Map();
let latched = false;
const DEFAULTS = { pitch: 0.5, filter: 0.85, dist: 0, reverb: 0.2, trill: 0, delay: 0, env: 0, detune: 0, glide: 0, scrub: 0 };
const params = { ...DEFAULTS };

const $ = (sel) => document.querySelector(sel);
const host = $("#host");
const bugEl = $("#bug");
const shake = $("#shake");
const intro = $("#intro");
const plaque = $("#plaque");
const plaqueName = $("#plaque-name");
const plaqueVal = $("#plaque-val");
const plaqueText = $("#plaque-text");

// вводная карточка: показываем, пока человек не нажал на жука; запоминаем, что уже видел
let introSeen = false;
try {
  introSeen = localStorage.getItem(SEEN_KEY) === "1";
} catch (_) {}
if (introSeen) intro.hidden = true;
function dismissIntro() {
  if (intro.hidden || intro.classList.contains("gone")) return;
  intro.classList.add("gone");
  setTimeout(() => (intro.hidden = true), 500);
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch (_) {}
}

// плашка органа: название, значение и что делает. На телефоне исчезает через секунду после отпускания.
let plaqueTimer = 0;
const FORMAT = {
  pitch: (v) => { const st = Math.round((v - 0.5) * 24); return `${st > 0 ? "+" : ""}${st} пт`; },
  filter: (v) => (v < 0.2 ? "закрыт" : v > 0.8 ? "открыт" : `${Math.round(v * 100)}%`),
};
function showPlaque(o, v, mode) {
  clearTimeout(plaqueTimer);
  if (mode === "end") {
    plaqueTimer = setTimeout(() => (plaque.hidden = true), 1100);
    return;
  }
  plaqueName.textContent = o.name;
  plaqueVal.textContent = o.toggle ? (v > 0.5 ? "включён" : "выключен") : (FORMAT[o.id] || ((x) => `${Math.round(x * 100)}%`))(v);
  plaqueText.textContent = o.hint;
  plaque.hidden = false;
  if (!intro.hidden) dismissIntro();
}
const toast = $("#toast");
const allBugs = () => [...PARENTS, ...hybrids];

// случайная особь из шести; пока есть неиспользованные, выбираем только из них
function pickDesign(existing) {
  const used = new Set(existing.map((h) => h.design));
  const free = [];
  for (let i = 1; i <= HYBRID_COUNT; i++) if (!used.has(i)) free.push(i);
  const pool = free.length ? free : Array.from({ length: HYBRID_COUNT }, (_, i) => i + 1);
  return pool[Math.floor(Math.random() * pool.length)];
}

// --- сохранение гибридов (если localStorage недоступен, просто не сохраняем) ---
function loadHybrids() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    const list = raw
      .filter(
        (h) =>
          h && h.id && h.genome && typeof h.genome === "object" && Array.isArray(h.samples) &&
          h.samples.length && h.samples.every((s) => SAMPLES.includes(s.name))
      )
      .map((h) => ({ ...h, genome: fillGenome(h.genome) }))
      .slice(0, MAX_HYBRIDS);
    // гибридам, сохранённым до появления нарисованных особей, назначаем особь случайно
    for (const h of list) if (!(h.design >= 1 && h.design <= HYBRID_COUNT)) h.design = pickDesign(list);
    return list;
  } catch (_) {
    return [];
  }
}
function saveHybrids() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(hybrids));
  } catch (_) {}
}

// --- звук ---
// На iPhone Web Audio молчит при включённом беззвучном режиме, пока страница не
// переключит аудиосессию на «воспроизведение». Приём не проверен на реальном устройстве.
function unlockAudioSession() {
  try {
    if (navigator.audioSession) navigator.audioSession.type = "playback";
  } catch (_) {}
  try {
    const rate = 8000;
    const n = rate / 10;
    const buf = new ArrayBuffer(44 + n);
    const v = new DataView(buf);
    const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    w(0, "RIFF");
    v.setUint32(4, 36 + n, true);
    w(8, "WAVEfmt ");
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 1, true);
    v.setUint32(24, rate, true);
    v.setUint32(28, rate, true);
    v.setUint16(32, 1, true);
    v.setUint16(34, 8, true);
    w(36, "data");
    v.setUint32(40, n, true);
    new Uint8Array(buf, 44).fill(128);
    const a = new Audio(URL.createObjectURL(new Blob([buf], { type: "audio/wav" })));
    a.loop = true;
    a.play().catch(() => {});
  } catch (_) {}
}

async function ensureAudio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    engine = new BugEngine(ctx, active, FX);
    for (const [k, v] of Object.entries(params)) engine.setParam(k, v);
    unlockAudioSession();
    engine.loading = engine.loadSamples(SAMPLES);
  }
  if (ctx.state !== "running") await ctx.resume();
  await engine.loading;
}

// --- дискомфорт: тело дёргается в такт звуку и набухает от эха ---
function stageFor(bug, dist) {
  const base = baseStage(bug);
  return base + dist * (3 - base);
}

function applyVisual() {
  view?.setStage(stageFor(active, params.dist));
  const r = params.reverb;
  bugEl.style.transform = `scale(${1 + r * 0.05}, ${1 + r * 0.11})`;
  bugEl.style.filter = r > 0.04 ? `drop-shadow(0 0 ${Math.round(r * 46)}px rgba(214, 120, 96, ${(r * 0.55).toFixed(2)}))` : "none";
}

let lastAmp = 0;
function frame() {
  requestAnimationFrame(frame);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const lvl = engine ? engine.level() : 0;
  const amp = reduce ? 0 : Math.min(1, lvl * 5);
  // сглаживаем, чтобы не рябило
  lastAmp += (amp - lastAmp) * 0.35;
  view?.setStrain(Math.min(1, lastAmp * 1.6));
  if (lastAmp < 0.01) {
    if (shake.style.transform) shake.style.transform = "";
    return;
  }
  const a = lastAmp;
  const dist = params.dist;
  const tx = (Math.random() - 0.5) * a * (5 + dist * 10);
  const ty = (Math.random() - 0.5) * a * (4 + dist * 8);
  const rot = (Math.random() - 0.5) * a * (0.8 + dist * 2.2);
  // «ему больно»: плечи чуть сжимаются, брюшко пульсирует
  shake.style.transform = `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) rotate(${rot.toFixed(2)}deg) scale(${(1 - a * 0.012).toFixed(3)}, ${(1 + a * 0.018).toFixed(3)})`;
}

// --- нажатие на тело ---
// held: палец (или пробел) сейчас на теле. Первое нажатие ждёт загрузки записей; если за это время
// палец уже отпустили, голос не запускаем, иначе звук залипал бы без пальца.
let held = 0;
async function press() {
  held++;
  dismissIntro();
  const wasPlaying = engine?.playing;
  await ensureAudio();
  if (latched && wasPlaying) {
    // при зажиме повторное нажатие гасит звук
    engine.stop();
    return;
  }
  if (!latched && held === 0) return;
  engine.start();
}

function release() {
  held = Math.max(0, held - 1);
  if (!engine || latched || held > 0) return;
  engine.stop();
}

function mount(bug) {
  engine?.stop();
  held = 0;
  // при смене жука ручки возвращаются в исходное положение
  if (bug !== active) {
    Object.assign(params, DEFAULTS);
    if (engine) for (const [k, v] of Object.entries(params)) engine.setParam(k, v);
  }
  active = bug;
  latched = latchedBy.get(bug.id) === true;
  engine?.setBug(bug);
  view = createBugView(bug);
  host.innerHTML = "";
  host.appendChild(view.svg);

  // зона нажатия: тело. Органы лежат выше и перехватывают касания себе.
  const [zx, zy, zrx, zry] = view.anchors.body;
  const zone = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
  zone.setAttribute("class", "zone");
  zone.setAttribute("cx", zx);
  zone.setAttribute("cy", zy);
  zone.setAttribute("rx", zrx);
  zone.setAttribute("ry", zry);
  zone.setAttribute("fill", "transparent");
  view.organs.insertBefore(zone, view.organs.firstChild);
  zone.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    try { zone.setPointerCapture(e.pointerId); } catch (_) {}
    press();
  });
  for (const type of ["pointerup", "pointercancel"]) zone.addEventListener(type, release);

  organs = createOrgans(view, (id, v) => {
    if (id === "latch") {
      latched = v > 0.5;
      latchedBy.set(active.id, latched);
      // сняли зажим: звук гаснет
      if (!latched && engine?.playing) engine.stop();
      return;
    }
    params[id] = v;
    engine?.setParam(id, v);
    if (id === "dist" || id === "reverb") applyVisual();
  }, showPlaque);
  for (const o of ORGANS) organs.set(o.id, o.id === "latch" ? (latched ? 1 : 0) : params[o.id]);
  applyVisual();
  renderShelf();
}

// --- лоток: смена и скрещивание ---
function renderShelf() {
  const shelf = $("#shelf");
  shelf.innerHTML = "";
  for (const b of allBugs()) {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "tile";
    tile.title = b.code;
    tile.setAttribute("aria-label", b.code);
    tile.setAttribute("aria-pressed", String(b === active));
    tile.innerHTML = renderHero(b) || "";
    tile.addEventListener("click", () => {
      if (b !== active) mount(b);
    });
    shelf.appendChild(tile);
  }
  $("#reset").hidden = hybrids.length === 0;
}

function say(text) {
  toast.textContent = text;
  clearTimeout(say.t);
  say.t = setTimeout(() => (toast.textContent = ""), 3500);
}

$("#breed").addEventListener("click", () => {
  if (hybrids.length >= MAX_HYBRIDS) {
    say(`Гибридов уже ${MAX_HYBRIDS}. Убери старых: приколотый жук внизу, два касания.`);
    return;
  }
  const nums = hybrids.map((h) => Number(h.id.replace("hyb-", "")) || 0);
  const child = makeHybrid(PARENTS[0], PARENTS[1], Math.max(0, ...nums) + 1);
  // какая из шести нарисованных особей достанется гибриду: случайная, пока есть неиспользованные, чтобы тела не повторялись
  child.design = pickDesign(hybrids);
  hybrids.push(child);
  saveHybrids();
  mount(child);
  // новый значок на полке вздрагивает, чтобы было видно, что гибрид появился
  $("#shelf").lastElementChild?.classList.add("born");
  $("#shelf").lastElementChild?.scrollIntoView({ inline: "end", block: "nearest" });
  say(`Выведен ${child.code}: новое тело и новый звук.`);
});

// сброс в два касания: первое предупреждает, второе (в течение 3 с) удаляет
let resetArmed = 0;
$("#reset").addEventListener("click", () => {
  if (performance.now() - resetArmed > 3000) {
    resetArmed = performance.now();
    say(`Нажми ещё раз, чтобы убрать всех гибридов (${hybrids.length}).`);
    return;
  }
  resetArmed = 0;
  hybrids = [];
  saveHybrids();
  // номера гибридов после сброса начнутся заново: старые зажимы не должны достаться новым
  for (const k of [...latchedBy.keys()]) if (!PARENTS.some((b) => b.id === k)) latchedBy.delete(k);
  mount(PARENTS[0]);
  say("Гибриды убраны.");
});

const credits = $("#credits");
// список органов на экране «Как играть»: настоящая картинка органа, название, что делает
$("#organ-list").innerHTML = ORGANS.map(
  (o) => `<li><img src="assets/organs/${o.id}-2.webp" alt=""><span><b>${o.name}.</b> ${o.hint}</span></li>`
).join("");
// закрытие по клику на пустую область вокруг окна, а не только по кнопке
credits.addEventListener("click", (e) => {
  const r = credits.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) credits.close();
});
$("#about").addEventListener("click", () => {
  credits.showModal();
  // showModal фокусирует кнопку «Закрыть» внизу и прокручивает к ней: возвращаем начало
  credits.scrollTop = 0;
  credits.querySelector("h2").focus({ preventScroll: true });
});

// клавиатура: пробел давит на тело
let spaceDown = false;
addEventListener("keydown", (e) => {
  if (e.code !== "Space" || e.target.closest?.("dialog")) return;
  e.preventDefault();
  if (e.repeat || spaceDown) return;
  spaceDown = true;
  press();
});
addEventListener("keyup", (e) => {
  if (e.code !== "Space" || e.target.closest?.("dialog")) return;
  e.preventDefault();
  if (!spaceDown) return;
  spaceDown = false;
  release();
});
// после клика кнопка лотка не держит фокус, иначе Enter и пробел снова её нажимают
for (const b of document.querySelectorAll("#tray button")) b.addEventListener("click", () => b.blur());
addEventListener("blur", () => {
  if (!latched) engine?.stop();
});

if (FX.size) say(`Диагностика звука: ${[...FX].join(", ")}`);
// ?fx=debug: доступ к движку из консоли для проверки
if (FX.has("debug")) window.__bugsynth = { get engine() { return engine; }, get ctx() { return ctx; }, get latched() { return latched; }, get held() { return held; } };
mount(active);
requestAnimationFrame(frame);
