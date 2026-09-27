import { ITEM_SPECS } from "../game/constants";
import type { GameEvent, GameState } from "../game/types";

/** Every sample the game ships, by short name. Files live in public/audio/. */
export const SAMPLES = {
  "throw-0": "throw-0.ogg",
  "throw-1": "throw-1.ogg",
  "throw-2": "throw-2.ogg",
  "push-0": "push-0.ogg",
  "push-1": "push-1.ogg",
  "bump-0": "bump-0.ogg",
  "bump-1": "bump-1.ogg",
  "rail-0": "rail-0.ogg",
  "rail-1": "rail-1.ogg",
  catch: "catch.ogg",
  "tap-0": "tap-0.ogg",
  "tap-1": "tap-1.ogg",
  "tap-2": "tap-2.ogg",
  bonk: "bonk.ogg",
  place: "place.ogg",
  task: "task.ogg",
  done: "done.ogg",
  hatch: "hatch.ogg",
  room: "room.ogg",
  restart: "restart.ogg",
  toggle: "toggle.ogg",
  hum: "hum.ogg",
  revolve: "revolve.ogg",
  music: "hold-music.mp3",
} as const;

export type SampleName = keyof typeof SAMPLES;

export interface Cue {
  sound: SampleName;
  gain: number;
  rate: number;
  /** Stereo position, -1 (left) to 1 (right). */
  pan: number;
  /** Duck the music under this cue (jingles). */
  duck?: boolean;
}

const pick = <T>(list: readonly T[], seed: number): T => list[Math.abs(seed) % list.length] as T;

/** Map a game event to a sound. Pure: `seed` picks between variants so repeats don't grate. */
export function cueFor(event: GameEvent, state: GameState, seed: number): Cue | null {
  const half = state.room.width / 2;
  const panAt = (x: number) => Math.max(-1, Math.min(1, (x / half) * 0.6));
  const vary = 1 + (((seed * 7919) % 100) / 100 - 0.5) * 0.12;
  switch (event.type) {
    case "throw": {
      const kind = state.items.find((i) => i.id === event.item)?.kind;
      // Heavier things leave the hand with a lower thump.
      const mass = kind ? ITEM_SPECS[kind].mass : 0.5;
      const rate = (1.25 - mass * 0.35) * vary;
      return {
        sound: pick(["throw-0", "throw-1", "throw-2"], seed),
        gain: 0.9,
        rate,
        pan: panAt(event.pos.x),
      };
    }
    case "push":
      return {
        sound: pick(["push-0", "push-1"], seed),
        gain: 0.8,
        rate: 0.9 * vary,
        pan: panAt(event.pos.x),
      };
    case "grab":
      return event.target === "rail"
        ? {
            sound: pick(["rail-0", "rail-1"], seed),
            gain: 0.55,
            rate: 1.1 * vary,
            pan: panAt(event.pos.x),
          }
        : { sound: "catch", gain: 0.8, rate: 1.1 * vary, pan: panAt(event.pos.x) };
    case "bump": {
      const gain = Math.min(1, 0.2 + event.strength * 0.15);
      return event.who === "player"
        ? {
            sound: pick(["bump-0", "bump-1"], seed),
            gain,
            rate: 0.85 * vary,
            pan: panAt(event.pos.x),
          }
        : {
            sound: pick(["tap-0", "tap-1", "tap-2"], seed),
            gain: gain * 0.7,
            rate: vary,
            pan: panAt(event.pos.x),
          };
    }
    case "bonk":
      return { sound: "bonk", gain: 0.7, rate: 1.15 * vary, pan: panAt(event.pos.x) };
    case "place":
      return { sound: "place", gain: 0.75, rate: 1, pan: panAt(event.pos.x) };
    case "task":
      return { sound: "task", gain: 0.7, rate: 1, pan: 0, duck: true };
    case "hatch":
      return { sound: "hatch", gain: 0.6, rate: 1, pan: 0.7 };
    case "room":
      return { sound: "room", gain: 0.45, rate: 1, pan: 0 };
    case "done":
      return { sound: "done", gain: 0.8, rate: 1, pan: 0, duck: true };
  }
}
