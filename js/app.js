import { BugEngine } from "./engine.js";
import { NATURAL_BUGS, GENES, makeHybrid, fillGenome } from "./genome.js";
import { renderBug } from "./bug.js";
import { renderHero } from "./hero.js";

const BASE_FREQ = 220; // A3
const SCALE = [0, 3, 5, 7, 10, 12, 15, 17]; // минорная пентатоника
const KEYS = ["a", "s", "d", "f", "g", "h", "j", "k"];
const STORAGE_KEY = "bugsynth.hybrids";
const MAX_HYBRIDS = 12;

// диагностика звука: ?fx=nocomp,noclip,notone,nolfo,nofm,nonoise,noreso,slow
const FX = new Set((new URLSearchParams(location.search).get("fx") || "").split(",").filter(Boolean));

let ctx = null;
let engine = null;
let octave = 0;
let hybrids = loadHybrids();
let active = NATURAL_BUGS[0];
let compareTimers = [];

const $ = (sel) => document.querySelector(sel);
const sticker = $("#bug-art");
const pads = $("#pads");
const status = $("#status");
const allBugs = () => [...NATURAL_BUGS, ...hybrids];
const byId = (id) => allBugs().find((b) => b.id === id);

// --- сохранение гибридов (если localStorage недоступен, просто не сохраняем) ---
function loadHybrids() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    // гибриды, сохранённые до появления генов тела, достраиваем нулями
    return raw
      // гибриды прототипа без записей звучали одним синтезом, их не переносим
      .filter((h) => h && h.id && h.genome && typeof h.genome === "object" && Array.isArray(h.samples))
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

// --- карточка, геном, полка ---
function renderSticker() {
  $("#bug-code").textContent = active.code;
  const latin = $("#bug-latin");
  latin.textContent = active.latin;
  latin.classList.toggle("hyb", !!active.hybrid);
  $("#bug-ru").textContent = active.ru;
  $("#bug-fact").textContent = active.fact;
  sticker.innerHTML = renderHero(active) || renderBug(active.genome);
}

function renderGenes() {
  const parents = active.hybrid ? active.parents.map(byId) : [];
  const hasParents = parents.length === 2 && parents.every(Boolean);
  const el = $("#genes");
  el.innerHTML = "";
  const groups = { sound: "Звук", body: "Тело" };
  let lastKind = null;
  for (const gene of GENES) {
    if (gene.kind !== lastKind) {
      lastKind = gene.kind;
      const head = document.createElement("div");
      head.className = "gene-group";
      head.textContent = groups[gene.kind];
      el.appendChild(head);
    }
    const pct = (x) => `${Math.round(x * 100)}%`;
    const ticks = hasParents
      ? `<b class="tick a" style="left:${pct(parents[0].genome[gene.id])}">A</b>` +
        `<b class="tick b" style="left:${pct(parents[1].genome[gene.id])}">B</b>`
      : "";
    const row = document.createElement("div");
    row.className = "gene";
    row.innerHTML =
      `<span class="gene-label">${gene.label}</span>` +
      `<span class="gene-bar"><i style="width:${pct(active.genome[gene.id])}"></i>${ticks}</span>`;
    el.appendChild(row);
  }
  $("#gene-legend").hidden = !hasParents;
}

function renderShelf() {
  const shelf = $("#shelf");
  shelf.innerHTML = "";
  for (const b of allBugs()) {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "tile";
    tile.setAttribute("aria-pressed", String(b === active));
    tile.innerHTML = `<span class="tile-art">${renderHero(b) || renderBug(b.genome, { lite: true })}</span><span class="tile-code">${b.code}</span>`;
    tile.addEventListener("click", () => setActive(b));
    shelf.appendChild(tile);
  }
}

function renderParentSelects() {
  for (const id of ["parent-a", "parent-b"]) {
    const sel = $(`#${id}`);
    const keep = sel.value;
    sel.innerHTML = allBugs()
      .map((b) => `<option value="${b.id}">${b.code}</option>`)
      .join("");
    if (keep && byId(keep)) sel.value = keep;
  }
  if (!$("#parent-a").value) $("#parent-a").value = NATURAL_BUGS[0].id;
  if (!$("#parent-b").value || $("#parent-b").value === $("#parent-a").value) $("#parent-b").value = NATURAL_BUGS[1].id;
}

function renderActions() {
  const parents = active.hybrid ? active.parents.map(byId) : [];
  $("#compare").hidden = !(parents.length === 2 && parents.every(Boolean));
  $("#reset").hidden = hybrids.length === 0;
}

function setActive(bug) {
  active = bug;
  engine?.setBug(bug);
  renderSticker();
  renderGenes();
  renderShelf();
  renderActions();
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
    unlockAudioSession();
  }
  if (ctx.state !== "running") await ctx.resume();
  if (!engine.loading) engine.loading = engine.loadSamples();
  await engine.loading;
}

