export class Soundscape {
  muted = false;
  private ctx: AudioContext | null = null;

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  resume(): void {
    if (this.muted) return;
    const ctx = this.ensure();
    if (ctx.state === "suspended") {
      void ctx.resume();
    }
  }

  complete(): void {
    if (this.muted) return;
    const ctx = this.ensure();
    const now = ctx.currentTime;
    this.noiseBurst(ctx, now, 0.22, 0.55);
    this.tone(ctx, now, 180, 0.18, "sawtooth", 0.08);
    this.tone(ctx, now + 0.04, 90, 0.32, "sine", 0.12);
    this.tone(ctx, now + 0.12, 520, 0.12, "triangle", 0.05);
  }

  capture(): void {
    if (this.muted) return;
    const ctx = this.ensure();
    const now = ctx.currentTime;
    this.tone(ctx, now, 620, 0.08, "sine", 0.05);
    this.tone(ctx, now + 0.06, 930, 0.1, "sine", 0.04);
  }

  select(): void {
    if (this.muted) return;
    this.tone(this.ensure(), this.ensure().currentTime, 440, 0.05, "sine", 0.03);
  }

  whoosh(): void {
    if (this.muted) return;
    this.noiseBurst(this.ensure(), this.ensure().currentTime, 0.12, 0.3);
  }

  private ensure(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    return this.ctx;
  }

  private tone(
    ctx: AudioContext,
    when: number,
    freq: number,
    duration: number,
    type: OscillatorType,
    gain: number,
  ): void {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.45), when + duration);
    amp.gain.setValueAtTime(gain, when);
    amp.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start(when);
    osc.stop(when + duration + 0.02);
  }

  private noiseBurst(ctx: AudioContext, when: number, duration: number, gain: number): void {
    const length = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(900, when);
    filter.frequency.exponentialRampToValueAtTime(220, when + duration);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, when);
    amp.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    src.connect(filter);
    filter.connect(amp);
    amp.connect(ctx.destination);
    src.start(when);
    src.stop(when + duration + 0.02);
  }
}
