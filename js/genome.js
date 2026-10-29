// Геном жука: каждый ген хранится нормализованным (0..1).
// Так скрещивание и мутация работают одинаково для всех генов.
export const GENES = [
  { id: "wave", label: "волна (пила → квадрат)", min: 0, max: 1, curve: "lin" },
  { id: "fmRatio", label: "FM-отношение", min: 0.5, max: 8, curve: "exp" },
  { id: "fmDepth", label: "FM-глубина", min: 0, max: 1, curve: "lin" },
  { id: "cutoff", label: "срез фильтра", min: 0, max: 1, curve: "lin" },
  { id: "resonance", label: "резонанс", min: 0, max: 1, curve: "lin" },
  { id: "noise", label: "шум", min: 0, max: 1, curve: "lin" },
  { id: "pulseRate", label: "частота стрекота, Гц", min: 6, max: 90, curve: "exp" },
  { id: "pulseDepth", label: "глубина стрекота", min: 0, max: 1, curve: "lin" },
  { id: "attack", label: "атака, с", min: 0.003, max: 0.4, curve: "exp" },
  { id: "release", label: "затухание, с", min: 0.05, max: 1.5, curve: "exp" },
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
  },
};

export const NATURAL_BUGS = [BUG_01, BUG_02];

// Гауссов шум (Бокс — Мюллер)
function gauss(rng) {
  const u = Math.max(rng(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

// Скрещивание: для каждого гена 40% берём у A, 40% у B, 20% среднее; затем слабая мутация.
export function crossGenomes(a, b, rng = Math.random, mutation = 0.05) {
  const child = {};
  for (const { id } of GENES) {
    const r = rng();
    const base = r < 0.4 ? a[id] : r < 0.8 ? b[id] : (a[id] + b[id]) / 2;
    child[id] = clamp01(base + gauss(rng) * mutation);
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
      "Каждый ген достаётся от одного из родителей или усредняется, плюс небольшая мутация.",
    parents: [a.id, b.id],
    genome: crossGenomes(a.genome, b.genome, rng),
  };
}
