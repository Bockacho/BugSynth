import { fillGenome } from "./genome.js";

// Рисует жука по геному, слоями: ноги, щупальца, хвост, тело (плоть + бронзовые пластины),
// рёбра, нарывы, голова, жвалы, глаза. Каждый ген отвечает за свой признак, поэтому
// у гибрида видно, что досталось от каких родителей.
//
//  wave       → число рёбер-колец на теле
//  fmRatio    → длина тела
//  fmDepth    → ширина тела
//  cutoff     → длина ног
//  resonance  → ширина переднеспинки
//  noise      → число щетинок и точек коррозии
//  pulseRate  → длина усов
//  pulseDepth → размер головы
//  attack     → толщина усов
//  release    → длина проволочного хвоста
//  eyes       → число глаз (0–6)
//  extraLegs  → лишние ноги (0–4)
//  tumors     → нарывы (0–8)
//  tendrils   → лишние щупальца (0–6)
//  mandibles  → размер жвал
//  asym       → асимметрия левой и правой стороны
//  wet        → мокрый блеск, число вен
//  exposed    → насколько разошлись бронзовые пластины и видна плоть
// Положения нарывов, глаз и лишних конечностей берутся из генератора случайных чисел,
// который засевается самим геномом: один и тот же геном всегда рисуется одинаково.

let uid = 0;

// Картинки ног: размер в пикселях и положение бедра (доля ширины и высоты). Ноги лежат горизонтально, бедро слева.
const LEG_IMAGES = [
  { href: "assets/leg1.webp", w: 360, h: 186, hx: 0.06, hy: 0.369 },
  { href: "assets/leg2.webp", w: 360, h: 167, hx: 0.06, hy: 0.332 },
  { href: "assets/leg3.webp", w: 360, h: 211, hx: 0.06, hy: 0.413 },
  { href: "assets/leg4.webp", w: 360, h: 182, hx: 0.06, hy: 0.527 },
];

