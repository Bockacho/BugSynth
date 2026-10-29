import { geneValue, mutationLoad } from "./genome.js";

const MAX_VOICES = 8;

function makeNoise(ctx) {
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

// Движок принимает любой AudioContext, в том числе OfflineAudioContext (для проверки без звука).
// fx: набор строк для диагностики звука (отключают части цепи или гены), например ?fx=nocomp,nolfo
export class BugEngine {
  constructor(ctx, genome, fx = new Set()) {
    this.ctx = ctx;
    this.fx = fx;
    this.genome = genome;
    this.voices = new Map();
    this.noiseBuf = makeNoise(ctx);

    this.out = ctx.createGain();
    this.out.gain.value = 0.5;
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
    // WaveShaper видит вход только в диапазоне −1..1, поэтому сигнал ослаблен втрое, а кривая tanh(3x) усиливает его обратно:
    // для малых уровней проход без изменений, для больших плавное насыщение.
    this.pre = ctx.createGain();
    this.pre.gain.value = 1 / 3;
    this.clip = ctx.createWaveShaper();
    const curve = new Float32Array(2048);
    for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh((i / (curve.length - 1)) * 6 - 3);
    this.clip.curve = curve;
    this.clip.oversample = "2x";
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
  }

  setGenome(genome) {
    this.genome = genome;
  }

  noteOn(id, freq, when) {
    if (this.voices.has(id)) this.noteOff(id);
    if (this.voices.size >= MAX_VOICES) this.noteOff(this.voices.keys().next().value);

    const ctx = this.ctx;
    const fx = this.fx;
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

    // груз мутаций (0..1): тело гибрида делает звук грязнее. У обычных жуков около нуля, звук не меняется.
    const load = fx.has("nomut") ? 0 : mutationLoad(this.genome);
    const jitter = () => Math.random() - 0.5;

    const wave = g("wave");

    // два осциллятора: пила и прямоугольник, смешиваются геном
    const saw = ctx.createOscillator();
    saw.type = "sawtooth";
    saw.frequency.value = freq;
    // осцилляторы разъезжаются по высоте, у каждой ноты по-разному
    saw.detune.value = jitter() * load * 40;
    const sq = ctx.createOscillator();
    sq.type = "square";
    sq.frequency.value = freq;
    sq.detune.value = jitter() * load * 40;
    const sawGain = ctx.createGain();
    sawGain.gain.value = 0.5 * (1 - wave);
    const sqGain = ctx.createGain();
    sqGain.gain.value = 0.3 * wave;
    saw.connect(sawGain);
    sq.connect(sqGain);

    // FM: синусоида модулирует частоту обоих осцилляторов
    const mod = ctx.createOscillator();
    mod.type = "sine";
    // отношение FM каждый раз чуть плывёт: «неровный» FM
    mod.frequency.value = freq * g("fmRatio") * (1 + jitter() * load * 0.3);
    const modGain = ctx.createGain();
    modGain.gain.value = g("fmDepth") * freq * 1.6;
    mod.connect(modGain);
    modGain.connect(saw.frequency);
    modGain.connect(sq.frequency);

    // у мутантов второй, слегка расстроенный FM-модулятор
    let mod2 = null;
    if (load > 0.02) {
      mod2 = ctx.createOscillator();
      mod2.type = "sine";
      mod2.frequency.value = freq * g("fmRatio") * (1.03 + load * 0.1);
      const mod2Gain = ctx.createGain();
      mod2Gain.gain.value = load * freq * 1.0;
      mod2.connect(mod2Gain);
      mod2Gain.connect(saw.frequency);
      mod2Gain.connect(sq.frequency);
    }

    // шум
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuf;
    noise.loop = true;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.25 * Math.min(1, g("noise") + load * 0.6);
    noise.connect(noiseGain);

    // фильтр следует за нотой
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = Math.min(16000, Math.max(80, freq * (1.5 + g("cutoff") * 9)));
    filter.Q.value = 0.7 + g("resonance") * 7;
    sawGain.connect(filter);
    sqGain.connect(filter);
    noiseGain.connect(filter);

    // «стрекот»: громкость рубится LFO, как при трении ребристых поверхностей.
    // Квадрат пропущен через фильтр: перепады сглажены на несколько миллисекунд, иначе каждый даёт щелчок.
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

    // огибающая
    const vca = ctx.createGain();
    // атака не короче 8 мс: более резкий старт даёт щелчок
    const attack = Math.max(0.008, g("attack"));
    vca.gain.setValueAtTime(0, t);
    vca.gain.setTargetAtTime(1, t, attack / 3);
    chop.connect(vca);
    vca.connect(this.out);

    for (const n of [saw, sq, mod, lfo, mod2].filter(Boolean)) {
      n.start(t);
      stop.push(n);
    }
    noise.start(t, Math.random() * 1.5);
    stop.push(noise);

    this.voices.set(id, { vca, stop, release: Math.max(0.06, g("release")) });
  }

  noteOff(id, when) {
    const v = this.voices.get(id);
    if (!v) return;
    this.voices.delete(id);
    const t = when ?? this.ctx.currentTime;
    // gain.value читать нельзя: в Safari оно бывает устаревшим. Отменяем запланированное и
    // продолжаем кривую атаки с того места, где она сейчас: по спецификации setTargetAtTime
    // стартует от значения предыдущего события в момент t.
    v.vca.gain.cancelScheduledValues(t);
    v.vca.gain.setTargetAtTime(0, t, v.release / 5);
    // останавливаем осцилляторы, когда голос затих почти до нуля (около −65 дБ), чтобы не было щелчка
    const end = t + v.release * 1.6 + 0.05;
    for (const n of v.stop) n.stop(end);
  }

  allOff() {
    for (const id of [...this.voices.keys()]) this.noteOff(id);
  }
}
