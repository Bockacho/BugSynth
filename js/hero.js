import { mutationLoad } from "./genome.js";

// Нарисованные жуки: по картинке на вид и стадию мутации (assets/bugs/<вид>-<стадия>.webp, холст 640×600).
// Все четыре стадии лежат слоями, ручка «грязь» плавно перетекает от чистого тела к крайней мутации.
const STAGES = ["clean", "split", "fused", "extreme"];
const W = 640;
const H = 600;

// Места на теле (в координатах холста 640×600), где сидят органы управления. Подобраны по картинкам.
const ANCHORS = {
  longhorn: {
    head: [322, 142], thorax: [322, 196], belly: [322, 405], tail: [322, 505], antenna: [374, 58],
    legL: [196, 240], legR: [434, 240], hindL: [208, 382], hindR: [437, 378], flankL: [286, 300], flankR: [358, 300],
    body: [322, 330, 120, 230],
  },
  cicada: {
    head: [322, 142], thorax: [322, 205], belly: [322, 420], tail: [322, 505], antenna: [382, 44],
    legL: [162, 172], legR: [482, 172], hindL: [150, 300], hindR: [492, 300], flankL: [258, 330], flankR: [386, 330],
    body: [322, 330, 150, 240],
  },
};

let counter = 0;

const strainOk = new Map();
function probeStrain(sp) {
  if (!strainOk.has(sp)) {
    strainOk.set(
      sp,
      new Promise((res) => {
        const im = new Image();
        im.onload = () => res(true);
        im.onerror = () => res(false);
        im.src = `assets/bugs/${sp}-clean-strain.webp`;
      })
    );
  }
  return strainOk.get(sp);
}

// Начальная стадия: у обычных жуков чистая, у гибридов растёт с грузом мутаций (0..3, дробная).
export function baseStage(bug) {
  if (!bug.hybrid) return 0;
  return Math.min(3, mutationLoad(bug.genome) * 5);
}

// Два главных вида в миксе записей: левый (с большим весом) и правый.
function speciesOf(bug) {
  const list = [...(bug.samples || [])].sort((a, b) => b.w - a.w).map((s) => s.name).filter((n) => ANCHORS[n]);
  if (!list.length) return null;
  return [list[0], list[1] || list[0]];
}

const img = (sp, stage, suf = "") =>
  `<image href="assets/bugs/${sp}-${stage}${suf}.webp" width="${W}" height="${H}" preserveAspectRatio="xMidYMid meet"/>`;

// Неровная линия шва по центру: по ней два родителя «срастаются».
function seamPoints(seed) {
  const pts = [];
  let s = seed;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let y = 0; y <= H; y += 40) pts.push([W / 2 + (r() - 0.5) * 36, y]);
  return pts;
}

