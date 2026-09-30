import { type Cue, SAMPLES, type SampleName } from "./cues";

const MUTE_KEY = "please-hold:muted";
const LEVELS = { music: 0.32, sfx: 0.9, ambience: 0.22 };

interface Voice {
  sources: AudioScheduledSourceNode[];
  nodes: AudioNode[];
  kind: "loop" | "sfx" | "finale";
}

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
  private disposed = false;
  private lifetime = new AbortController();
  private nodes = new Set<AudioNode>();
  private voices = new Set<Voice>();
  private finaleTimer: number | null = null;
  private musicPlaying = true;
  private revolving = false;

  private own<T extends AudioNode>(node: T): T {
    this.nodes.add(node);
    return node;
  }

  private voice(sources: AudioScheduledSourceNode[], nodes: AudioNode[], kind: Voice["kind"]) {
    const voice = { sources, nodes, kind };
    this.voices.add(voice);
    let ended = 0;
    for (const source of sources)
      source.onended = () => {
        ended++;
        if (ended === sources.length) this.releaseVoice(voice, false);
      };
    return voice;
  }

  private releaseVoice(voice: Voice, stop = true) {
    if (!this.voices.delete(voice)) return;
    for (const source of voice.sources) {
      source.onended = null;
      if (stop) {
        try {
          source.stop();
        } catch {
          /* Already stopped. */
        }
      }
      source.disconnect();
    }
    for (const node of voice.nodes) node.disconnect();
  }

  /** Call from a user gesture (pointer or key). Safe to call repeatedly. */
  unlock() {
    if (this.disposed) return;
    if (!this.ctx) {
      const Ctor = window.AudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.own(this.ctx.createGain());
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.ctx.destination);
      this.music = this.bus(LEVELS.music);
      this.sfx = this.bus(LEVELS.sfx);
      this.ambience = this.bus(LEVELS.ambience);
      void this.load().catch(() => {});
    }
    if (this.ctx.state === "suspended" && !this.hidden) void this.ctx.resume().catch(() => {});
  }

  private bus(level: number) {
    const ctx = this.ctx as AudioContext;
    const g = this.own(ctx.createGain());
    g.gain.value = level;
    g.connect(this.master as GainNode);
    return g;
  }

  private async load() {
    const ctx = this.ctx;
    if (!ctx || this.disposed) return;
    const base = `${import.meta.env.BASE_URL}audio/`;
    await Promise.all(
      (Object.keys(SAMPLES) as SampleName[]).map(async (name) => {
        try {
          const res = await fetch(base + SAMPLES[name], { signal: this.lifetime.signal });
          if (!res.ok) return;
          const buf = await ctx.decodeAudioData(await res.arrayBuffer());
          if (this.disposed) return;
          this.buffers.set(name, buf);
        } catch {
          // A missing sample must never break the game; it simply stays silent.
        }
      }),
    );
    if (this.disposed) return;
    this.loaded = true;
    this.startLoops();
  }

  private loop(name: SampleName, dest: AudioNode) {
    const ctx = this.ctx;
    const buf = this.buffers.get(name);
    if (!ctx || !buf || this.disposed) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(dest);
    this.voice([src], [], "loop");
    src.start();
  }

  private startLoops() {
    const ctx = this.ctx;
    if (!ctx || !this.music || !this.ambience || this.disposed) return;
    // Hold music, fading in gently.
    this.music.gain.setValueAtTime(0, ctx.currentTime);
    this.music.gain.linearRampToValueAtTime(
      this.musicPlaying ? LEVELS.music : 0,
      ctx.currentTime + 4,
    );
    this.loop("music", this.music);
    // Station hum, softened so it reads as air handling rather than engines.
    const warm = this.own(ctx.createBiquadFilter());
    warm.type = "lowpass";
    warm.frequency.value = 600;
    warm.connect(this.ambience);
    this.loop("hum", warm);
    this.revolveGain = this.own(ctx.createGain());
    this.revolveGain.gain.value = this.revolving ? 0.9 : 0;
    const soft = this.own(ctx.createBiquadFilter());
    soft.type = "lowpass";
    soft.frequency.value = 900;
    this.revolveGain.connect(soft).connect(this.ambience);
    this.loop("revolve", this.revolveGain);
  }

  play(cue: Cue) {
    this.playCue(cue, "sfx");
  }

  private playCue(cue: Cue, kind: Voice["kind"]) {
    const ctx = this.ctx;
    const buf = this.buffers.get(cue.sound);
    if (!ctx || !buf || !this.sfx || this.muted || this.hidden || this.disposed) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = cue.rate;
    const g = ctx.createGain();
    g.gain.value = cue.gain;
    const pan = ctx.createStereoPanner();
    pan.pan.value = cue.pan;
    src.connect(g).connect(pan).connect(this.sfx);
    this.voice([src], [g, pan], kind);
    src.start();
    if (cue.duck) this.duck(buf.duration / cue.rate);
  }

  /** Dip the music under a jingle, then bring it back. */
  duck(seconds: number, depth = 0.25) {
    const ctx = this.ctx;
    if (!ctx || !this.music || !this.musicPlaying || this.disposed) return;
    const g = this.music.gain;
    const t = ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(LEVELS.music * depth, t, 0.08);
    g.setTargetAtTime(LEVELS.music, t + seconds, 0.6);
  }

  /**
   * Finale: the hold music fades out, the line rings twice (synthesised two-tone ring),
   * then the call connects with the closing jingle.
   */
  finale() {
    if (this.disposed) return;
    this.cancelPending();
    this.musicPlaying = false;
    const ctx = this.ctx;
    if (!ctx || !this.music || !this.sfx) return;
    const t = ctx.currentTime;
    this.music.gain.cancelScheduledValues(t);
    this.music.gain.setTargetAtTime(0, t, 0.4);
    for (const start of [0.6, 1.8]) {
      for (const offset of [0, 0.45]) this.ring(t + start + offset, 0.35);
    }
    this.finaleTimer = window.setTimeout(() => {
      this.finaleTimer = null;
      this.playCue({ sound: "done", gain: 0.8, rate: 1, pan: 0 }, "finale");
    }, 3000);
  }

  private ring(at: number, length: number) {
    const ctx = this.ctx;
    if (!ctx || !this.sfx || this.disposed || this.muted || this.hidden) return;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.12, at + 0.02);
    g.gain.setValueAtTime(0.12, at + length - 0.03);
    g.gain.linearRampToValueAtTime(0, at + length);
    g.connect(this.sfx);
    const sources: OscillatorNode[] = [];
    for (const f of [400, 450]) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      o.connect(g);
      sources.push(o);
      o.start(at);
      o.stop(at + length);
    }
    this.voice(sources, [g], "finale");
  }

  /** Bring the hold music back (a new shift). */
  resumeMusic() {
    if (this.disposed) return;
    this.cancelPending();
    this.musicPlaying = true;
    const ctx = this.ctx;
    if (!ctx || !this.music) return;
    this.music.gain.cancelScheduledValues(ctx.currentTime);
    this.music.gain.setTargetAtTime(LEVELS.music, ctx.currentTime, 1);
  }

  /** The revolving compartment hums only in the room that has one. */
  setRevolving(on: boolean) {
    if (this.disposed || this.revolving === on) return;
    this.revolving = on;
    const ctx = this.ctx;
    if (!ctx || !this.revolveGain) return;
    this.revolveGain.gain.setTargetAtTime(on ? 0.9 : 0, ctx.currentTime, 0.5);
  }

  setMuted(muted: boolean) {
    if (this.disposed) return;
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
    if (this.disposed || this.hidden === hidden) return;
    this.hidden = hidden;
    const ctx = this.ctx;
    if (!ctx) return;
    if (hidden) void ctx.suspend().catch(() => {});
    else void ctx.resume().catch(() => {});
  }

  get ready() {
    return this.loaded;
  }

  onChange(listener: () => void) {
    if (this.disposed) return () => {};
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** A replay or room replacement must not inherit scheduled rings or the closing jingle. */
  cancelPending() {
    if (this.finaleTimer !== null) window.clearTimeout(this.finaleTimer);
    this.finaleTimer = null;
    for (const voice of this.voices) if (voice.kind === "finale") this.releaseVoice(voice);
  }

  reset() {
    if (this.disposed) return;
    this.resumeMusic();
    this.setRevolving(false);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.lifetime.abort();
    this.cancelPending();
    for (const voice of this.voices) this.releaseVoice(voice);
    for (const node of this.nodes) node.disconnect();
    this.nodes.clear();
    this.buffers.clear();
    this.listeners.clear();
    this.loaded = false;
    if (this.ctx && this.ctx.state !== "closed") void this.ctx.close().catch(() => {});
    this.ctx = this.master = this.music = this.sfx = this.ambience = this.revolveGain = null;
  }
}
