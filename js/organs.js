// Органы управления: ручки вшиты в тело жука. Тянешь орган вверх-вниз, значение меняется.
// Каждый орган — картинка в четырёх состояниях (assets/organs/<id>-0…3.webp), они плавно перетекают по значению.
// Пока картинок нет, рисуется временная заглушка кодом. «Зажим» переключается касанием.
const NS = "http://www.w3.org/2000/svg";
const SPRITE_BASE = "assets/organs/";

const GRADIENTS = `
  <radialGradient id="og-bronze" cx=".38" cy=".32" r=".85"><stop offset="0" stop-color="#e2b46a"/><stop offset=".55" stop-color="#8d5a22"/><stop offset="1" stop-color="#2b1708"/></radialGradient>
  <radialGradient id="og-olive" cx=".38" cy=".32" r=".85"><stop offset="0" stop-color="#b8b27a"/><stop offset=".55" stop-color="#5d5a2c"/><stop offset="1" stop-color="#1d1c0c"/></radialGradient>
  <radialGradient id="og-mouth" cx=".4" cy=".3" r=".85"><stop offset="0" stop-color="#ecd2c0"/><stop offset=".55" stop-color="#b98672"/><stop offset="1" stop-color="#4a241d"/></radialGradient>
  <radialGradient id="og-raw" cx=".4" cy=".3" r=".85"><stop offset="0" stop-color="#e88a78"/><stop offset=".55" stop-color="#a02e2e"/><stop offset="1" stop-color="#3a0c10"/></radialGradient>
  <radialGradient id="og-sac" cx=".4" cy=".3" r=".85"><stop offset="0" stop-color="#f2e6d8"/><stop offset=".5" stop-color="#cdb7a2"/><stop offset="1" stop-color="#6a5448"/></radialGradient>
  <radialGradient id="og-eye" cx=".4" cy=".3" r=".8"><stop offset="0" stop-color="#f4ecd8"/><stop offset=".7" stop-color="#cdb99a"/><stop offset="1" stop-color="#7a5a46"/></radialGradient>`;

// toggle: орган-переключатель (касание), остальные тянутся
// name и hint показываются в плашках: при касании органа и на экране «Как играть»
export const ORGANS = [
  { id: "pitch", name: "Питч", hint: "Высота звука. Тяни вверх: выше, вниз: ниже.", anchor: "legL", r: 22, kind: "bronze" },
  { id: "trill", name: "Стрекот", hint: "Дрожание громкости: от ровного звука до быстрого треска.", anchor: "legR", r: 22, kind: "olive" },
  { id: "glide", name: "Скольжение", hint: "Насколько лениво высота доезжает до новой ноты.", anchor: "hindL", r: 22, kind: "bronze" },
  { id: "scrub", name: "Скраб", hint: "Игла по записи: выбираешь, какой кусок насекомого звучит.", anchor: "hindR", r: 22, kind: "raw" },
  { id: "filter", name: "Рот", hint: "Фильтр. Закрыт: звук глухой, открыт: яркий.", anchor: "head", r: 22, kind: "mouth" },
  { id: "env", name: "Неохота", hint: "Жук неохотно включается и долго затихает.", anchor: "antenna", r: 20, kind: "mouth" },
  { id: "dist", name: "Грязь", hint: "Искажение. Чем выше, тем грязнее звук и тем сильнее мутирует тело.", anchor: "thorax", r: 24, kind: "raw" },
  { id: "detune", name: "Второй жук", hint: "Расстройка: внутри звучит ещё одна копия, чуть выше и чуть ниже.", anchor: "flankL", r: 22, kind: "olive" },
  { id: "latch", name: "Зажим", hint: "Коснись глаза: звук держится без пальца. Нажми на тело ещё раз: тишина.", anchor: "flankR", r: 20, kind: "eye", toggle: true },
  { id: "reverb", name: "Эхо", hint: "Реверберация. Брюхо набухает, звук растягивается в пространство.", anchor: "belly", r: 28, kind: "sac" },
  { id: "delay", name: "Повтор", hint: "Эхо-повторы: жук повторяет сам себя, повторы затухают.", anchor: "tail", r: 22, kind: "sac" },
];