// Один слой-стадия: у одного вида просто картинка, у гибрида две половины со швом.
function stageGroup(bug, sp, stage, id, suf = "") {
  if (sp[0] === sp[1]) return img(sp[0], STAGES[stage], suf);
  const seed = [...bug.id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const pts = seamPoints(seed);
  const line = pts.map(([x, y]) => `${x.toFixed(1)} ${y}`).join(" L");
  const left = `M0 0 L${line} L0 ${H} Z`;
  const right = `M${W} 0 L${line} L${W} ${H} Z`;
  const stitches = pts
    .slice(0, -1)
    .map(([x, y], i) => {
      const [x2, y2] = pts[i + 1];
      const mx = (x + x2) / 2;
      const my = (y + y2) / 2;
      return `<path d="M${(mx - 9).toFixed(1)} ${my.toFixed(1)} L${(mx + 9).toFixed(1)} ${(my + 2).toFixed(1)}" stroke="#1a0b08" stroke-width="3" stroke-linecap="round"/>`;
    })
    .join("");
  const halves = `<g clip-path="url(#${id}l)">${img(sp[0], STAGES[stage], suf)}</g><g clip-path="url(#${id}r)">${img(sp[1], STAGES[stage], suf)}</g>`;
  // маска из силуэта жука (непрозрачное → белое): шов рисуется только по телу, а не по пустому месту
  return (
    `<defs><clipPath id="${id}l"><path d="${left}"/></clipPath><clipPath id="${id}r"><path d="${right}"/></clipPath>` +
    `<filter id="${id}f" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0"/></filter>` +
    `<mask id="${id}m" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><g filter="url(#${id}f)">${halves}</g></mask></defs>` +
    halves +
    `<g mask="url(#${id}m)">` +
    `<path d="M${line}" fill="none" stroke="#d9a99a" stroke-opacity=".75" stroke-width="9" stroke-linejoin="round" stroke-linecap="round"/>` +
    `<path d="M${line}" fill="none" stroke="#3a1612" stroke-width="2" stroke-linejoin="round"/>` +
    stitches +
    `</g>`
  );
}

// Места органов для этого жука: у гибрида левая нога от одного родителя, правая от другого, остальное усреднено.
export function anchorsOf(bug) {
  const sp = speciesOf(bug);
  if (!sp) return null;
  const a = ANCHORS[sp[0]];
  const b = ANCHORS[sp[1]];
  const mid = (k) => [(a[k][0] + b[k][0]) / 2, (a[k][1] + b[k][1]) / 2];
  const out = {};
  // левая сторона тела от левого родителя, правая от правого, середина усреднена
  for (const k of Object.keys(a)) {
    if (k === "body") continue;
    out[k] = /L$/.test(k) ? a[k] : /R$/.test(k) || k === "antenna" ? b[k] : mid(k);
  }
  out.body = [(a.body[0] + b.body[0]) / 2, (a.body[1] + b.body[1]) / 2, Math.max(a.body[2], b.body[2]), Math.max(a.body[3], b.body[3])];
  return out;
}

// Живой вид для главного экрана: все стадии слоями, setStage(0..3) плавно смешивает соседние.
export function createBugView(bug) {
  const sp = speciesOf(bug);
  if (!sp) return null;
  const id = `h${++counter}`;
  const groups = STAGES.map((_, i) => `<g class="stage" data-s="${i}">${stageGroup(bug, sp, i, `${id}s${i}`)}</g>`).join("");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "bug-svg hero");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Жук-синтезатор");
  svg.innerHTML = `<g class="flesh"><g class="rest">${groups}</g><g class="strain" opacity="0"></g></g><g class="organs"></g>`;
  let layers = [...svg.querySelectorAll(".rest .stage")];
  let strainLayers = [];
  let stageF = baseStage(bug);
  const weight = (i) => String(Math.max(0, 1 - Math.abs(stageF - i)));
  const setStage = (f) => {
    stageF = f;
    layers.forEach((g, i) => (g.style.opacity = weight(i)));
    strainLayers.forEach((g, i) => (g.style.opacity = weight(i)));
  };
  setStage(stageF);
  // «напряжённая» поза (assets/bugs/<вид>-<стадия>-strain.webp): если нарисована, тело перетекает в неё в такт звуку
  const strain = svg.querySelector(".strain");
  Promise.all([...new Set(sp)].map(probeStrain)).then((oks) => {
    if (!oks.every(Boolean)) return;
    strain.innerHTML = STAGES.map((_, i) => `<g class="stage">${stageGroup(bug, sp, i, `${id}p${i}`, "-strain")}</g>`).join("");
    strainLayers = [...strain.querySelectorAll(".stage")];
    setStage(stageF);
  });
  const setStrain = (a) => strain.setAttribute("opacity", a.toFixed(3));
  return { svg, setStage, setStrain, anchors: anchorsOf(bug), organs: svg.querySelector(".organs"), W, H };
}

// Статичная картинка для маленьких значков (стадия по умолчанию).
export function renderHero(bug) {
  const sp = speciesOf(bug);
  if (!sp) return null;
  const id = `t${++counter}`;
  const st = Math.round(baseStage(bug));
  return `<svg class="bug-svg hero" viewBox="0 0 ${W} ${H}" role="img" aria-label="Жук" xmlns="http://www.w3.org/2000/svg"><g class="flesh">${stageGroup(bug, sp, st, id)}</g></svg>`;
}