function rngFrom(genome) {
  let h = 2166136261;
  for (const k of Object.keys(genome).sort()) {
    h ^= Math.round(genome[k] * 1000) + k.length;
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { rnd, seed: (h >>> 0) % 1000 };
}

const f = (x) => Math.round(x * 10) / 10;
const rad = (d) => (d * Math.PI) / 180;

export function renderBug(genome, { lite = false } = {}) {
  const g = fillGenome(genome);
  const { rnd, seed } = rngFrom(g);
  const r = (a, b) => a + (b - a) * rnd();
  const u = ++uid;
  const n = (id, max) => Math.round(g[id] * max);

  const cx = 120;
  const headR = 10 + g.pulseDepth * 7;
  const headCy = 52;
  const pronRx = 15 + g.resonance * 16;
  const pronRy = 13;
  const pronCy = headCy + headR + pronRy - 5;
  const top = pronCy + pronRy - 4;
  const rx = 24 + g.fmDepth * 28;
  const ry = 38 + g.fmRatio * 44;
  const cy = top + ry;
  const bottom = cy + ry;
  const legLen = 22 + g.cutoff * 34;
  const tailLen = 6 + g.release * 26;
  const edge = (y) => rx * Math.sqrt(Math.max(0, 1 - ((y - cy) / ry) ** 2));
  const sideScale = (side) => (side === "l" ? 1 - g.asym * 0.25 : 1 + g.asym * 0.35);

  const out = [];
  const legs = [];
  const tendrils = [];

  // ---------- ноги ----------
  const leg = (side, x0, y0, baseAngle, scale, mutant) => {
    const s = side === "l" ? -1 : 1;
    const L = legLen * scale * sideScale(side);
    const lens = mutant ? [0.4, 0.45, 0.4, 0.3] : [0.55, 0.7, 0.5];
    const widths = mutant ? [5, 4, 3, 2] : [7, 5.2, 3.6];
    const chitin = mutant ? "#b0716a" : "#2b1a10";
    let px = x0;
    let py = y0;
    let ang = baseAngle;
    const pts = [[px, py]];
    lens.forEach((len, k) => {
      if (k > 0) ang += r(18, 42);
      px += s * Math.cos(rad(ang)) * L * len;
      py += Math.sin(rad(ang)) * L * len;
      pts.push([px, py]);
    });
    let svg = "";
    for (let k = 0; k < lens.length; k++) {
      const [ax, ay] = pts[k];
      const [bx, by] = pts[k + 1];
      svg += `<path d="M${f(ax)} ${f(ay)} L${f(bx)} ${f(by)}" stroke="${chitin}" stroke-width="${widths[k]}" stroke-linecap="round" fill="none"/>`;
      if (!mutant) svg += `<path d="M${f(ax)} ${f(ay - 1.4)} L${f(bx)} ${f(by - 1.4)}" stroke="#d99a4a" stroke-opacity=".45" stroke-width="1.4" stroke-linecap="round" fill="none"/>`;
    }
    for (let k = 1; k < pts.length - 1; k++) {
      svg += mutant
        ? `<circle cx="${f(pts[k][0])}" cy="${f(pts[k][1])}" r="${f(widths[k - 1] * 0.8)}" fill="url(#tum${u})" stroke="#3b1b1c" stroke-width=".8"/>`
        : `<circle cx="${f(pts[k][0])}" cy="${f(pts[k][1])}" r="${f(widths[k - 1] * 0.62)}" fill="#3a1b17" stroke="#0e0603" stroke-width="1"/>` +
          `<circle cx="${f(pts[k][0] - 0.8)}" cy="${f(pts[k][1] - 0.9)}" r="${f(widths[k - 1] * 0.22)}" fill="#c98279" fill-opacity=".6"/>`;
    }
    // щетинки на голени
    const [ta, tb] = [pts[1], pts[2]];
    const bristles = 2 + n("noise", 3);
    for (let b = 0; b < bristles; b++) {
      const t = (b + 1) / (bristles + 1);
      const bx = ta[0] + (tb[0] - ta[0]) * t;
      const by = ta[1] + (tb[1] - ta[1]) * t;
      svg += `<path d="M${f(bx)} ${f(by)} l${f(s * r(2, 5))} ${f(r(-6, -3))}" stroke="#1d0f08" stroke-width="1" stroke-linecap="round" fill="none"/>`;
    }
    // коготь
    const [ex, ey] = pts[pts.length - 1];
    svg += `<path d="M${f(ex)} ${f(ey)} q${f(s * 4)} ${f(5)} ${f(s * 1)} ${f(9)}" stroke="#120804" stroke-width="2" stroke-linecap="round" fill="none"/>`;
    legs.push(svg);
  };

  const attach = [
    { y: pronCy, x: pronRx - 2, ang: -28 },
    { y: top + ry * 0.35, x: 0, ang: 8 },
    { y: top + ry * 0.85, x: 0, ang: 48 },
  ];
  attach.forEach((a, i) => {
    for (const side of ["l", "r"]) {
      const half = i === 0 ? a.x : edge(a.y) - 3;
      const x0 = cx + (side === "l" ? -half : half);
      leg(side, x0, a.y, a.ang + r(-6, 6), 1 - i * 0.05, false);
    }
  });
  for (let k = 0; k < n("extraLegs", 4); k++) {
    const side = rnd() < 0.5 ? "l" : "r";
    const y = r(top + ry * 0.1, top + ry * 1.6);
    const half = Math.max(8, edge(Math.min(y, bottom - 4)) - 3);
    const x0 = cx + (side === "l" ? -half : half);
    const img = LEG_IMAGES[Math.floor(rnd() * LEG_IMAGES.length)];
    const angle = r(-50, 75);
    const len = (legLen * 1.5 * sideScale(side) * r(0.8, 1.2)) / img.w;
    const mirror = side === "l" ? "scale(-1 1) " : "";
    legs.push(
      `<image href="${img.href}" width="${img.w}" height="${img.h}" ` +
        `transform="translate(${f(x0)} ${f(y)}) ${mirror}rotate(${f(angle)}) scale(${f(len * 1000) / 1000}) translate(${f(-img.hx * img.w)} ${f(-img.hy * img.h)})"/>`
    );
  }

  // ---------- усы и щупальца ----------
  const wavy = (x0, y0, x1, y1, amp) => {
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    return `M${f(x0)} ${f(y0)} C ${f(mx + amp)} ${f(y0 - Math.abs(amp) * 0.6)}, ${f(mx - amp)} ${f(my)}, ${f(x1)} ${f(y1)}`;
  };
  const antLen = 40 + g.pulseRate * 80;
  const antW = 2.2 + g.attack * 2.6;
  for (const side of ["l", "r"]) {
    const s = side === "l" ? -1 : 1;
    const len = antLen * sideScale(side);
    const d = wavy(cx + s * 5, headCy - headR + 3, cx + s * (28 + len * 0.5), 46 + len * 1.05, s * 24);
    tendrils.push(
      `<g class="ant ant-${side}"><path d="${d}" stroke="#2b1a10" stroke-width="${f(antW)}" fill="none" stroke-linecap="round"/>` +
        `<path d="${d}" stroke="#e1a56d" stroke-opacity=".35" stroke-width="${f(antW * 0.35)}" fill="none" stroke-linecap="round"/></g>`
    );
  }
  for (let k = 0; k < n("tendrils", 6); k++) {
    const s = rnd() < 0.5 ? -1 : 1;
    const x0 = cx + s * r(4, headR + pronRx * 0.4);
    const y0 = r(headCy - headR * 0.3, pronCy + 6);
    const x1 = cx + s * r(30, 100);
    const y1 = y0 + r(-30, 70);
    const pale = k % 2 === 0;
    const d = wavy(x0, y0, x1, y1, s * r(10, 30));
    tendrils.push(
      `<g class="tendril" style="animation-delay:${f(r(0, 2))}s"><path d="${d}" stroke="${pale ? "#a85f58" : "#1c1c1f"}" stroke-width="${f(r(1.6, 3.4))}" fill="none" stroke-linecap="round"/>` +
        `<path d="${d}" stroke="#fff" stroke-opacity=".14" stroke-width=".9" fill="none" stroke-linecap="round"/>` +
        `<path d="M${f(x1)} ${f(y1)} l${f(s * 5)} ${f(-5)} m${f(-s * 5)} ${f(5)} l${f(s * 5)} ${f(5)}" stroke="${pale ? "#c98279" : "#1c1c1f"}" stroke-width="1.4" fill="none" stroke-linecap="round"/></g>`
    );
  }

  // ---------- проволочный хвост ----------
  const tx = cx + g.asym * 8;
  const ty = bottom + tailLen;
  const wire = `M${cx} ${f(bottom - 6)} C ${f(cx - 10)} ${f(bottom + tailLen * 0.35)}, ${f(tx + 10)} ${f(bottom + tailLen * 0.7)}, ${f(tx)} ${f(ty)}`;
  const tail =
    `<path d="${wire}" stroke="#202225" stroke-width="2.6" fill="none" stroke-linecap="round"/>` +
    `<path d="${wire}" stroke="#aeb4bb" stroke-opacity=".5" stroke-width=".9" fill="none"/>` +
    `<circle cx="${f(tx)}" cy="${f(ty + 5)}" r="5" stroke="#8a9098" stroke-width="2.2" fill="none"/>` +
    `<path d="M${f(tx)} ${f(ty + 10)} q1 6 0 9" stroke="#d98e8a" stroke-opacity=".6" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;

  // ---------- тело ----------
  const body = [];
  body.push(
    `<ellipse cx="${cx}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" fill="url(#tflesh${u})"/>`,
    `<ellipse cx="${cx}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" fill="url(#fl${u})" fill-opacity=".45"/>`
  );

  // вены: случайное блуждание, видны в основном в разошедшихся пластинах
  const veins = 3 + n("wet", 5);
  let veinSvg = "";
  for (let k = 0; k < veins; k++) {
    let x = cx + r(-rx * 0.5, rx * 0.5);
    let y = r(top + 8, bottom - 8);
    let d = `M${f(x)} ${f(y)}`;
    for (let sgm = 0; sgm < 6; sgm++) {
      x += r(-9, 9);
      y += r(-7, 12);
      d += ` L${f(x)} ${f(y)}`;
    }
    veinSvg += `<path d="${d}" stroke="#7d1620" stroke-opacity=".75" stroke-width="${f(r(0.8, 1.6))}" fill="none" stroke-linejoin="round"/>`;
  }
  body.push(`<g clip-path="url(#cl${u})">${veinSvg}</g>`);

  // бронзовые пластины с рваным краем
  const gap = g.exposed * rx * 0.85;
  const plate = (side) => {
    const s = side === "l" ? -1 : 1;
    const jag = 2.5 + g.exposed * 4.5;
    const edgeX = cx + s * gap + (side === "r" ? g.asym * 8 : 0);
    const segs = 14;
    const y0 = top - 3;
    const y1 = bottom + 3;
    let d = `M${f(cx + s * (rx + 3))} ${f(y0)} L${f(edgeX)} ${f(y0)}`;
    for (let k = 1; k <= segs; k++) {
      d += ` L${f(edgeX + s * r(-jag, jag * 0.4))} ${f(y0 + ((y1 - y0) * k) / segs)}`;
    }
    d += ` L${f(cx + s * (rx + 3))} ${f(y1)} Z`;
    return d;
  };
  const dL = plate("l");
  const dR = plate("r");
  body.push(
    `<g clip-path="url(#cl${u})">` +
      `<path d="${dL}" fill="url(#tbronze${u})" stroke="#1c0f08" stroke-width="2"/>` +
      `<path d="${dR}" fill="url(#tbronze${u})" stroke="#1c0f08" stroke-width="2"/>` +
      `<path d="${dL}" fill="url(#pl${u})" fill-opacity=".5"/>` +
      `<path d="${dR}" fill="url(#pl${u})" fill-opacity=".5"/>`
  );
  // коррозия и точки на пластинах
  const pits = 3 + n("noise", 14);
  for (let k = 0; k < pits; k++) {
    const px = cx + r(-rx, rx);
    const py = r(top, bottom);
    body.push(`<circle cx="${f(px)}" cy="${f(py)}" r="${f(r(0.8, 2.4))}" fill="${k % 3 ? "#1c0f08" : "#4d6b55"}" fill-opacity=".55"/>`);
  }
  // трещины на пластинах
  for (let k = 0; k < 2 + n("exposed", 3); k++) {
    let x = cx + r(-rx * 0.9, rx * 0.9);
    let y = r(top, top + ry * 0.8);
    let d = `M${f(x)} ${f(y)}`;
    for (let sgm = 0; sgm < 5; sgm++) {
      x += r(-5, 5);
      y += r(4, 14);
      d += ` L${f(x)} ${f(y)}`;
    }
    body.push(`<path d="${d}" stroke="#0e0603" stroke-width="${f(r(0.9, 1.7))}" fill="none" stroke-linejoin="round" stroke-opacity=".85"/>`);
  }
  // рёбра-кольца
  const rings = 3 + n("wave", 5);
  for (let k = 1; k <= rings; k++) {
    const y = top + (k * 2 * ry) / (rings + 1);
    const e = edge(y);
    const arc = `M${f(cx - e)} ${f(y)} Q ${cx} ${f(y + 7)} ${f(cx + e)} ${f(y)}`;
    body.push(
      `<path d="${arc}" stroke="#2d0f12" stroke-width="2.4" fill="none" stroke-opacity=".8"/>` +
        `<path d="M${f(cx - e)} ${f(y + 2.2)} Q ${cx} ${f(y + 9.2)} ${f(cx + e)} ${f(y + 2.2)}" stroke="#ffd9c8" stroke-opacity=".22" stroke-width="1.2" fill="none"/>`
    );
  }
  body.push(`<ellipse cx="${cx}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" fill="url(#sh${u})"/>`);
  body.push(`</g>`);

  // щетинки по краю
  const bristleCount = n("noise", 12);
  for (let k = 0; k < bristleCount; k++) {
    const a = r(-Math.PI * 0.45, Math.PI * 0.45);
    const side = rnd() < 0.5 ? -1 : 1;
    const bx = cx + side * rx * Math.cos(a);
    const by = cy + ry * Math.sin(a);
    body.push(`<path d="M${f(bx)} ${f(by)} l${f(side * r(4, 9))} ${f(r(-3, 5))}" stroke="#1d0f08" stroke-width="1.1" stroke-linecap="round" fill="none"/>`);
  }

  // пласт кожи с наростами (картинка): проступает на теле, когда нарывов много
  if (g.tumors >= 0.3) {
    const slabW = rx * 1.7 * (0.6 + g.tumors * 0.6);
    const slabH = (slabW * 306) / 320;
    const sx = cx + r(-rx * 0.2, rx * 0.2);
    const sy = r(top + ry * 0.5, top + ry * 1.3);
    body.push(
      `<g clip-path="url(#cl${u})"><image href="assets/growths.webp" x="${f(sx - slabW / 2)}" y="${f(sy - slabH / 2)}" ` +
        `width="${f(slabW)}" height="${f(slabH)}" transform="rotate(${f(r(-25, 25))} ${f(sx)} ${f(sy)})" opacity=".92"/></g>`
    );
  }

  // нарывы
  for (let k = 0; k < n("tumors", 8); k++) {
    const a = r(0, Math.PI * 2);
    const rr = Math.sqrt(rnd()) * 0.78;
    const tx0 = cx + Math.cos(a) * rx * rr;
    const ty0 = cy + Math.sin(a) * ry * rr;
    const tr = r(4, 10.5);
    const slit = k % 3 === 2;
    body.push(
      `<g class="tumor" style="animation-delay:${f(r(0, 1.5))}s">` +
        `<circle cx="${f(tx0)}" cy="${f(ty0)}" r="${f(tr)}" fill="url(#tbruise${u})" stroke="#4a1a20" stroke-width="1"/>` +
        `<circle cx="${f(tx0)}" cy="${f(ty0)}" r="${f(tr)}" fill="url(#tum${u})" fill-opacity=".4"/>` +
        (slit
          ? `<path d="M${f(tx0 - tr * 0.55)} ${f(ty0 + 1)} Q ${f(tx0)} ${f(ty0 - 2.5)} ${f(tx0 + tr * 0.55)} ${f(ty0 + 1)}" stroke="#2a0709" stroke-width="1.7" fill="none" stroke-linecap="round"/>` +
            `<path d="M${f(tx0)} ${f(ty0 + 2)} q.6 ${f(tr * 0.7)} 0 ${f(tr * 1.1)}" stroke="#e8b6a6" stroke-opacity=".7" stroke-width="1.5" fill="none" stroke-linecap="round"/>`
          : "") +
        `<ellipse cx="${f(tx0 - tr * 0.3)}" cy="${f(ty0 - tr * 0.35)}" rx="${f(tr * 0.32)}" ry="${f(tr * 0.2)}" fill="#fff" fill-opacity=".6"/>` +
        `</g>`
    );
  }

  // пятно с глазами (картинка): появляется, когда глаз три и больше, растёт с их числом
  if (n("eyes", 6) >= 3) {
    const w = 24 + (n("eyes", 6) - 2) * 7;
    const h = (w * 217) / 256;
    const ex = cx + r(-rx * 0.4, rx * 0.4);
    const ey = top + ry * r(0.25, 0.9);
    body.push(
      `<image href="assets/eyes.webp" x="${f(ex - w / 2)}" y="${f(ey - h / 2)}" width="${f(w)}" height="${f(h)}" ` +
        `transform="rotate(${f(r(-30, 30))} ${f(ex)} ${f(ey)})"/>`
    );
  }

  // пучки щупалец (картинка) растут из края тела наружу
  if (g.tendrils >= 0.5) {
    for (let k = 0; k < Math.floor(g.tendrils * 3); k++) {
      const side = rnd() < 0.5 ? -1 : 1;
      const y = r(top + ry * 0.2, top + ry * 1.5);
      const x0 = cx + side * (Math.max(6, edge(Math.min(y, bottom - 4))) - 2);
      const w = r(30, 46);
      const h = (w * 231) / 300;
      const ang = side * r(55, 105);
      body.push(
        `<image href="assets/tendrils.webp" width="${f(w)}" height="${f(h)}" ` +
          `transform="translate(${f(x0)} ${f(y)}) rotate(${f(ang)}) translate(${f(-w * 0.5)} ${f(-h * 0.9)})"/>`
      );
    }
  }

  // ---------- переднеспинка, голова ----------
  const front = [];
  front.push(
    `<ellipse cx="${cx}" cy="${f(pronCy)}" rx="${f(pronRx)}" ry="${pronRy}" fill="url(#tbronze${u})" stroke="#1c0f08" stroke-width="2"/>`,
    `<ellipse cx="${cx}" cy="${f(pronCy)}" rx="${f(pronRx)}" ry="${pronRy}" fill="url(#pl${u})" fill-opacity=".5"/>`,
    `<path d="M${f(cx - pronRx * 0.4)} ${f(pronCy - 3)} L${f(cx + pronRx * 0.1)} ${f(pronCy + 2)} L${f(cx + pronRx * 0.5)} ${f(pronCy - 2)}" stroke="#c0736c" stroke-width="2.2" fill="none" stroke-linejoin="round"/>`,
    `<circle cx="${cx}" cy="${headCy}" r="${f(headR)}" fill="url(#tbronze${u})" stroke="#1c0f08" stroke-width="2"/>`,
    `<circle cx="${cx}" cy="${headCy}" r="${f(headR)}" fill="url(#hd${u})" fill-opacity=".62"/>`
  );

  // жвалы
  const m = 0.4 + g.mandibles * 1.0;
  const mandible = (s, scale, tilt) => {
    const x0 = cx + s * headR * 0.45;
    const y0 = headCy - headR * 0.75;
    const d =
      `M${f(x0)} ${f(y0)} Q ${f(x0 + s * 14 * scale)} ${f(y0 - 10 * scale - tilt)}, ${f(x0 + s * 7 * scale)} ${f(y0 - 24 * scale)}` +
      ` Q ${f(x0 + s * 6 * scale)} ${f(y0 - 12 * scale)} ${f(x0 - s * 2)} ${f(y0 + 3)} Z`;
    return `<path d="${d}" fill="#20120a" stroke="#0c0604" stroke-width="1"/><path d="${d}" fill="none" stroke="#d99a4a" stroke-opacity=".35" stroke-width=".8" transform="translate(${f(-s * 0.8)} -.8)"/>`;
  };
  front.push(mandible(-1, m * sideScale("l"), 0), mandible(1, m * sideScale("r"), 0));
  if (g.mandibles > 0.7) front.push(mandible(-1, m * 0.55, 6), mandible(1, m * 0.55, 6));
  front.push(`<path d="M${f(cx - 3)} ${f(headCy - headR + 1)} q3 5 6 0" stroke="#7a2630" stroke-width="2" fill="none" stroke-linecap="round"/>`);

  // глаза
  const eye = (ex, ey, er) => {
    let veinsEye = "";
    for (let k = 0; k < 7; k++) {
      const a = r(0, Math.PI * 2);
      veinsEye += `<path d="M${f(ex + Math.cos(a) * er)} ${f(ey + Math.sin(a) * er)} L${f(ex + Math.cos(a) * er * 0.45)} ${f(ey + Math.sin(a) * er * 0.45)}" stroke="#a3242c" stroke-width="${f(Math.max(0.5, er * 0.1))}" stroke-linecap="round"/>`;
    }
    // без век и ресниц: вздутый, воспалённый глаз в тёмной впадине, зрачок-щель
    return (
      `<g><circle cx="${f(ex)}" cy="${f(ey)}" r="${f(er * 1.28)}" fill="#2a0a10" fill-opacity=".85"/>` +
      `<circle cx="${f(ex)}" cy="${f(ey)}" r="${f(er)}" fill="#c9a08a" stroke="#3a0d14" stroke-width="${f(Math.max(0.8, er * 0.2))}"/>` +
      veinsEye +
      `<circle cx="${f(ex + er * 0.1)}" cy="${f(ey + er * 0.08)}" r="${f(er * 0.6)}" fill="#8a5a1c"/>` +
      `<ellipse cx="${f(ex + er * 0.1)}" cy="${f(ey + er * 0.08)}" rx="${f(er * 0.12)}" ry="${f(er * 0.56)}" fill="#050203"/>` +
      `<circle cx="${f(ex - er * 0.28)}" cy="${f(ey - er * 0.3)}" r="${f(er * 0.11)}" fill="#fff" fill-opacity=".7"/></g>`
    );
  };
  const eyeCount = n("eyes", 6);
  const eyes = [];
  for (let k = 0; k < eyeCount; k++) {
    if (k < 2) {
      const s = k === 0 ? -1 : 1;
      eyes.push(eye(cx + s * headR * 0.58, headCy - headR * 0.05, headR * 0.3 * sideScale(s < 0 ? "l" : "r")));
    } else {
      // лишние глаза разбросаны по голове, переднеспинке и телу
      const zone = rnd();
      let ex;
      let ey;
      if (zone < 0.4) {
        ex = cx + r(-headR * 0.7, headR * 0.7);
        ey = headCy + r(-headR * 0.3, headR * 0.8);
      } else if (zone < 0.7) {
        ex = cx + r(-pronRx * 0.8, pronRx * 0.8);
        ey = pronCy + r(-6, 6);
      } else {
        ex = cx + r(-rx * 0.6, rx * 0.6);
        ey = r(top + 6, top + ry * 0.9);
      }
      eyes.push(eye(ex, ey, r(2, 5.5)));
    }
  }
  front.push(...eyes);

  // ---------- определения: градиенты и фильтр ----------
  const tex = (name) =>
    `<pattern id="t${name}${u}" patternUnits="userSpaceOnUse" width="200" height="200"><image href="assets/tex-${name}.webp" width="200" height="200" preserveAspectRatio="none"/></pattern>`;
  const defs = `
    ${tex("flesh")}${tex("bruise")}${tex("bronze")}
    <radialGradient id="fl${u}" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#d9a08f"/><stop offset=".35" stop-color="#b5625f"/><stop offset=".7" stop-color="#7a3038"/><stop offset="1" stop-color="#36111a"/></radialGradient>
    <radialGradient id="tum${u}" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#e9aa98"/><stop offset=".55" stop-color="#b4524f"/><stop offset="1" stop-color="#5e1a24"/></radialGradient>
    <radialGradient id="hd${u}" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#9c6a35"/><stop offset=".6" stop-color="#5a3519"/><stop offset="1" stop-color="#22120a"/></radialGradient>
    <linearGradient id="pl${u}" gradientUnits="userSpaceOnUse" x1="${f(cx - rx)}" y1="0" x2="${f(cx + rx)}" y2="0">
      <stop offset="0" stop-color="#2a1809"/><stop offset=".3" stop-color="#a8742f"/><stop offset=".5" stop-color="#d9a04e"/><stop offset=".72" stop-color="#7a4c1e"/><stop offset="1" stop-color="#2a1809"/></linearGradient>
    <radialGradient id="sh${u}" cx=".42" cy=".38" r=".75"><stop offset=".45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".62"/></radialGradient>
    <clipPath id="cl${u}"><ellipse cx="${cx}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}"/></clipPath>`;
  const filter = lite
    ? ""
    : `<filter id="wt${u}" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency=".04" numOctaves="2" seed="${seed}" result="n"/>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="${f(3 + g.asym * 5)}" xChannelSelector="R" yChannelSelector="G" result="d"/>
        <feSpecularLighting in="n" surfaceScale="1.8" specularConstant="${f(0.3 + g.wet * 0.55)}" specularExponent="22" lighting-color="#ffcfc0" result="s">
          <fePointLight x="70" y="30" z="130"/>
        </feSpecularLighting>
        <feComposite in="s" in2="d" operator="in" result="s2"/>
        <feComposite in="d" in2="s2" operator="arithmetic" k1="0" k2="1" k3="${f(0.32 + g.wet * 0.38)}" k4="0"/>
      </filter>`;

  const flesh = [...legs, ...tendrils, tail, ...body, ...front].join("");
  out.push(
    `<svg class="bug-svg${lite ? " lite" : ""}" viewBox="0 0 240 300" role="img" aria-label="Жук" xmlns="http://www.w3.org/2000/svg">` +
      `<defs>${defs}${filter}</defs>` +
      `<g class="flesh"${lite ? "" : ` filter="url(#wt${u})"`}>${flesh}</g></svg>`
  );
  return out.join("");
}
