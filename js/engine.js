import { geneValue, mutationLoad } from "./genome.js";

const SAMPLE_LEVEL = 0.9; // записи нормализованы до −20 LUFS
const SAMPLE_REF = 440; // частота, на которой запись играет в исходной скорости
const SAMPLE_PITCH = { grasshopper: 2 }; // запись с яркой полосой 7–10 кГц играем ниже, иначе она уходит за срез динамика
export const SAMPLE_NAMES = ["longhorn", "cicada", "grasshopper", "cricket", "chorthippus"];
export const BASE_FREQ = 330;

const clamp01 = (x) => Math.min(1, Math.max(0, x));

function makeNoise(ctx) {
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

// Импульс реверберации: затухающий шум, к хвосту темнеет (простой фильтр по однополюсной схеме).
function makeImpulse(ctx, seconds = 2.8) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const k = 0.55 - 0.4 * t; // чем дальше, тем темнее
      lp += k * ((Math.random() * 2 - 1) - lp);
      d[i] = lp * Math.pow(1 - t, 2.6);
    }
  }
  return buf;
}

// Инструмент: один живой голос (запись насекомого плюс синтезированный тон), все ручки меняются на ходу.
// Ручки (0..1): pitch (0.5 = исходная высота, ±12 полутонов), filter, dist, reverb, trill.
// Принимает любой AudioContext, в том числе OfflineAudioContext.
// fx: набор строк для диагностики (отключают части цепи или гены), например ?fx=nocomp,nolfo
export class BugEngine {
  constructor(ctx, bug, fx = new Set()) {
    this.ctx = ctx;
    this.fx = fx;
    this.genome = bug.genome;
    this.samples = bug.samples || [];
    this.buffers = new Map();
    this.noiseBuf = makeNoise(ctx);
    this.voice = null;
    this.params = { pitch: 0.5, filter: 0.85, dist: 0, reverb: 0.2, trill: 0, delay: 0, env: 0, detune: 0, glide: 0, scrub: 0 };
    this.lastFreq = null;

    // шина голоса → фильтр («рот») → искажение («грязь») → сухой и реверберация
    this.bus = ctx.createGain();
    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.shaper = ctx.createWaveShaper();
    this.shaper.oversample = "2x";
    // компенсация громкости: искажение с нормировкой делает звук намного плотнее и громче, ручка «грязь» это сбавляет
    this.post = ctx.createGain();
    this.post.gain.value = 2;
    this.dry = ctx.createGain();
    this.wet = ctx.createGain();
    this.conv = ctx.createConvolver();
    this.conv.buffer = makeImpulse(ctx);
    this.out = ctx.createGain();
    this.out.gain.value = 0.5;
    this.bus.connect(this.filter);
    this.filter.connect(this.shaper);
    this.shaper.connect(this.post);
    this.post.connect(this.dry);
    this.post.connect(this.conv);
    this.conv.connect(this.wet);
    this.dry.connect(this.out);
    this.wet.connect(this.out);
    // эхо-повтор: повторы темнеют и затухают, часть уходит ещё и в реверберацию
    this.delay = ctx.createDelay(1.5);
    this.delay.delayTime.value = 0.31;
    this.delayFb = ctx.createGain();
    this.delayTone = ctx.createBiquadFilter();
    this.delayTone.type = "lowpass";
    this.delayTone.frequency.value = 3200;
    this.delayWet = ctx.createGain();
    this.post.connect(this.delay);
    this.delay.connect(this.delayTone);
    this.delayTone.connect(this.delayFb);
    this.delayFb.connect(this.delay);
    this.delayTone.connect(this.delayWet);
    this.delayWet.connect(this.out);
    this.delayWet.connect(this.conv);

    // мягкий срез верха: без него резкие гармоники пилы и FM «колются» на динамике телефона
    this.tone = ctx.createBiquadFilter();
    this.tone.type = "lowpass";
    this.tone.frequency.value = 5500;
    this.tone.Q.value = 0.5;
    // компрессор с настройками по умолчанию (12:1) «дышит» и хрустит на частых нотах, поэтому мягче
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -14;
    this.limiter.knee.value = 24;
    this.limiter.ratio.value = 3;
    this.limiter.attack.value = 0.01;
    this.limiter.release.value = 0.2;
    // страховка: плавное насыщение tanh вместо жёсткого обрезания, уровень никогда не выше 1
    // WaveShaper видит вход только в диапазоне −1..1, поэтому сигнал ослаблен втрое, а кривая tanh(3x) усиливает его обратно
    this.pre = ctx.createGain();
    this.pre.gain.value = 1 / 3;
    this.clip = ctx.createWaveShaper();
    const curve = new Float32Array(2048);
    for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh((i / (curve.length - 1)) * 6 - 3);
    this.clip.curve = curve;
    this.clip.oversample = "2x";
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.levelBuf = new Float32Array(this.analyser.fftSize);

    let node = this.out;
    const link = (n) => {
      node.connect(n);
      node = n;
    };
    if (!fx.has("notone")) link(this.tone);
    if (!fx.has("nocomp")) link(this.limiter);
    if (!fx.has("noclip")) {
      link(this.pre);
      link(this.clip);
    }
    node.connect(ctx.destination);
    node.connect(this.analyser);

    this.applyAll();
  }

