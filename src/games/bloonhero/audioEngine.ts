/** Soft piano-ish Web Audio synth + light drums for Bloon Hero. */

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
      this.master.gain.value = 0.62;
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

  /**
   * Start the song clock. Pass `leadInS` so songTime begins negative and
   * hits 0 after the countdown (drums / notes still use song-relative times).
   */
  beginSong(leadInS = 0): void {
    const c = this.ensure();
    if (!c || !this.master) return;
    this.startedAt = c.currentTime + Math.max(0, leadInS);
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

  /** Soft pad/bass bed — always plays (not player-gated). */
  scheduleAccompaniment(
    notes: readonly { t: number; midi: number; dur: number; vel: number }[],
  ): void {
    const c = this.ensure();
    if (!c || !this.master || this.accScheduled) return;
    this.accScheduled = true;
    for (const n of notes) {
      const when = this.startedAt + n.t;
      if (when + n.dur < c.currentTime) continue;
      this.playSoftNote(n.midi, when, n.dur, n.vel * 0.28, "pad");
    }
  }

  /** Player-gated lead: only call when a note is hit. */
  playHitNote(midi: number, dur: number, vel: number, judge: string): void {
    const c = this.ensure();
    if (!c || !this.master) return;
    const gainMul = judge === "perfect" ? 1 : judge === "great" ? 0.88 : 0.7;
    this.playSoftNote(
      midi,
      c.currentTime,
      Math.max(0.18, dur * 1.15),
      vel * gainMul,
      "lead",
    );
  }

  startDrums(bpm: number): void {
    const c = this.ensure();
    if (!c || !this.master) return;
    if (this.drumTimer != null) window.clearInterval(this.drumTimer);

    const beat = 60 / bpm;
    const stepDur = beat / 2;
    // Start on the current 8th (works for negative count-in songTime)
    let nextStep = Math.floor(this.songTime() / stepDur);

    const kickOff = () => {
      const t = this.songTime();
      const expected = Math.floor(t / stepDur);
      if (expected < nextStep) return;
      while (nextStep <= expected) {
        const mod = ((nextStep % 8) + 8) % 8;
        const isDownbeat = mod % 2 === 0;
        const beatInBar = Math.floor(mod / 2) % 4;
        const stepTime = nextStep * stepDur;
        const countIn = stepTime < 0;
        const accent = countIn ? 1.25 : 1;

        if (isDownbeat) {
          if (beatInBar === 0 || beatInBar === 2) this.kick(accent);
          if (beatInBar === 1 || beatInBar === 3) this.snare(accent);
          if (countIn) this.countClick(beatInBar === 0 ? 1 : 0.75);
        }
        this.hat((isDownbeat ? 0.05 : 0.03) * (countIn ? 1.15 : 1));
        nextStep += 1;
      }
    };
    this.drumTimer = window.setInterval(kickOff, 16);
  }

  /**
   * Calm soft-synth / electric-piano style tone:
   * triangle + quiet sine partials through a gentle lowpass.
   */
  private playSoftNote(
    midi: number,
    when: number,
    dur: number,
    vel: number,
    voice: "lead" | "pad",
  ): void {
    const c = this.ctx;
    const master = this.master;
    if (!c || !master) return;

    const start = Math.max(when, c.currentTime);
    const freq = midiToHz(midi);
    const isLead = voice === "lead";
    const attack = isLead ? 0.012 : 0.04;
    const release = isLead ? 0.35 : 0.55;
    const hold = Math.max(0.08, dur);
    const end = start + hold + release;
    const peak = Math.min(isLead ? 0.34 : 0.16, (isLead ? 0.1 : 0.05) + vel * 0.28);

    const filter = c.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 0.7;
    filter.frequency.setValueAtTime(isLead ? 2200 : 900, start);
    filter.frequency.exponentialRampToValueAtTime(
      isLead ? 1100 : 550,
      start + hold * 0.55,
    );

    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + attack);
    g.gain.exponentialRampToValueAtTime(peak * 0.62, start + hold * 0.45);
    g.gain.setValueAtTime(peak * 0.55, start + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, end);

    filter.connect(g);
    g.connect(master);

    // Soft partials (far mellower than square/saw)
    const partials: { type: OscillatorType; ratio: number; level: number }[] =
      isLead
        ? [
            { type: "triangle", ratio: 1, level: 1 },
            { type: "sine", ratio: 2, level: 0.22 },
            { type: "sine", ratio: 3, level: 0.08 },
          ]
        : [
            { type: "sine", ratio: 1, level: 1 },
            { type: "triangle", ratio: 1, level: 0.35 },
            { type: "sine", ratio: 2, level: 0.12 },
          ];

    for (const p of partials) {
      const osc = c.createOscillator();
      const pg = c.createGain();
      osc.type = p.type;
      osc.frequency.value = freq * p.ratio;
      // Slight detune on pad for width without buzz
      if (!isLead && p.ratio === 1 && p.type === "triangle") {
        osc.detune.value = -6;
      }
      pg.gain.value = p.level;
      osc.connect(pg);
      pg.connect(filter);
      osc.start(start);
      osc.stop(end + 0.02);
    }
  }

  /** Bright count-in click so the pulse is obvious before notes. */
  private countClick(level = 1): void {
    const c = this.ctx;
    const master = this.master;
    if (!c || !master) return;
    const t = c.currentTime;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1280, t);
    osc.frequency.exponentialRampToValueAtTime(720, t + 0.05);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16 * level, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + 0.08);
  }

  private kick(level = 1): void {
    const c = this.ctx;
    const master = this.master;
    if (!c || !master) return;
    const t = c.currentTime;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    g.gain.setValueAtTime(0.38 * level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + 0.22);
  }

  private snare(level = 1): void {
    const c = this.ctx;
    const master = this.master;
    if (!c || !master) return;
    const t = c.currentTime;
    const bufferSize = Math.floor(c.sampleRate * 0.12);
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buffer;
    const g = c.createGain();
    const f = c.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 1800;
    f.Q.value = 0.7;
    g.gain.setValueAtTime(0.14 * level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + 0.12);

    const body = c.createOscillator();
    const bg = c.createGain();
    body.type = "triangle";
    body.frequency.value = 180;
    bg.gain.setValueAtTime(0.08 * level, t);
    bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    body.connect(bg);
    bg.connect(master);
    body.start(t);
    body.stop(t + 0.1);
  }

  private hat(level: number): void {
    const c = this.ctx;
    const master = this.master;
    if (!c || !master) return;
    const t = c.currentTime;
    const bufferSize = Math.floor(c.sampleRate * 0.03);
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buffer;
    const g = c.createGain();
    const f = c.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 6500;
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + 0.04);
  }
}
