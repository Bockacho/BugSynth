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
    body: [322, 310, 230, 290],
  },
  cicada: {
    head: [322, 142], thorax: [322, 205], belly: [322, 420], tail: [322, 505], antenna: [382, 44],
    legL: [162, 172], legR: [482, 172], hindL: [150, 300], hindR: [492, 300], flankL: [258, 330], flankR: [386, 330],
    body: [322, 320, 250, 290],
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

// Начальная стадия: у обычных жуков чистая, у гибридов растёт с грузом мутаций (0..3). Целая, без полупрозрачных наложений.
export function baseStage(bug) {
  if (!bug.hybrid) return 0;
  return Math.round(Math.min(3, mutationLoad(bug.genome) * 5));
}

// Чьё тело рисовать. Для гибрида нужна его собственная нарисованная особь (ANCHORS["hybrid-<design>"]).
// Пока таких нет, гибрид показывается как мутант главного родителя: чистая картинка одного вида, без наложений.
function speciesOf(bug) {
  if (bug.hybrid && ANCHORS[`hybrid-${bug.design}`]) return [`hybrid-${bug.design}`, `hybrid-${bug.design}`];
  const list = [...(bug.samples || [])].sort((a, b) => b.w - a.w).map((s) => s.name).filter((n) => ANCHORS[n]);
  if (!list.length) return null;
  return [list[0], list[0]];
}

const img = (sp, stage, suf = "") =>
  `<image href="assets/bugs/${sp}-${stage}${suf}.webp" width="${W}" height="${H}" preserveAspectRatio="xMidYMid meet"/>`;

// Один слой-стадия: одна картинка. Раньше гибрид склеивался из двух половин с размытым краем, и получались
// призрачные двойные экспозиции; настоящие гибриды должны быть нарисованы целиком.
function stageGroup(bug, sp, stage, id, suf = "") {
  return img(sp[0], STAGES[stage], suf);
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
