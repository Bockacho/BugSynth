import { mutationLoad } from "./genome.js";

// Нарисованные жуки: по картинке на вид и стадию мутации (assets/bugs/<вид>-<стадия>.webp, холст 640×600).
// Все четыре стадии лежат слоями, ручка «грязь» плавно перетекает от чистого тела к крайней мутации.
const STAGES = ["clean", "split", "fused", "extreme"];
const W = 640;
const H = 600;

// Места на теле (в координатах холста 640×600), где сидят органы управления. Подобраны по картинкам.
const ANCHORS = {
  longhorn: {
    head: [318, 128], thorax: [318, 212], belly: [318, 425], tail: [318, 515], antenna: [395, 86],
    legL: [205, 262], legR: [425, 258], hindL: [215, 372], hindR: [420, 378], flankL: [288, 292], flankR: [350, 330],
    body: [318, 320, 150, 260],
  },
  cicada: {
    head: [318, 132], thorax: [318, 216], belly: [318, 415], tail: [318, 505], antenna: [430, 105],
    legL: [190, 238], legR: [470, 230], hindL: [190, 330], hindR: [490, 330], flankL: [268, 345], flankR: [368, 345],
    body: [318, 330, 170, 255],
  },
};

// Шесть нарисованных гибридов (assets/bugs/hybrid-<N>-<стадия>.webp). Места органов подобраны по картинкам.
const HYBRID_COUNT = 6;
const hy = (head, thorax, belly, tail, antenna, legL, legR, hindL, hindR, flankL, flankR, body) =>
  ({ head, thorax, belly, tail, antenna, legL, legR, hindL, hindR, flankL, flankR, body });
ANCHORS["hybrid-1"] = hy([322, 137], [322, 222], [322, 420], [322, 520], [410, 85], [200, 255], [455, 252], [190, 405], [450, 420], [287, 300], [357, 322], [322, 320, 170, 270]);
ANCHORS["hybrid-2"] = hy([332, 145], [332, 228], [332, 420], [330, 515], [430, 95], [215, 262], [455, 262], [205, 400], [455, 400], [290, 330], [375, 330], [332, 320, 170, 270]);
ANCHORS["hybrid-3"] = hy([330, 152], [332, 238], [332, 420], [332, 520], [440, 80], [175, 262], [480, 265], [150, 400], [480, 405], [290, 330], [375, 330], [332, 320, 190, 270]);
ANCHORS["hybrid-4"] = hy([330, 138], [330, 224], [330, 410], [330, 510], [410, 82], [200, 262], [462, 270], [200, 400], [455, 400], [295, 295], [365, 318], [330, 320, 150, 260]);
ANCHORS["hybrid-5"] = hy([332, 138], [332, 224], [332, 410], [332, 520], [440, 68], [180, 285], [470, 285], [190, 430], [475, 435], [290, 300], [375, 300], [332, 330, 180, 260]);
ANCHORS["hybrid-6"] = hy([335, 138], [330, 224], [375, 398], [345, 520], [420, 78], [170, 270], [470, 265], [190, 430], [465, 405], [265, 330], [375, 300], [335, 340, 180, 260]);
export { HYBRID_COUNT };

let counter = 0;

// «напряжённые» позы нарисованы только для этих видов; остальным (гибридам) не пробуем их грузить, чтобы не было 404
const STRAIN_SPECIES = new Set(["longhorn", "cicada"]);
const strainOk = new Map();
function probeStrain(sp) {
  if (!STRAIN_SPECIES.has(sp)) return Promise.resolve(false);
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

// Адрес картинки лежит в data-href и переносится в href, только когда стадия становится видимой:
// при открытии страницы грузится одна стадия, остальные по мере поворота ручки «грязь».
const img = (sp, stage, suf = "") =>
  `<image data-href="assets/bugs/${sp}-${stage}${suf}.webp" width="${W}" height="${H}" preserveAspectRatio="xMidYMid meet"/>`;
function reveal(group) {
  for (const im of group.querySelectorAll("image[data-href]")) {
    if (!im.hasAttribute("href")) im.setAttribute("href", im.dataset.href);
  }
}

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
    for (const list of [layers, strainLayers]) {
      list.forEach((g, i) => {
        const w = weight(i);
        g.style.opacity = w;
        if (w !== "0") reveal(g);
      });
    }
  };
  setStage(stageF);
  // «напряжённая» поза (assets/bugs/<вид>-<стадия>-strain.webp): если нарисована, тело перетекает в неё в такт звуку.
  // Картинки позы грузятся только когда жук впервые зазвучал, чтобы не тянуть их при открытии страницы.
  const strain = svg.querySelector(".strain");
  let strainRequested = false;
  const loadStrain = () => {
    strainRequested = true;
    Promise.all([...new Set(sp)].map(probeStrain)).then((oks) => {
      if (!oks.every(Boolean) || !strain.isConnected) return;
      strain.innerHTML = STAGES.map((_, i) => `<g class="stage">${stageGroup(bug, sp, i, `${id}p${i}`, "-strain")}</g>`).join("");
      strainLayers = [...strain.querySelectorAll(".stage")];
      setStage(stageF);
    });
  };
  let lastStrain = -1;
  const setStrain = (a) => {
    if (a > 0.01 && !strainRequested) loadStrain();
    const v = Math.round(a * 1000) / 1000;
    if (v === lastStrain) return;
    lastStrain = v;
    strain.setAttribute("opacity", String(v));
  };
  return { svg, setStage, setStrain, anchors: anchorsOf(bug), organs: svg.querySelector(".organs"), W, H };
}

// Миниатюра для лотка: готовая маленькая картинка (assets/bugs/thumb/), стадия по умолчанию.
export function renderHero(bug) {
  const sp = speciesOf(bug);
  if (!sp) return null;
  return `<img src="assets/bugs/thumb/${sp[0]}-${STAGES[baseStage(bug)]}.webp" alt="" width="112" height="105" decoding="async">`;
}
