import { type Cue, SAMPLES, type SampleName } from "./cues";

const MUTE_KEY = "please-hold:muted";
const LEVELS = { music: 0.32, sfx: 0.9, ambience: 0.22 };

function readMuted() {
  try {
    return window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeMuted(muted: boolean) {
  try {
    window.localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    // Storage can be unavailable (private mode); muting still works for this visit.
  }
}

/**
 * Web Audio mixer: hold music, a station hum, a revolving-bar loop and one-shot SFX.
 * The context is created on the first user gesture; samples load right after it.
 */
export class AudioEngine {
  muted = readMuted();
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private sfx: GainNode | null = null;
  private ambience: GainNode | null = null;
  private revolveGain: GainNode | null = null;
  private buffers = new Map<SampleName, AudioBuffer>();
  private loaded = false;
  private hidden = false;
  private listeners = new Set<() => void>();

  /** Call from a user gesture (pointer or key). Safe to call repeatedly. */
  unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.ctx.destination);
      this.music = this.bus(LEVELS.music);
      this.sfx = this.bus(LEVELS.sfx);
      this.ambience = this.bus(LEVELS.ambience);
      void this.load();
    }
    if (this.ctx.state === "suspended" && !this.hidden) void this.ctx.resume();
  }

  private bus(level: number) {
    const ctx = this.ctx as AudioContext;
    const g = ctx.createGain();
    g.gain.value = level;
    g.connect(this.master as GainNode);
    return g;
  }

  private async load() {
    const ctx = this.ctx;
    if (!ctx) return;
    const base = `${import.meta.env.BASE_URL}audio/`;
    await Promise.all(
      (Object.keys(SAMPLES) as SampleName[]).map(async (name) => {
        try {
          const res = await fetch(base + SAMPLES[name]);
          const buf = await ctx.decodeAudioData(await res.arrayBuffer());
          this.buffers.set(name, buf);
        } catch {
          // A missing sample must never break the game; it simply stays silent.
        }
      }),
    );
    this.loaded = true;
    this.startLoops();
  }

  private loop(name: SampleName, dest: AudioNode) {
    const ctx = this.ctx;
    const buf = this.buffers.get(name);
    if (!ctx || !buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(dest);
    src.start();
  }

  private startLoops() {
    const ctx = this.ctx;
    if (!ctx || !this.music || !this.ambience) return;
    // Hold music, fading in gently.
    this.music.gain.setValueAtTime(0, ctx.currentTime);
    this.music.gain.linearRampToValueAtTime(LEVELS.music, ctx.currentTime + 4);
    this.loop("music", this.music);
    // Station hum, softened so it reads as air handling rather than engines.
    const warm = ctx.createBiquadFilter();
    warm.type = "lowpass";
    warm.frequency.value = 600;
    warm.connect(this.ambience);
    this.loop("hum", warm);
    this.revolveGain = ctx.createGain();
    this.revolveGain.gain.value = 0;
    const soft = ctx.createBiquadFilter();
    soft.type = "lowpass";
    soft.frequency.value = 900;
    this.revolveGain.connect(soft).connect(this.ambience);
    this.loop("revolve", this.revolveGain);
  }

  play(cue: Cue) {
    const ctx = this.ctx;
    const buf = this.buffers.get(cue.sound);
    if (!ctx || !buf || !this.sfx || this.muted || this.hidden) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = cue.rate;
    const g = ctx.createGain();
    g.gain.value = cue.gain;
    const pan = ctx.createStereoPanner();
    pan.pan.value = cue.pan;
    src.connect(g).connect(pan).connect(this.sfx);
    src.start();
    if (cue.duck) this.duck(buf.duration / cue.rate);
  }

  /** Dip the music under a jingle, then bring it back. */
  duck(seconds: number, depth = 0.25) {
    const ctx = this.ctx;
    if (!ctx || !this.music) return;
    const g = this.music.gain;
    const t = ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(LEVELS.music * depth, t, 0.08);
    g.setTargetAtTime(LEVELS.music, t + seconds, 0.6);
  }

  /** The revolving compartment hums only in the room that has one. */
  setRevolving(on: boolean) {
    const ctx = this.ctx;
    if (!ctx || !this.revolveGain) return;
    this.revolveGain.gain.setTargetAtTime(on ? 0.9 : 0, ctx.currentTime, 0.5);
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    writeMuted(muted);
    const ctx = this.ctx;
    if (ctx && this.master) this.master.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.05);
    for (const l of this.listeners) l();
  }

  toggleMute() {
    this.setMuted(!this.muted);
  }

  /** Pause everything while the tab is hidden; resume when it comes back. */
  setHidden(hidden: boolean) {
    this.hidden = hidden;
    const ctx = this.ctx;
    if (!ctx) return;
    if (hidden) void ctx.suspend();
    else void ctx.resume();
  }

  get ready() {
    return this.loaded;
  }

  onChange(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