  setBug(bug) {
    this.genome = bug.genome;
    this.samples = bug.samples || [];
  }

  // Записи насекомых: грузим и декодируем один раз. Если файл не загрузился, жук играет одним синтезом.
  async loadSamples(names = SAMPLE_NAMES, base = "assets/audio/") {
    await Promise.all(
      names.map(async (name) => {
        if (this.buffers.has(name)) return;
        try {
          const res = await fetch(`${base}${name}.wav`);
          if (!res.ok) return;
          const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
          this.buffers.set(name, buf);
        } catch (_) {}
      })
    );
  }

  // --- ручки ---
  get semitones() {
    return (this.params.pitch - 0.5) * 24;
  }
  get freq() {
    return BASE_FREQ * Math.pow(2, this.semitones / 12);
  }

  setParam(name, value) {
    this.params[name] = clamp01(value);
    this.apply(name);
  }

  applyAll() {
    for (const k of Object.keys(this.params)) this.apply(k);
  }

  apply(name) {
    const t = this.ctx.currentTime;
    const p = this.params;
    const smooth = 0.03;
    if (name === "filter") {
      // «рот»: закрыт — глухо и с резонансом, открыт — вся запись
      this.filter.frequency.setTargetAtTime(250 * Math.pow(14000 / 250, p.filter), t, smooth);
      this.filter.Q.setTargetAtTime(0.7 + (1 - p.filter) * 4, t, smooth);
    } else if (name === "dist") {
      // k растёт быстро: до 0,2 почти чисто, на максимуме жёсткий срез
      const k = 0.01 + p.dist * p.dist * 50;
      const n = 1024;
      const c = new Float32Array(n);
      const norm = Math.tanh(k);
      for (let i = 0; i < n; i++) c[i] = Math.tanh(k * ((i / (n - 1)) * 2 - 1)) / norm;
      this.shaper.curve = c;
      this.post.gain.setTargetAtTime(Math.max(0.3, 2 / (1 + 9 * p.dist * p.dist)), t, smooth);
    } else if (name === "reverb") {
      this.wet.gain.setTargetAtTime(p.reverb * 0.95, t, smooth);
      this.dry.gain.setTargetAtTime(1 - p.reverb * 0.35, t, smooth);
    } else if (name === "pitch") {
      this.lastFreq = this.freq;
      this.voice?.setFreq(this.freq, this.glideTime());
    } else if (name === "trill") {
      this.voice?.setTrill(p.trill);
    } else if (name === "delay") {
      this.delayWet.gain.setTargetAtTime(p.delay * 0.9, t, smooth);
      this.delayFb.gain.setTargetAtTime(p.delay < 0.01 ? 0 : 0.22 + p.delay * 0.5, t, smooth);
    } else if (name === "detune") {
      this.voice?.setDetune(p.detune);
    } else if (name === "scrub") {
      this.voice?.setScrub(p.scrub);
    }
  }

