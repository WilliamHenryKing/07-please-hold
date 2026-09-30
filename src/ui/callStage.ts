export type CallStage = "holding" | "connecting" | "connected";

const ORDER: Record<CallStage, number> = { holding: 0, connecting: 1, connected: 2 };

export function callStageAt(elapsed: number, reduced: boolean): CallStage {
  const scale = reduced ? 0.4 : 1;
  if (elapsed >= 3000 * scale) return "connected";
  return elapsed >= 1500 * scale ? "connecting" : "holding";
}

/** Skipping or changing the motion preference must never move the call backwards. */
export function advanceCallStage(current: CallStage, next: CallStage): CallStage {
  return ORDER[next] > ORDER[current] ? next : current;
}
