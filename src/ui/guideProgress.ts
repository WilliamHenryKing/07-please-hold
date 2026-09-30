import { itemInReach, railInReach } from "../game/actions";
import type { InputMode } from "../game/hints";
import type { GameEvent, GameState } from "../game/types";

export interface GuideProgress {
  step: 0 | 1 | 2 | 3;
  kind: "first" | "practice";
  roomId: string;
  itemId: string | null;
}

export interface GuidePrompt {
  key: string;
  title: string;
  body: string;
  /** Only the first lesson has four numbered steps. */
  step: number | null;
}

export function startGuide(state: GameState, practice = false): GuideProgress | null {
  if (state.phase !== "playing") return null;
  const first =
    !practice &&
    state.room.id === "arrival" &&
    !state.done.some(Boolean) &&
    state.player.holding === "cushion";
  return {
    step: 0,
    kind: first ? "first" : "practice",
    roomId: state.room.id,
    itemId: first ? "cushion" : state.player.holding,
  };
}

/** Advance from successful actions, never from proximity or an unrelated button press. */
export function stepGuide(
  progress: GuideProgress | null,
  state: GameState,
  events: readonly GameEvent[],
): GuideProgress | null {
  if (!progress || state.phase !== "playing" || state.room.id !== progress.roomId) return null;
  if (progress.kind === "practice") {
    return events.some((event) => event.type === "place") ? null : progress;
  }
  let next = progress;
  for (const event of events) {
    if (event.type === "place" && event.item === next.itemId && event.slot === "sofa") {
      // A direct delivery is valid too: do not ask the player to retrieve a placed cushion.
      return state.hatchOpen ? null : startGuide(state, true);
    }
    if (next.step === 0 && event.type === "throw" && event.item === next.itemId) {
      next = { ...next, step: 1 };
    } else if (
      next.step === 1 &&
      event.type === "grab" &&
      event.target === "rail" &&
      event.id === "port"
    ) {
      next = { ...next, step: 2 };
    } else if (
      next.step === 2 &&
      event.type === "grab" &&
      event.target === "item" &&
      event.id === next.itemId
    ) {
      next = { ...next, step: 3 };
    }
  }
  if (state.items.some((item) => item.id === next.itemId && item.placed)) {
    return state.hatchOpen ? null : startGuide(state, true);
  }
  return next;
}

function practicePrompt(state: GameState, mode: InputMode): GuidePrompt {
  const grab = mode === "touch" ? "tap Grab" : "press E or tap Grab";
  const throwAction =
    mode === "touch" ? "drag to aim and release, or tap Throw" : "aim and press Space or click";
  const prompt = (key: string, title: string, body: string): GuidePrompt => ({
    key: `${state.room.id}:${key}`,
    title,
    body,
    step: null,
  });
  if (state.hatchOpen) {
    return prompt(
      "hatch",
      "On to the next room",
      "The hatch is open. If you are holding a rail, aim through the hatch and push off. Otherwise let your drift carry you through; catch a rail to change course.",
    );
  }
  const held = state.items.find((item) => item.id === state.player.holding);
  if (held) {
    const slot = state.room.slots.find((candidate) => candidate.item === held.id);
    return prompt(
      `deliver:${held.id}:${state.player.rail ? "anchored" : "drifting"}`,
      `Deliver the ${held.label}`,
      `Aim at the ${slot?.label ?? "destination"}'s glowing ring, then ${throwAction}. ${
        state.player.rail
          ? "Holding a rail keeps you anchored when you throw."
          : "The throw also sends you drifting in the opposite direction."
      }${held.kind === "flask" ? " Wait for a clear gap in the revolving compartment." : ""}`,
    );
  }
  const rail = railInReach(state);
  if (!state.player.rail && rail) {
    return prompt(
      "rail",
      "Catch a handrail",
      `When the rail is within reach, ${grab}. Holding it stops your drift so you can plan the next throw.`,
    );
  }
  const item = itemInReach(state);
  if (item) {
    return prompt(
      `recover:${item.id}`,
      `Pick up the ${item.label}`,
      `The ${item.label} is within reach. ${grab[0]?.toUpperCase()}${grab.slice(1)} to hold it, then aim for its destination.`,
    );
  }
  const pending = state.room.tasks.flatMap((task, index) => {
    if (state.done[index] || task.kind !== "deliver") return [];
    const slot = state.room.slots.find((candidate) => candidate.id === task.slot);
    const next = state.items.find((candidate) => candidate.id === slot?.item && !candidate.placed);
    return next ? [next] : [];
  })[0];
  if (state.player.rail) {
    return prompt(
      `push:${pending?.id ?? "rail"}`,
      pending ? `Reach the ${pending.label}` : "Reach the task handrail",
      `Aim toward ${pending ? `the ${pending.label}` : "the handrail listed in your tasks"} and use Push off. Catch it with Grab when it enters the green reach ring. Restart this room if you want another attempt.`,
    );
  }
  return prompt(
    `drift:${pending?.id ?? "rail"}`,
    "Let the room come to you",
    `You cannot steer while floating empty-handed. Watch for a handrail${pending ? ` or the ${pending.label}` : ""} to enter the green reach ring, then ${grab}. If you have stopped out of reach, use Restart this room.`,
  );
}

export function guidePrompt(
  progress: GuideProgress | null,
  state: GameState,
  mode: InputMode,
): GuidePrompt | null {
  if (!progress || state.phase !== "playing" || progress.roomId !== state.room.id) return null;
  if (progress.kind === "practice") return practicePrompt(state, mode);
  if (progress.step === 3 && !state.player.holding) {
    return { ...practicePrompt(state, mode), step: 3 };
  }
  const touch = mode === "touch";
  const steps = [
    [
      "A cushion is an engine",
      `Aim away from the starting handrail and ${touch ? "drag and release, or tap Throw" : "click or press Space"} to throw the cushion. It goes one way; you drift the other.`,
    ],
    [
      "Catch your breath",
      `${touch ? "Tap Grab" : "Press E or tap Grab"} when the starting handrail enters the green reach ring. Holding it stops you drifting.`,
    ],
    [
      "Nothing stays lost",
      `Wait for the cushion to bounce back within reach, then ${touch ? "tap Grab" : "press E or tap Grab"}. If it is out of reach, push off toward it or use Restart to try the room again.`,
    ],
    [
      "Return it to the sofa",
      `Aim at the sofa's glowing ring and ${touch ? "release or tap Throw" : "throw with Space or a click"}. Holding a rail prevents recoil. Finishing both tasks opens the hatch.`,
    ],
  ];
  const step = steps[progress.step];
  return {
    key: `${progress.roomId}:first:${progress.step}`,
    title: step?.[0] ?? "Your first shift",
    body: step?.[1] ?? "Follow the current room's tasks.",
    step: progress.step,
  };
}
