/** Soft piano-ish Web Audio synth + light drums for Bloon Hero. */

function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export class HeroAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private startedAt = 0;
  private drumTimer: number | null = null;

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
  }

  /** Quiet bass pedals only — melody is player-gated on the lead. */
  scheduleAccompaniment(
    notes: readonly { t: number; midi: number; dur: number; vel: number }[],
    timeOffset = 0,
  ): void {
    const c = this.ensure();
    if (!c || !this.master) return;
    for (const n of notes) {
      const when = this.startedAt + timeOffset + n.t;
      if (when + n.dur < c.currentTime) continue;
      this.playSoftNote(n.midi, when, Math.max(0.4, n.dur), n.vel * 0.45, "pad");
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
      Math.max(0.32, dur * 1.65),
      vel * gainMul,
      "lead",
    );
  }

  /** Soft tick when pressing a lane with no note in window. */
  playEmptyTap(): void {
    const c = this.ensure();
    const master = this.master;
    if (!c || !master) return;
    const t = c.currentTime;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = "triangle";
    osc.frequency.value = 180;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + 0.07);
  }

  /** Quiet quarter-note clicks during the count-in only (no kit during the song). */
  startCountIn(bpm: number): void {
    const c = this.ensure();
    if (!c || !this.master) return;
    if (this.drumTimer != null) window.clearInterval(this.drumTimer);

    const beat = 60 / bpm;
    let nextBeat = Math.floor(this.songTime() / beat);

    const tick = () => {
      const t = this.songTime();
      if (t >= 0.02) {
        if (this.drumTimer != null) {
          window.clearInterval(this.drumTimer);
          this.drumTimer = null;
        }
        return;
      }
      const expected = Math.floor(t / beat);
      if (expected < nextBeat) return;
      while (nextBeat <= expected && nextBeat * beat < 0) {
        const beatInBar = ((nextBeat % 4) + 4) % 4;
        this.countClick(beatInBar === 0 ? 1 : 0.7);
        nextBeat += 1;
      }
    };
    this.drumTimer = window.setInterval(tick, 16);
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
    const attack = isLead ? 0.014 : 0.04;
    const release = isLead ? 0.55 : 0.6;
    const hold = Math.max(isLead ? 0.28 : 0.08, dur);
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
}
