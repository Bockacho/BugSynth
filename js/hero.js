import { mutationLoad } from "./genome.js";

// Нарисованные жуки: по картинке на вид и стадию мутации (assets/bugs/<вид>-<стадия>.webp, холст 640×600).
// Виды без картинок рисует процедурный renderBug из bug.js.
const HEROES = new Set(["longhorn", "cicada"]);
const STAGES = ["clean", "split", "fused", "extreme"];
const W = 640;
const H = 600;

let counter = 0;

// Стадия: у обычных жуков чистая, у гибридов растёт с грузом мутаций.
function stageOf(bug) {
  if (!bug.hybrid) return "clean";
  const load = mutationLoad(bug.genome);
  return STAGES[load < 0.18 ? 0 : load < 0.35 ? 1 : load < 0.55 ? 2 : 3];
}

// Два главных вида в миксе записей: левый (с большим весом) и правый.
function speciesOf(bug) {
  const list = [...(bug.samples || [])].sort((a, b) => b.w - a.w).map((s) => s.name);
  if (!list.length || !list.every((n, i) => i > 1 || HEROES.has(n))) return null;
  return [list[0], list[1] || list[0]];
}

const img = (sp, stage) =>
  `<image href="assets/bugs/${sp}-${stage}.webp" width="${W}" height="${H}" preserveAspectRatio="xMidYMid meet"/>`;

// Неровная линия шва по центру: по ней два родителя «срастаются».
function seamPoints(seed) {
  const pts = [];
  let s = seed;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let y = 0; y <= H; y += 40) pts.push([W / 2 + (r() - 0.5) * 36, y]);
  return pts;
}

export function renderHero(bug) {
  const sp = speciesOf(bug);
  if (!sp) return null;
  const stage = stageOf(bug);
  const id = `h${++counter}`;
  let body;
  if (sp[0] === sp[1]) {
    body = img(sp[0], stage);
  } else {
    const seed = [...bug.id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    const pts = seamPoints(seed);
    const line = pts.map(([x, y]) => `${x.toFixed(1)} ${y}`).join(" L");
    const left = `M0 0 L${line} L0 ${H} Z`;
    const right = `M${W} 0 L${line} L${W} ${H} Z`;
    // шов: ряд тёмных стежков поверх светлой полосы кожи
    const stitches = pts
      .slice(0, -1)
      .map(([x, y], i) => {
        const [x2, y2] = pts[i + 1];
        const mx = (x + x2) / 2;
        const my = (y + y2) / 2;
        return `<path d="M${(mx - 9).toFixed(1)} ${my.toFixed(1)} L${(mx + 9).toFixed(1)} ${(my + 2).toFixed(1)}" stroke="#1a0b08" stroke-width="3" stroke-linecap="round"/>`;
      })
      .join("");
    const halves = `<g clip-path="url(#${id}l)">${img(sp[0], stage)}</g><g clip-path="url(#${id}r)">${img(sp[1], stage)}</g>`;
    // маска из силуэта жука (непрозрачное → белое): шов рисуется только по телу, а не по пустому месту
    body =
      `<defs><clipPath id="${id}l"><path d="${left}"/></clipPath><clipPath id="${id}r"><path d="${right}"/></clipPath>` +
      `<filter id="${id}f" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0"/></filter>` +
      `<mask id="${id}m" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><g filter="url(#${id}f)">${halves}</g></mask></defs>` +
      halves +
      `<g mask="url(#${id}m)">` +
      `<path d="M${line}" fill="none" stroke="#d9a99a" stroke-opacity=".75" stroke-width="9" stroke-linejoin="round" stroke-linecap="round"/>` +
      `<path d="M${line}" fill="none" stroke="#3a1612" stroke-width="2" stroke-linejoin="round"/>` +
      stitches +
      `</g>`;
  }
  return `<svg class="bug-svg hero" viewBox="0 0 ${W} ${H}" role="img" aria-label="Жук" xmlns="http://www.w3.org/2000/svg"><g class="flesh">${body}</g></svg>`;
}
