// Геном жука: каждый ген хранится нормализованным (0..1).
// Так скрещивание и мутация работают одинаково для всех генов.
//
// kind "sound" — гены звука, kind "body" — гены тела (мутации). Тело влияет и на звук:
// чем больше мутаций, тем грязнее звук (см. mutationLoad и engine.js).
export const GENES = [
  { id: "wave", kind: "sound", label: "волна (пила → квадрат)", min: 0, max: 1, curve: "lin" },
  { id: "fmRatio", kind: "sound", label: "FM-отношение", min: 0.5, max: 8, curve: "exp" },
  { id: "fmDepth", kind: "sound", label: "FM-глубина", min: 0, max: 1, curve: "lin" },
  { id: "cutoff", kind: "sound", label: "срез фильтра", min: 0, max: 1, curve: "lin" },
  { id: "resonance", kind: "sound", label: "резонанс", min: 0, max: 1, curve: "lin" },
  { id: "noise", kind: "sound", label: "шум", min: 0, max: 1, curve: "lin" },
  { id: "pulseRate", kind: "sound", label: "частота стрекота, Гц", min: 6, max: 90, curve: "exp" },
  { id: "pulseDepth", kind: "sound", label: "глубина стрекота", min: 0, max: 1, curve: "lin" },
  { id: "attack", kind: "sound", label: "атака, с", min: 0.003, max: 0.4, curve: "exp" },
  { id: "release", kind: "sound", label: "затухание, с", min: 0.05, max: 1.5, curve: "exp" },

  { id: "eyes", kind: "body", label: "глаза", min: 0, max: 1, curve: "lin" },
  { id: "extraLegs", kind: "body", label: "лишние ноги", min: 0, max: 1, curve: "lin" },
  { id: "tumors", kind: "body", label: "нарывы", min: 0, max: 1, curve: "lin" },
  { id: "tendrils", kind: "body", label: "щупальца", min: 0, max: 1, curve: "lin" },
  { id: "mandibles", kind: "body", label: "жвалы", min: 0, max: 1, curve: "lin" },
  { id: "asym", kind: "body", label: "асимметрия", min: 0, max: 1, curve: "lin" },
  { id: "wet", kind: "body", label: "мокрость", min: 0, max: 1, curve: "lin" },
  { id: "exposed", kind: "body", label: "вскрытость пластин", min: 0, max: 1, curve: "lin" },
];

const BY_ID = Object.fromEntries(GENES.map((g) => [g.id, g]));

const clamp01 = (x) => Math.min(1, Math.max(0, x));

// нормализованное значение гена (0..1) → реальное значение параметра
export function geneValue(genome, id) {
  const g = BY_ID[id];
  const x = clamp01(genome[id]);
  if (g.curve === "exp") return g.min * Math.pow(g.max / g.min, x);
  return g.min + (g.max - g.min) * x;
}

// Достраивает геном до полного набора генов. Нужно для гибридов, сохранённых до появления генов тела.
export function fillGenome(genome) {
  const out = {};
  for (const { id, kind } of GENES) {
    out[id] = typeof genome[id] === "number" ? genome[id] : kind === "sound" ? 0.5 : 0;
  }
  return out;
}

// «Груз мутаций» 0..1: у обычных жуков около нуля, у гибридов растёт.
// От него звук становится грязнее: больше шума, неровный FM, разъезд осцилляторов.
export function mutationLoad(genome) {
  const eyes = Math.max(0, (genome.eyes - 0.33) / 0.67);
  const mandibles = Math.max(0, (genome.mandibles - 0.5) / 0.5);
  const sum = eyes + genome.extraLegs + genome.tumors + genome.tendrils + mandibles + genome.asym;
  return clamp01((sum / 6) * 1.8);
}

// Cerambyx cerdo — первый жук серии
export const BUG_01 = {
  id: "bug-01",
  code: "BUG-01",
  latin: "Cerambyx cerdo",
  ru: "большой дубовый усач",
  fact:
    "Многие усачи (Cerambycidae) скрипят: потирают переднегрудь о среднегрудь. " +
    "Звук здесь — синтетическая интерпретация, а не запись насекомого.",
  genome: {
    wave: 0.2,
    fmRatio: 0.45,
    fmDepth: 0.22,
    cutoff: 0.5,
    resonance: 0.45,
    noise: 0.28,
    pulseRate: 0.55,
    pulseDepth: 0.75,
    attack: 0.25,
    release: 0.45,
    eyes: 0.33,
    extraLegs: 0.35,
    tumors: 0,
    tendrils: 0,
    mandibles: 0.35,
    asym: 0.05,
    wet: 0.15,
    exposed: 0,
  },
};

// Xestobium rufovillosum — второй жук. Стучит головой по дереву: короткая атака, быстрое затухание.
export const BUG_02 = {
  id: "bug-02",
  code: "BUG-02",
  latin: "Xestobium rufovillosum",
  ru: "жук-точильщик",
  fact:
    "Точильщик стучит головой по дереву, подзывая партнёра, — отсюда английское death-watch beetle. " +
    "Звук здесь — синтетическая интерпретация, а не запись насекомого.",
  genome: {
    wave: 0.8,
    fmRatio: 0.7,
    fmDepth: 0.55,
    cutoff: 0.3,
    resonance: 0.75,
    noise: 0.55,
    pulseRate: 0.15,
    pulseDepth: 0.95,
    attack: 0.02,
    release: 0.15,
    eyes: 0.33,
    extraLegs: 0.55,
    tumors: 0,
    tendrils: 0,
    mandibles: 0.5,
    asym: 0.1,
    wet: 0.2,
    exposed: 0,
  },
};

export const NATURAL_BUGS = [BUG_01, BUG_02];

// Гауссов шум (Бокс — Мюллер)
function gauss(rng) {
  const u = Math.max(rng(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

// Скрещивание: для каждого гена 40% берём у A, 40% у B, 20% среднее; затем слабая мутация.
// Гены тела дополнительно сдвигаются только «в худшую сторону»: каждое поколение гибридов страшнее.
export function crossGenomes(a, b, rng = Math.random, mutation = 0.05) {
  a = fillGenome(a);
  b = fillGenome(b);
  const child = {};
  for (const { id, kind } of GENES) {
    const r = rng();
    const base = r < 0.4 ? a[id] : r < 0.8 ? b[id] : (a[id] + b[id]) / 2;
    let v = base + gauss(rng) * mutation;
    if (kind === "body") v += Math.abs(gauss(rng)) * 0.1;
    child[id] = clamp01(v);
  }
  return child;
}

export function makeHybrid(a, b, number, rng = Math.random) {
  return {
    id: `hyb-${number}`,
    code: `HYB-${String(number).padStart(2, "0")}`,
    hybrid: true,
    latin: `${a.code} × ${b.code}`,
    ru: "гибрид",
    fact:
      "Гибрид придуман проектом: в природе эти виды не скрещиваются. " +
      "Каждый ген достаётся от одного из родителей или усредняется, плюс небольшая мутация. " +
      "Гены тела мутируют только в худшую сторону, и звук от этого грязнее.",
    parents: [a.id, b.id],
    genome: crossGenomes(a.genome, b.genome, rng),
  };
}