const freqOf = (i) => BASE_FREQ * Math.pow(2, (SCALE[i] + octave * 12) / 12);

async function press(i, el) {
  stopCompare();
  await ensureAudio();
  engine.noteOn(`n${i}`, freqOf(i));
  el.classList.add("on");
  sticker.classList.add("playing");
}

function release(i, el) {
  if (!engine) return;
  engine.noteOff(`n${i}`);
  el.classList.remove("on");
  if (!pads.querySelector(".on")) sticker.classList.remove("playing");
}

// --- пады ---
const padEls = SCALE.map((_, i) => {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "pad";
  el.setAttribute("aria-label", `нота ${i + 1}`);
  el.innerHTML = `<span>${KEYS[i].toUpperCase()}</span>`;
  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    press(i, el);
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
    el.addEventListener(type, () => release(i, el));
  }
  el.addEventListener("contextmenu", (e) => e.preventDefault());
  pads.appendChild(el);
  return el;
});

const held = new Set();
const typing = (e) => /^(select|input|textarea)$/i.test(e.target.tagName);
addEventListener("keydown", (e) => {
  const i = KEYS.indexOf(e.key.toLowerCase());
  if (i < 0 || e.repeat || e.metaKey || e.ctrlKey || e.altKey || typing(e)) return;
  held.add(i);
  press(i, padEls[i]);
});
addEventListener("keyup", (e) => {
  const i = KEYS.indexOf(e.key.toLowerCase());
  if (i < 0 || !held.delete(i)) return;
  release(i, padEls[i]);
});
addEventListener("blur", () => {
  engine?.allOff();
  padEls.forEach((el) => el.classList.remove("on"));
  sticker.classList.remove("playing");
});

// --- октава ---
const octLabel = $("#oct-label");
function setOctave(o) {
  octave = Math.max(-1, Math.min(2, o));
  octLabel.textContent = octave > 0 ? `+${octave}` : `${octave}`;
}
$("#oct-down").addEventListener("click", () => setOctave(octave - 1));
$("#oct-up").addEventListener("click", () => setOctave(octave + 1));
setOctave(0);

// --- скрещивание ---
function breed() {
  const a = byId($("#parent-a").value);
  const b = byId($("#parent-b").value);
  if (!a || !b) return;
  if (hybrids.length >= MAX_HYBRIDS) {
    status.textContent = `Гибридов уже ${MAX_HYBRIDS}. Убери старых, чтобы вывести новых.`;
    return;
  }
  const nums = hybrids.map((h) => Number(h.id.replace("hyb-", "")) || 0);
  const child = makeHybrid(a, b, Math.max(0, ...nums) + 1);
  hybrids.push(child);
  saveHybrids();
  renderParentSelects();
  setActive(child);
  status.textContent = `Выведен ${child.code}. Играй на падах или нажми «Сравнить с родителями».`;
}
$("#breed").addEventListener("click", breed);

// Короткий мотив по очереди: родитель A, родитель B, потомок.
// Играем таймерами, а не расписанием WebAudio: у движка лимит голосов, и заранее запланированные ноты он бы срезал.
function stopCompare() {
  compareTimers.forEach(clearTimeout);
  compareTimers = [];
  engine?.setBug(active);
}

async function compare() {
  const parents = active.parents.map(byId);
  if (parents.length !== 2 || !parents.every(Boolean)) return;
  stopCompare();
  engine?.allOff();
  await ensureAudio();
  const motif = [0, 2, 4, 2];
  const step = 330;
  const gap = 350;
  const order = [parents[0], parents[1], active];
  const names = ["A", "B", "потомок"];
  const phase = motif.length * step + gap;
  order.forEach((bug, k) => {
    compareTimers.push(setTimeout(() => (status.textContent = `Играет: ${names[k]} (${bug.code})`), k * phase));
    motif.forEach((n, j) => {
      const id = `cmp${j}`;
      const on = k * phase + j * step;
      compareTimers.push(
        setTimeout(() => {
          engine.setBug(bug);
          engine.noteOn(id, freqOf(n));
        }, on)
      );
      compareTimers.push(setTimeout(() => engine.noteOff(id), on + step * 0.85));
    });
  });
  compareTimers.push(
    setTimeout(() => {
      engine.setBug(active);
      status.textContent = "";
    }, order.length * phase)
  );
}
$("#compare").addEventListener("click", compare);

$("#reset").addEventListener("click", () => {
  stopCompare();
  hybrids = [];
  saveHybrids();
  renderParentSelects();
  setActive(NATURAL_BUGS[0]);
  status.textContent = "";
});

// --- старт ---
if (FX.size) status.textContent = `Диагностика звука: ${[...FX].join(", ")}`;
renderParentSelects();
setActive(active);