  // время, за которое высота доезжает до новой: ручка «скольжение»
  glideTime() {
    return 0.03 + this.params.glide * this.params.glide * 0.9;
  }

  // средний уровень выхода 0..1, нужен интерфейсу, чтобы дёргать тело в такт звуку
  level() {
    this.analyser.getFloatTimeDomainData(this.levelBuf);
    let s = 0;
    for (const x of this.levelBuf) s += x * x;
    return Math.sqrt(s / this.levelBuf.length);
  }

  // --- голос ---
  start(when) {
    if (this.voice) this.stop();
    const ctx = this.ctx;
    const fx = this.fx;
    const target = this.freq;
    // при скольжении голос стартует с прошлой высоты и доезжает до новой
    const freq = this.params.glide > 0.02 && this.lastFreq ? this.lastFreq : target;
    this.lastFreq = target;
    const P = this.params;
    const override = {
      pulseDepth: fx.has("nolfo") ? 0 : undefined,
      fmDepth: fx.has("nofm") ? 0 : undefined,
      noise: fx.has("nonoise") ? 0 : undefined,
      resonance: fx.has("noreso") ? 0 : undefined,
      release: fx.has("slow") ? 0.8 : undefined,
    };
    const g = (k) => {
      if (override[k] !== undefined) return k === "release" ? override[k] : 0;
      return geneValue(this.genome, k);
    };
    const t = when ?? ctx.currentTime;
    const stop = [];

    // груз мутаций (0..1): тело гибрида делает звук грязнее. У обычных жуков около нуля.
    const load = fx.has("nomut") ? 0 : mutationLoad(this.genome);
    const jitter = () => Math.random() - 0.5;
    const wave = g("wave");

    const saw = ctx.createOscillator();
    saw.type = "sawtooth";
    saw.frequency.value = freq;
    const sawDet = jitter() * load * 40;
    saw.detune.value = sawDet;
    const sq = ctx.createOscillator();
    sq.type = "square";
    sq.frequency.value = freq;
    const sqDet = jitter() * load * 40;
    sq.detune.value = sqDet;
    const sawGain = ctx.createGain();
    sawGain.gain.value = 0.5 * (1 - wave);
    const sqGain = ctx.createGain();
    sqGain.gain.value = 0.3 * wave;
    saw.connect(sawGain);
    sq.connect(sqGain);

    // FM: синусоида модулирует частоту обоих осцилляторов
    const fmRatio = g("fmRatio");
    const mod = ctx.createOscillator();
    mod.type = "sine";
    const modJit = 1 + jitter() * load * 0.3;
    mod.frequency.value = freq * fmRatio * modJit;
    const modGain = ctx.createGain();
    modGain.gain.value = g("fmDepth") * freq * 1.6;
    mod.connect(modGain);
    modGain.connect(saw.frequency);
    modGain.connect(sq.frequency);

    // у мутантов второй, слегка расстроенный FM-модулятор
    let mod2 = null;
    let mod2Gain = null;
    if (load > 0.02) {
      mod2 = ctx.createOscillator();
      mod2.type = "sine";
      mod2.frequency.value = freq * fmRatio * (1.03 + load * 0.1);
      mod2Gain = ctx.createGain();
      mod2Gain.gain.value = load * freq * 1.0;
      mod2.connect(mod2Gain);
      mod2Gain.connect(saw.frequency);
      mod2Gain.connect(sq.frequency);
    }

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuf;
    noise.loop = true;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.25 * Math.min(1, g("noise") + load * 0.6);
    noise.connect(noiseGain);

    // фильтр следует за нотой
    const cutoffMul = 1.5 + g("cutoff") * 9;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = Math.min(16000, Math.max(80, freq * cutoffMul));
    filter.Q.value = 0.7 + g("resonance") * 7;
    sawGain.connect(filter);
    sqGain.connect(filter);
    noiseGain.connect(filter);

    // «стрекот» синтеза: громкость рубится LFO. Квадрат пропущен через фильтр: перепады сглажены, иначе каждый даёт щелчок.
    const depth = g("pulseDepth");
    const rate = g("pulseRate") * (1 + jitter() * load * 0.4);
    const chop = ctx.createGain();
    chop.gain.value = 1 - depth / 2;
    const lfo = ctx.createOscillator();
    lfo.type = "square";
    lfo.frequency.value = rate;
    const lfoSmooth = ctx.createBiquadFilter();
    lfoSmooth.type = "lowpass";
    lfoSmooth.frequency.value = Math.min(300, Math.max(40, rate * 4));
    lfoSmooth.Q.value = 0.5;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = depth / 2;
    lfo.connect(lfoSmooth);
    lfoSmooth.connect(lfoGain);
    lfoGain.connect(chop.gain);
    filter.connect(chop);

    // общий «трепет» всего голоса: ручка стрекота (синус, чтобы не щёлкало)
    const trem = ctx.createGain();
    const tremLfo = ctx.createOscillator();
    tremLfo.type = "sine";
    const tremDepth = ctx.createGain();
    tremLfo.connect(tremDepth);
    tremDepth.connect(trem.gain);

    // огибающая
    const vca = ctx.createGain();
    // «неохота»: жук медленно разгоняется и долго затухает. Не короче 8 мс: резкий старт даёт щелчок
    const attack = Math.max(0.008, g("attack") + P.env * P.env * 0.9);
    vca.gain.setValueAtTime(0, t);
    vca.gain.setTargetAtTime(1, t, attack / 3);
    trem.connect(vca);
    vca.connect(this.bus);

    // запись живого насекомого идёт мимо фильтра и стрекота синтеза: в ней уже есть своя фактура
    const layers = fx.has("nosample") ? [] : this.samples.filter((smp) => this.buffers.has(smp.name));
    const synthMix = ctx.createGain();
    synthMix.gain.value = layers.length ? 0.4 : 1;
    chop.connect(synthMix);
    synthMix.connect(trem);
    const srcs = [];
    for (const smp of layers) {
      const buf = this.buffers.get(smp.name);
      const copy = (mult, gain, det = 0) => {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const gn = ctx.createGain();
        gn.gain.value = gain;
        src.connect(gn);
        gn.connect(trem);
        // каждый запуск начинает запись с другого места, повторы не звучат одинаково
        src.start(t, Math.random() * buf.duration);
        stop.push(src);
        srcs.push({ src, gn, mult, det, w: smp.w, name: smp.name });
      };
      copy(1 + jitter() * load * 0.2, SAMPLE_LEVEL * smp.w);
      // «второй жук внутри»: две копии выше и ниже, громкость и отстройка растут с ручкой
      copy(1, 0, 1);
      copy(1, 0, -1);
      // у мутантов к записи добавляется вторая копия, расстроенная и неровная
      if (load > 0.05) copy(1.19 + jitter() * 0.12, SAMPLE_LEVEL * smp.w * load * 0.7);
    }

    for (const n of [saw, sq, mod, lfo, mod2, tremLfo].filter(Boolean)) {
      n.start(t);
      stop.push(n);
    }
    noise.start(t, Math.random() * 1.5);
    stop.push(noise);

    const rateFor = (f, name) => Math.min(3, Math.max(0.25, f / SAMPLE_REF)) / (SAMPLE_PITCH[name] || 1);
    let curFreq = freq;
    let detCents = 0;
    const detMul = (s) => (s.det ? Math.pow(2, (s.det * detCents) / 1200) : 1);
    const SCRUB_WIN = 0.3;
    const voice = {
      vca,
      stop,
      baseRelease: Math.max(0.06, g("release")),
      // высота на лету: осцилляторы, FM, фильтр и скорость записей едут к новой частоте за время sm
      setFreq: (f, sm = 0.03) => {
        curFreq = f;
        const now = ctx.currentTime;
        saw.frequency.setTargetAtTime(f, now, sm);
        sq.frequency.setTargetAtTime(f, now, sm);
        mod.frequency.setTargetAtTime(f * fmRatio * modJit, now, sm);
        modGain.gain.setTargetAtTime(g("fmDepth") * f * 1.6, now, sm);
        if (mod2) {
          mod2.frequency.setTargetAtTime(f * fmRatio * (1.03 + load * 0.1), now, sm);
          mod2Gain.gain.setTargetAtTime(load * f, now, sm);
        }
        filter.frequency.setTargetAtTime(Math.min(16000, Math.max(80, f * cutoffMul)), now, sm);
        for (const s of srcs) s.src.playbackRate.setTargetAtTime(rateFor(f, s.name) * s.mult * detMul(s), now, sm);
      },
      setDetune: (p) => {
        const now = ctx.currentTime;
        detCents = p * 45;
        saw.detune.setTargetAtTime(sawDet + p * 35, now, 0.05);
        sq.detune.setTargetAtTime(sqDet - p * 35, now, 0.05);
        for (const s of srcs) {
          if (!s.det) continue;
          s.gn.gain.setTargetAtTime(SAMPLE_LEVEL * s.w * p * 0.75, now, 0.05);
          s.src.playbackRate.setTargetAtTime(rateFor(curFreq, s.name) * detMul(s), now, 0.05);
        }
      },
      // скраб: запись крутится в коротком окне вокруг «иглы»; 0 = вся запись
      setScrub: (p) => {
        for (const s of srcs) {
          const dur = s.src.buffer.duration;
          if (p < 0.02) {
            s.src.loopStart = 0;
            s.src.loopEnd = 0;
          } else {
            const st = p * (dur - SCRUB_WIN);
            s.src.loopStart = st;
            s.src.loopEnd = st + SCRUB_WIN;
          }
        }
      },
      setTrill: (p) => {
        const now = ctx.currentTime;
        const d = p < 0.02 ? 0 : 0.25 + p * 0.7;
        tremLfo.frequency.setTargetAtTime(3 * Math.pow(12, p), now, 0.05);
        tremDepth.gain.setTargetAtTime(d / 2, now, 0.05);
        trem.gain.setTargetAtTime(1 - d / 2, now, 0.05);
      },
    };
    for (const s of srcs) s.src.playbackRate.value = rateFor(freq, s.name) * s.mult;
    voice.setTrill(P.trill);
    voice.setDetune(P.detune);
    voice.setScrub(P.scrub);
    if (freq !== target) voice.setFreq(target, this.glideTime());
    this.voice = voice;
  }

  stop(when) {
    const v = this.voice;
    if (!v) return;
    this.voice = null;
    const t = when ?? this.ctx.currentTime;
    // gain.value читать нельзя: в Safari оно бывает устаревшим. Отменяем запланированное и
    // продолжаем кривую атаки с того места, где она сейчас.
    v.vca.gain.cancelScheduledValues(t);
    // «неохота» затягивает и затухание
    const release = v.baseRelease + this.params.env * this.params.env * 2.5;
    v.vca.gain.setTargetAtTime(0, t, release / 5);
    // останавливаем источники, когда голос затих почти до нуля (около −65 дБ), чтобы не было щелчка
    const end = t + release * 1.6 + 0.05;
    for (const n of v.stop) n.stop(end);
  }

  get playing() {
    return !!this.voice;
  }
}
