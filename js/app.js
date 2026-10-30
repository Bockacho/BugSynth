import { BugEngine } from "./engine.js";
import { NATURAL_BUGS, makeHybrid, fillGenome } from "./genome.js";
import { createBugView, renderHero, baseStage } from "./hero.js";
import { createOrgans, ORGANS } from "./organs.js";

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
let latched = false;
const params = { pitch: 0.5, filter: 0.85, dist: 0, reverb: 0.2, trill: 0, delay: 0, env: 0, detune: 0, glide: 0, scrub: 0 };

const $ = (sel) => document.querySelector(sel);
const host = $("#host");
const bugEl = $("#bug");
const shake = $("#shake");
const hint = $("#hint");
const toast = $("#toast");
const allBugs = () => [...PARENTS, ...hybrids];

// --- сохранение гибридов (если localStorage недоступен, просто не сохраняем) ---
function loadHybrids() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return raw
      .filter(
        (h) =>
          h && h.id && h.genome && typeof h.genome === "object" && Array.isArray(h.samples) &&
          h.samples.length && h.samples.every((s) => SAMPLES.includes(s.name))
      )
      .map((h) => ({ ...h, genome: fillGenome(h.genome) }))
      .slice(0, MAX_HYBRIDS);
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
async function press() {
  hint.classList.add("gone");
  await ensureAudio();
  if (latched && engine.playing) {
    // при зажиме повторное нажатие гасит звук
    engine.stop();
    return;
  }
  engine.start();
}

function release() {
  if (!engine || latched) return;
  engine.stop();
}

function mount(bug) {
  engine?.stop();
  active = bug;
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
    zone.setPointerCapture(e.pointerId);
    press();
  });
  for (const type of ["pointerup", "pointercancel"]) zone.addEventListener(type, release);

  organs = createOrgans(view, (id, v) => {
    if (id === "latch") {
      latched = v > 0.5;
      // сняли зажим: звук гаснет
      if (!latched && engine?.playing) engine.stop();
      return;
    }
    params[id] = v;
    engine?.setParam(id, v);
    if (id === "dist" || id === "reverb") applyVisual();
  });
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
    tile.addEventListener("click", () => mount(b));
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
    say(`Гибридов уже ${MAX_HYBRIDS}. Убери старых кнопкой ×.`);
    return;
  }
  const nums = hybrids.map((h) => Number(h.id.replace("hyb-", "")) || 0);
  const child = makeHybrid(PARENTS[0], PARENTS[1], Math.max(0, ...nums) + 1);
  hybrids.push(child);
  saveHybrids();
  mount(child);
  say(`Выведен ${child.code}. Это новое тело и новый звук.`);
});

$("#reset").addEventListener("click", () => {
  hybrids = [];
  saveHybrids();
  mount(PARENTS[0]);
  say("");
});

const credits = $("#credits");
$("#about").addEventListener("click", () => credits.showModal());

// клавиатура: пробел давит на тело
let spaceDown = false;
addEventListener("keydown", (e) => {
  if (e.code !== "Space" || e.repeat || spaceDown) return;
  e.preventDefault();
  spaceDown = true;
  press();
});
addEventListener("keyup", (e) => {
  if (e.code !== "Space") return;
  spaceDown = false;
  release();
});
addEventListener("blur", () => {
  if (!latched) engine?.stop();
});

if (FX.size) say(`Диагностика звука: ${[...FX].join(", ")}`);
mount(active);
requestAnimationFrame(frame);