// Какие органы уже нарисованы: проверяем, грузится ли первая и последняя картинка состояний.
const spriteOk = new Map();
function probe(id) {
  if (!spriteOk.has(id)) {
    const load = (n) =>
      new Promise((res) => {
        const im = new Image();
        im.onload = () => res(true);
        im.onerror = () => res(false);
        im.src = `${SPRITE_BASE}${id}-${n}.webp`;
      });
    spriteOk.set(id, Promise.all([load(0), load(3)]).then(([a, b]) => a && b));
  }
  return spriteOk.get(id);
}

function arc(r, t) {
  // дуга от −135° до +135° (270° шкалы), t 0..1
  const a0 = (-225 * Math.PI) / 180;
  const a1 = a0 + t * ((270 * Math.PI) / 180);
  const p = (a) => `${(Math.cos(a) * r).toFixed(1)} ${(Math.sin(a) * r).toFixed(1)}`;
  if (t < 0.005) return "";
  return `M${p(a0)} A${r} ${r} 0 ${t > 0.667 ? 1 : 0} 1 ${p(a1)}`;
}

// временная заглушка, пока нет картинки органа
const inner = {
  bronze: (r) => `<line class="needle" x1="0" y1="0" x2="0" y2="${-r * 0.6}" stroke="#150a05" stroke-width="3.5" stroke-linecap="round"/><circle r="${r * 0.14}" fill="#150a05"/>`,
  olive: (r) => `<circle class="ticks" r="${r * 0.52}" fill="none" stroke="#14110a" stroke-width="5" stroke-dasharray="2 7"/><circle r="${r * 0.2}" fill="#14110a"/>`,
  mouth: (r) => `<ellipse class="mouth" rx="${r * 0.62}" ry="3" fill="#14060a" stroke="#f0e2cf" stroke-width="2.4" stroke-dasharray="2 3"/>`,
  raw: (r) => `<ellipse class="slit" rx="3" ry="${r * 0.5}" fill="#12040a" stroke="#ff9a86" stroke-width="1.6" stroke-dasharray="2 3"/>`,
  sac: (r) => `<circle class="bulb" r="${r * 0.3}" fill="#fff" fill-opacity=".28" stroke="#fff" stroke-opacity=".55" stroke-width="2"/>`,
  eye: (r) => `<circle class="iris" r="${r * 0.5}" fill="#6f7f3a"/><ellipse class="pupil" rx="${r * 0.12}" ry="${r * 0.45}" fill="#060203"/><path class="lid" d="" fill="#3a1a14" stroke="#150806" stroke-width="2"/>`,
};

function placeholder(o) {
  const r = o.r;
  return (
    `<g class="ph">` +
    `<circle r="${r * 1.6}" fill="#000" opacity=".3"/>` +
    `<circle r="${r}" fill="url(#og-${o.kind})" stroke="#1d0a08" stroke-width="3"/>` +
    `<circle r="${r * 0.86}" fill="none" stroke="#d2a35a" stroke-width="2" stroke-dasharray="2 5" opacity=".85"/>` +
    `<path class="arc" fill="none" stroke="#ffd9bc" stroke-width="4.5" stroke-linecap="round" d=""/>` +
    inner[o.kind](r) +
    `<circle cx="${-r * 0.38}" cy="${-r * 0.42}" r="${r * 0.16}" fill="#fff" opacity=".5"/>` +
    `</g>`
  );
}

