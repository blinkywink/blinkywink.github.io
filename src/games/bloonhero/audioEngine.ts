/** Lightweight Web Audio synth + drums for Bloon Hero. */

function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export class HeroAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private startedAt = 0;
  private drumTimer: number | null = null;
  private accScheduled = false;

  ensure(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  /** Absolute audio time when song t=0 began. */
  get songOrigin(): number {
    return this.startedAt;
  }

  songTime(): number {
    const c = this.ctx;
    if (!c || !this.startedAt) return 0;
    return c.currentTime - this.startedAt;
  }

  beginSong(songOriginAudioTime?: number): void {
    const c = this.ensure();
    if (!c || !this.master) return;
    this.startedAt = songOriginAudioTime ?? c.currentTime + 0.06;
    this.accScheduled = false;
  }

  stopAll(): void {
    if (this.drumTimer != null) {
      window.clearInterval(this.drumTimer);
      this.drumTimer = null;
    }
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
      this.master = null;
    }
    this.startedAt = 0;
    this.accScheduled = false;
  }

  /** Soft sawtooth bed — always plays (not player-gated). */
  scheduleAccompaniment(
    notes: readonly { t: number; midi: number; dur: number; vel: number }[],
  ): void {
    const c = this.ensure();
    if (!c || !this.master || this.accScheduled) return;
    this.accScheduled = true;
    for (const n of notes) {
      const when = this.startedAt + n.t;
      if (when + n.dur < c.currentTime) continue;
      this.playTone(n.midi, when, n.dur, n.vel * 0.35, "sawtooth");
    }
  }

  /** Player-gated lead: only call when a note is hit. */
  playHitNote(midi: number, dur: number, vel: number, judge: string): void {
    const c = this.ensure();
    if (!c || !this.master) return;
    const gainMul = judge === "perfect" ? 1 : judge === "great" ? 0.85 : 0.65;
    this.playTone(midi, c.currentTime, Math.max(0.09, dur), vel * gainMul, "square");
  }

  startDrums(bpm: number): void {
    const c = this.ensure();
    if (!c || !this.master) return;
    if (this.drumTimer != null) window.clearInterval(this.drumTimer);

    const beat = 60 / bpm;
    let step = 0;
    // Align first tick shortly after song start
    const kickOff = () => {
      const t = this.songTime();
      if (t < -0.05) return;
      // 8th-note grid
      const stepDur = beat / 2;
      const expected = Math.floor(Math.max(0, t) / stepDur);
      if (expected < step) return;
      while (step <= expected) {
        const isDownbeat = step % 2 === 0;
        const beatInBar = Math.floor(step / 2) % 4;
        if (isDownbeat) {
          if (beatInBar === 0 || beatInBar === 2) this.kick();
          if (beatInBar === 1 || beatInBar === 3) this.snare();
        }
        this.hat(isDownbeat ? 0.12 : 0.07);
        step += 1;
      }
    };
    this.drumTimer = window.setInterval(kickOff, 20);
  }

  private playTone(
    midi: number,
    when: number,
    dur: number,
    vel: number,
    type: OscillatorType,
  ): void {
    const c = this.ctx;
    const master = this.master;
    if (!c || !master) return;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.value = midiToHz(midi);
    const peak = Math.min(0.45, 0.12 + vel * 0.35);
    const start = Math.max(when, c.currentTime);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, start + Math.max(0.05, dur));
    osc.connect(g);
    g.connect(master);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }

  private kick(): void {
    const c = this.ctx;
    const master = this.master;
    if (!c || !master) return;
    const t = c.currentTime;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(48, t + 0.12);
    g.gain.setValueAtTime(0.55, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  private snare(): void {
    const c = this.ctx;
    const master = this.master;
    if (!c || !master) return;
    const t = c.currentTime;
    const bufferSize = Math.floor(c.sampleRate * 0.15);
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buffer;
    const g = c.createGain();
    const f = c.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 1200;
    g.gain.setValueAtTime(0.28, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + 0.15);
  }

  private hat(level: number): void {
    const c = this.ctx;
    const master = this.master;
    if (!c || !master) return;
    const t = c.currentTime;
    const bufferSize = Math.floor(c.sampleRate * 0.04);
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buffer;
    const g = c.createGain();
    const f = c.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 7000;
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + 0.05);
  }
}
