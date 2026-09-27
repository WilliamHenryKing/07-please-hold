import { type Action, canGrab, canPushWithItem, primaryAction } from "../game/actions";
import { type Evaluation, evaluate } from "../game/evaluation";
import { hintFor, type InputMode } from "../game/hints";
import { ROOMS } from "../game/rooms";
import type { GameState, Stats } from "../game/types";

/** What the HUD shows. Rebuilt every frame, but React only re-renders when it changes. */
export interface HudSnapshot {
  roomIndex: number;
  roomCount: number;
  roomName: string;
  tasks: { text: string; done: boolean }[];
  hint: string | null;
  primary: Action;
  canGrab: boolean;
  canPush: boolean;
  hatchOpen: boolean;
  finished: boolean;
  mode: InputMode;
  muted: boolean;
  result: { stats: Stats; evaluation: Evaluation } | null;
}

export function snapshot(state: GameState, mode: InputMode, muted = false): HudSnapshot {
  const finished = state.phase === "done";
  return {
    roomIndex: state.roomIndex,
    roomCount: ROOMS.length,
    roomName: state.room.name,
    tasks: state.room.tasks.map((t, i) => ({ text: t.text, done: !!state.done[i] })),
    hint: hintFor(state, mode),
    primary: primaryAction(state),
    canGrab: canGrab(state),
    canPush: canPushWithItem(state),
    hatchOpen: state.hatchOpen,
    finished,
    mode,
    muted,
    result: finished ? { stats: { ...state.stats }, evaluation: evaluate(state.stats) } : null,
  };
}

/** A tiny external store for useSyncExternalStore. */
export class HudStore {
  private current: HudSnapshot;
  private key = "";
  private listeners = new Set<() => void>();

  constructor(initial: HudSnapshot) {
    this.current = initial;
  }

  publish(next: HudSnapshot) {
    const key = JSON.stringify(next.result ? { ...next, result: next.result.evaluation } : next);
    if (key === this.key) return;
    this.key = key;
    this.current = next;
    for (const l of this.listeners) l();
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  get = () => this.current;
}
