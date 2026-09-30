import { canPushWithItem, itemInReach, railInReach } from "./actions";
import { STRANDED_SPEED } from "./constants";
import { heldItem } from "./state";
import type { GameState } from "./types";
import { len } from "./vec";

export type InputMode = "pointer" | "touch";

/** One short line of in-place guidance for the current situation, or null when none is needed. */
export function hintFor(state: GameState, mode: InputMode): string | null {
  if (state.phase !== "playing") return null;
  const p = state.player;
  const touch = mode === "touch";
  const act = touch ? "Tap" : "Click";
  const grabKey = touch ? "GRAB" : "E (or right-click)";
  const item = heldItem(state);
  const s = state.stats;

  if (state.hatchOpen) return "Room tidy. Float through the open hatch.";
  const attemptMoves = s.throws + s.pushes - state.roomStart.moves;
  if (state.roomIndex === 0 && attemptMoves === 0 && item) {
    return `${act} toward the far wall to throw the ${item.label}. You drift the other way.`;
  }
  if (!p.rail && railInReach(state)) return `Handrail in reach: press ${grabKey} to stop.`;
  if (!p.holding) {
    const near = itemInReach(state);
    if (near) return `The ${near.label} is in reach: press ${grabKey}.`;
  }
  if (canPushWithItem(state) && s.pushes === 0) {
    const push = touch ? "PUSH" : "Q";
    return `${act} to throw from the rail (no recoil), or ${push} to push off carrying it.`;
  }
  if (p.rail && !p.holding && s.pushes === 0) {
    return `${act} where you want to go to push off the rail.`;
  }
  if (!p.rail && !p.holding && len(p.vel) < STRANDED_SPEED) {
    return touch
      ? "Adrift with nothing to throw. Tap RESTART to re-enter the room."
      : "Adrift with nothing to throw. Press R to re-enter the room.";
  }
  if (state.roomIndex === 2 && p.holding === "flask" && p.rail) {
    return "Time your crossing with the revolving bar.";
  }
  return null;
}
