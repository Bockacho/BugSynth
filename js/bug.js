// Рисует жука по геному: каждый ген отвечает за свой признак, поэтому у гибрида
// видно, что досталось от каких родителей. Соответствие «ген → признак» — дизайн-решение,
// его можно менять.
//
//  wave       → число рёбер на надкрыльях
//  fmRatio    → длина тела
//  fmDepth    → ширина надкрылий
//  cutoff     → длина ног
//  resonance  → ширина переднеспинки
//  noise      → число точек на надкрыльях
//  pulseRate  → длина усов
//  pulseDepth → размер головы
//  attack     → толщина усов
//  release    → хвостик надкрылий
const DOTS = [
  [-0.5, -0.4], [0.5, -0.3], [-0.3, 0.1], [0.4, 0.2], [-0.55, 0.45],
  [0.2, -0.6], [-0.15, 0.5], [0.55, 0.55], [-0.25, -0.15], [0.3, 0.45],
];

const f = (x) => Math.round(x * 10) / 10;

export function renderBug(genome) {
  const g = genome;
  const antLen = 30 + g.pulseRate * 70;
  const antW = 2 + g.attack * 2.5;
  const rx = 18 + g.fmDepth * 28;
  const ry = 34 + g.fmRatio * 42;
  const legLen = 10 + g.cutoff * 30;
  const pronRx = 11 + g.resonance * 18;
  const headR = 7 + g.pulseDepth * 7;
  const ridges = Math.round(g.wave * 4);
  const dots = Math.round(g.noise * DOTS.length);
  const tail = g.release * 20;

  const headCy = 46;
  const pronRy = 12;
  const pronCy = headCy + headR + pronRy - 4;
  const top = pronCy + pronRy - 4;
  const cy = top + ry;
  const bottom = cy + ry;

  const antenna = (side) => {
    const s = side === "l" ? -1 : 1;
    const x0 = 100 + s * 5;
    const y0 = headCy - headR + 3;
    const x1 = 100 + s * (24 + antLen * 0.5);
    const y1 = 50 + antLen * 1.1;
    const c1 = 100 + s * (24 + antLen * 0.35);
    return (
      `<g class="ant ant-${side}"><path stroke-width="${f(antW)}" ` +
      `d="M${f(x0)} ${f(y0)} C ${f(c1)} 14, ${f(c1 + s * 16)} 34, ${f(x1)} ${f(y1)}" /></g>`
    );
  };

  const legs = [
    [pronCy, pronRx - 2, -6],
    [top + ry * 0.35, rx - 3, 8],
    [top + ry * 0.85, rx - 3, 22],
  ]
    .map(
      ([y, x, dy]) =>
        `<path d="M${f(100 - x)} ${f(y)} l ${f(-legLen)} ${f(dy)}" />` +
        `<path d="M${f(100 + x)} ${f(y)} l ${f(legLen)} ${f(dy)}" />`
    )
    .join("");

  // рёбра: вертикальные линии внутри эллипса надкрылий
  let ridgeSvg = "";
  for (let i = 0; i < ridges; i++) {
    const dx = (i - (ridges - 1) / 2) * ((rx * 1.5) / ridges);
    if (Math.abs(dx) < 3) continue;
    const h = ry * Math.sqrt(Math.max(0, 1 - (dx / rx) ** 2)) - 6;
    if (h <= 4) continue;
    ridgeSvg += `<path class="ridge" d="M${f(100 + dx)} ${f(cy - h)} L${f(100 + dx)} ${f(cy + h)}" />`;
  }

  const dotSvg = DOTS.slice(0, dots)
    .map(([u, v]) => `<circle class="dot" cx="${f(100 + u * rx * 0.8)}" cy="${f(cy + v * ry * 0.8)}" r="2.2" />`)
    .join("");

  const tailSvg =
    tail > 1
      ? `<path d="M${f(100 - rx * 0.35)} ${f(bottom - 3)} L100 ${f(bottom + tail)} L${f(100 + rx * 0.35)} ${f(bottom - 3)} Z" />`
      : "";

  return `
<svg class="bug-svg" viewBox="0 0 200 250" role="img" aria-label="Жук" xmlns="http://www.w3.org/2000/svg">
  <g class="ink" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="3">
    ${antenna("l")}${antenna("r")}${legs}
  </g>
  <g class="body">
    <ellipse cx="100" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" />
    <ellipse cx="100" cy="${f(pronCy)}" rx="${f(pronRx)}" ry="${pronRy}" />
    <circle cx="100" cy="${headCy}" r="${f(headR)}" />
    ${tailSvg}
  </g>
  <path class="seam" d="M100 ${f(top + 4)} L100 ${f(bottom - 4)}" />
  ${ridgeSvg}${dotSvg}
</svg>`;
}
