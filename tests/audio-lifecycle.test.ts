import { afterEach, describe, expect, test } from "bun:test";
import { AudioEngine } from "../src/audio/engine";

class Parameter {
  value = 0;
  targets: number[] = [];
  setValueAtTime(value: number) {
    this.targets.push(value);
  }
  linearRampToValueAtTime(value: number) {
    this.targets.push(value);
  }
  setTargetAtTime(value: number) {
    this.targets.push(value);
  }
  cancelScheduledValues() {
    this.targets.length = 0;
  }
}
class Node {
  disconnected = 0;
  gain = new Parameter();
  frequency = new Parameter();
  pan = new Parameter();
  playbackRate = new Parameter();
  type = "";
  connect(destination: Node) {
    return destination;
  }
  disconnect() {
    this.disconnected++;
  }
}
class Source extends Node {
  buffer: unknown = null;
  loop = false;
  starts: (number | undefined)[] = [];
  stops: (number | undefined)[] = [];
  onended: (() => void) | null = null;
  start(at?: number) {
    this.starts.push(at);
  }
  stop(at?: number) {
    this.stops.push(at);
  }
  end() {
    this.onended?.();
  }
}
class Context {
  static created: Context[] = [];
  static decode: () => Promise<{ duration: number }> = () => Promise.resolve({ duration: 1 });
  state = "running";
  currentTime = 10;
  destination = new Node();
  nodes: Node[] = [];
  sources: Source[] = [];
  closed = 0;
  constructor() {
    Context.created.push(this);
  }
  createGain() {
    const node = new Node();
    this.nodes.push(node);
    return node;
  }
  createBiquadFilter() {
    return this.createGain();
  }
  createStereoPanner() {
    return this.createGain();
  }
  createBufferSource() {
    const source = new Source();
    this.sources.push(source);
    return source;
  }
  createOscillator() {
    return this.createBufferSource();
  }
  decodeAudioData() {
    return Context.decode();
  }
  async resume() {
    this.state = "running";
  }
  async suspend() {
    this.state = "suspended";
  }
  async close() {
    this.closed++;
    this.state = "closed";
  }
}

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalFetch = globalThis.fetch;
const engines: AudioEngine[] = [];
const timers = new Map<number, () => void>();
let timerId = 0;
function engine() {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      AudioContext: Context,
      localStorage: { getItem: () => null, setItem: () => {} },
      setTimeout: (callback: () => void) => {
        const id = ++timerId;
        timers.set(id, callback);
        return id;
      },
      clearTimeout: (id: number) => timers.delete(id),
    },
  });
  globalThis.fetch = (() =>
    Promise.resolve(new Response(new Uint8Array([1])))) as unknown as typeof fetch;
  const engine = new AudioEngine();
  engines.push(engine);
  return engine;
}
async function loaded(audio: AudioEngine) {
  for (let i = 0; i < 20 && !audio.ready; i++)
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  expect(audio.ready).toBe(true);
  const context = Context.created.at(-1);
  if (!context) throw new Error("audio context");
  return context;
}
afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
  globalThis.fetch = originalFetch;
  Context.created.length = 0;
  Context.decode = () => Promise.resolve({ duration: 1 });
  timers.clear();
});

describe("audio lifetime and replay", () => {
  test("reset stops scheduled and active finale voices, cancels the jingle, restores hold music", async () => {
    const audio = engine();
    audio.unlock();
    const context = await loaded(audio);
    expect(context.sources).toHaveLength(3);
    audio.finale();
    expect(context.sources).toHaveLength(11);
    expect(timers.size).toBe(1);
    const rings = context.sources.slice(3);
    audio.reset();
    expect(timers.size).toBe(0);
    for (const ring of rings) {
      expect(ring.stops.at(-1)).toBeUndefined();
      expect(ring.disconnected).toBe(1);
    }
    expect(context.nodes[1]?.gain.targets.at(-1)).toBe(0.32);
    audio.finale();
    const timer = [...timers.values()][0];
    if (!timer) throw new Error("finale timer");
    timer();
    const jingle = context.sources.at(-1);
    audio.cancelPending();
    expect(jingle?.disconnected).toBe(1);
  });

  test("disposing during decode never attaches late buffers/loops and closes only once", async () => {
    let finish: (buffer: { duration: number }) => void = () => {};
    const decode = new Promise<{ duration: number }>((resolve) => {
      finish = resolve;
    });
    Context.decode = () => decode;
    const audio = engine();
    audio.unlock();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const context = Context.created[0];
    if (!context) throw new Error("audio context");
    audio.dispose();
    audio.dispose();
    finish({ duration: 1 });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(context.closed).toBe(1);
    expect(context.sources).toHaveLength(0);
    expect(audio.ready).toBe(false);
    audio.unlock();
    expect(Context.created).toHaveLength(1);
    for (const node of context.nodes) expect(node.disconnected).toBe(1);
  });

  test("loop state requested during loading survives, and repeated frame updates do not add automation", async () => {
    const audio = engine();
    audio.setRevolving(true);
    audio.finale();
    audio.unlock();
    const context = await loaded(audio);
    expect(context.nodes[1]?.gain.targets.at(-1)).toBe(0);
    const revolve = context.nodes[5];
    expect(revolve?.gain.value).toBe(0.9);
    for (let i = 0; i < 120; i++) audio.setRevolving(true);
    expect(revolve?.gain.targets).toEqual([]);
    audio.setRevolving(false);
    expect(revolve?.gain.targets).toEqual([0]);
    audio.reset();
    expect(context.nodes[1]?.gain.targets.at(-1)).toBe(0.32);
  });

  test("ended one-shots release their source and intermediate graph; teardown stops remaining loops", async () => {
    const audio = engine();
    audio.unlock();
    const context = await loaded(audio);
    audio.play({ sound: "throw-0", gain: 0.8, rate: 1, pan: 0 });
    const source = context.sources.at(-1);
    if (!source) throw new Error("one shot");
    source.end();
    expect(source.disconnected).toBe(1);
    expect(context.nodes.at(-1)?.disconnected).toBe(1);
    expect(context.nodes.at(-2)?.disconnected).toBe(1);
    audio.dispose();
    for (const loop of context.sources.slice(0, 3)) {
      expect(loop.stops).toHaveLength(1);
      expect(loop.disconnected).toBe(1);
    }
    expect(source.disconnected).toBe(1);
  });
});