export function createOrgans(view, onChange, onInfo = () => {}) {
  const { svg, organs, anchors } = view;
  const defs = document.createElementNS(NS, "defs");
  defs.innerHTML = GRADIENTS;
  svg.insertBefore(defs, svg.firstChild);

  const state = {};
  const ui = {};

  for (const o of ORGANS) {
    const [x, y] = anchors[o.anchor];
    const g = document.createElementNS(NS, "g");
    g.setAttribute("class", `organ organ-${o.kind}${o.toggle ? " toggle" : ""}`);
    g.setAttribute("transform", `translate(${x} ${y})`);
    const size = o.r * 2.8;
    g.innerHTML =
      placeholder(o) +
      `<g class="sprite" hidden></g>` +
      `<circle class="hit" r="${o.r * 1.45}" fill="transparent"/>`;
    organs.appendChild(g);
    state[o.id] = 0;
    const ph = g.querySelector(".ph");
    const sprite = g.querySelector(".sprite");
    const arcEl = g.querySelector(".arc");
    const parts = {
      needle: g.querySelector(".needle"), ticks: g.querySelector(".ticks"), mouth: g.querySelector(".mouth"),
      slit: g.querySelector(".slit"), bulb: g.querySelector(".bulb"), lid: g.querySelector(".lid"),
    };
    let frames = null;

    const set = (v) => {
      state[o.id] = v;
      if (o.toggle) g.classList.toggle("on", v > 0.5);
      if (frames) {
        // четыре состояния: соседние смешиваются по значению
        const f = v * 3;
        frames.forEach((im, i) => im.setAttribute("opacity", String(Math.max(0, 1 - Math.abs(f - i)))));
        return;
      }
      arcEl.setAttribute("d", o.toggle ? "" : arc(o.r * 1.12, v));
      if (parts.needle) parts.needle.setAttribute("transform", `rotate(${(v - 0.5) * 270})`);
      if (parts.ticks) {
        parts.ticks.style.animationDuration = `${v < 0.02 ? 0 : 3.2 - v * 2.9}s`;
        parts.ticks.style.animationPlayState = v < 0.02 ? "paused" : "running";
      }
      if (parts.mouth) parts.mouth.setAttribute("ry", String(2 + v * o.r * 0.55));
      if (parts.slit) parts.slit.setAttribute("rx", String(2 + v * o.r * 0.55));
      if (parts.bulb) parts.bulb.setAttribute("r", String(o.r * (0.22 + v * 0.62)));
      if (parts.lid) {
        const r = o.r;
        // закрытое веко: звук только пока жмёшь; открытое: зажим включён
        parts.lid.setAttribute("d", v > 0.5 ? "" : `M${-r} ${r * 0.2} Q0 ${r * 0.7} ${r} ${r * 0.2} L${r} ${-r * 1.05} L${-r} ${-r * 1.05} Z`);
      }
    };
    ui[o.id] = set;

    probe(o.id).then((ok) => {
      if (!ok) return;
      sprite.innerHTML = [0, 1, 2, 3]
        .map((i) => `<image href="${SPRITE_BASE}${o.id}-${i}.webp" x="${-size / 2}" y="${-size / 2}" width="${size}" height="${size}" opacity="0"/>`)
        .join("");
      frames = [...sprite.querySelectorAll("image")];
      sprite.removeAttribute("hidden");
      ph.setAttribute("hidden", "");
      set(state[o.id]);
    });

    // подсказка: на компьютере при наведении, на телефоне при касании
    g.addEventListener("pointerenter", (e) => {
      if (e.pointerType === "mouse") onInfo(o, state[o.id], "hover");
    });
    g.addEventListener("pointerleave", (e) => {
      if (e.pointerType === "mouse" && !g.classList.contains("grab")) onInfo(o, state[o.id], "end");
    });

    if (o.toggle) {
      g.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        e.preventDefault();
        const v = state[o.id] > 0.5 ? 0 : 1;
        set(v);
        onChange(o.id, v);
        onInfo(o, v, "touch");
      });
      g.addEventListener("pointerup", () => onInfo(o, state[o.id], "end"));
      continue;
    }

    // перетаскивание вверх-вниз; 0,35 высоты картинки = весь диапазон
    let drag = null;
    g.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      e.preventDefault();
      try { g.setPointerCapture(e.pointerId); } catch (_) {}
      const h = svg.getBoundingClientRect().height;
      drag = { y: e.clientY, v: state[o.id], span: h * 0.35 };
      g.classList.add("grab");
      onInfo(o, state[o.id], "touch");
    });
    g.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const v = Math.min(1, Math.max(0, drag.v + (drag.y - e.clientY) / drag.span));
      set(v);
      onChange(o.id, v);
      onInfo(o, v, "touch");
    });
    const end = () => {
      if (!drag) return;
      drag = null;
      g.classList.remove("grab");
      onInfo(o, state[o.id], "end");
    };
    g.addEventListener("pointerup", end);
    g.addEventListener("pointercancel", end);
    g.addEventListener("lostpointercapture", end);
  }

  return { set: (id, v) => ui[id]?.(v) };
}
