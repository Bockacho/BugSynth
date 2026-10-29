import { geneValue } from "./genome.js";

const MAX_VOICES = 8;

function makeNoise(ctx) {
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

// Движок принимает любой AudioContext, в том числе OfflineAudioContext (для проверки без звука).
export class BugEngine {
  constructor(ctx, genome) {
    this.ctx = ctx;
    this.genome = genome;
    this.voices = new Map();
    this.noiseBuf = makeNoise(ctx);

    this.out = ctx.createGain();
    this.out.gain.value = 0.4;
    this.limiter = ctx.createDynamicsCompressor();
    this.out.connect(this.limiter);
    this.limiter.connect(ctx.destination);
  }

  setGenome(genome) {
    this.genome = genome;
  }

  noteOn(id, freq, when) {
    if (this.voices.has(id)) this.noteOff(id);
    if (this.voices.size >= MAX_VOICES) this.noteOff(this.voices.keys().next().value);

    const ctx = this.ctx;
    const g = (k) => geneValue(this.genome, k);
    const t = when ?? ctx.currentTime;
    const stop = [];

    const wave = g("wave");

    // два осциллятора: пила и прямоугольник, смешиваются геном
    const saw = ctx.createOscillator();
    saw.type = "sawtooth";
    saw.frequency.value = freq;
    const sq = ctx.createOscillator();
    sq.type = "square";
    sq.frequency.value = freq;
    const sawGain = ctx.createGain();
    sawGain.gain.value = 0.5 * (1 - wave);
    const sqGain = ctx.createGain();
    sqGain.gain.value = 0.3 * wave;
    saw.connect(sawGain);
    sq.connect(sqGain);

    // FM: синусоида модулирует частоту обоих осцилляторов
    const mod = ctx.createOscillator();
    mod.type = "sine";
    mod.frequency.value = freq * g("fmRatio");
    const modGain = ctx.createGain();
    modGain.gain.value = g("fmDepth") * freq * 2.5;
    mod.connect(modGain);
    modGain.connect(saw.frequency);
    modGain.connect(sq.frequency);

    // шум
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuf;
    noise.loop = true;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.35 * g("noise");
    noise.connect(noiseGain);

    // фильтр следует за нотой
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = Math.min(16000, Math.max(80, freq * (1.5 + g("cutoff") * 12)));
    filter.Q.value = 0.7 + g("resonance") * 12;
    sawGain.connect(filter);
    sqGain.connect(filter);
    noiseGain.connect(filter);

    // «стрекот»: громкость рубится квадратным LFO, как при трении ребристых поверхностей
    const depth = g("pulseDepth");
    const chop = ctx.createGain();
    chop.gain.value = 1 - depth / 2;
    const lfo = ctx.createOscillator();
    lfo.type = "square";
    lfo.frequency.value = g("pulseRate");
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = depth / 2;
    lfo.connect(lfoGain);
    lfoGain.connect(chop.gain);
    filter.connect(chop);

    // огибающая
    const vca = ctx.createGain();
    vca.gain.setValueAtTime(0, t);
    vca.gain.linearRampToValueAtTime(1, t + g("attack"));
    chop.connect(vca);
    vca.connect(this.out);

    for (const n of [saw, sq, mod, lfo]) {
      n.start(t);
      stop.push(n);
    }
    noise.start(t, Math.random() * 1.5);
    stop.push(noise);

    this.voices.set(id, { vca, stop, release: g("release") });
  }

  noteOff(id, when) {
    const v = this.voices.get(id);
    if (!v) return;
    this.voices.delete(id);
    const t = when ?? this.ctx.currentTime;
    if (when === undefined) {
      // отпускание «сейчас»: фиксируем текущую громкость, чтобы не было щелчка
      v.vca.gain.cancelScheduledValues(t);
      v.vca.gain.setValueAtTime(v.vca.gain.value, t);
    }
    v.vca.gain.setTargetAtTime(0, t, v.release / 4);
    const end = t + v.release + 0.1;
    for (const n of v.stop) n.stop(end);
  }

  allOff() {
    for (const id of [...this.voices.keys()]) this.noteOff(id);
  }
}
