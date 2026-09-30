import type { GameState, Stats } from "./types";

/** Par per room: moves (throws + push-offs) and seconds. Beat both for three stars. */
export const PARS: Record<string, { moves: number; time: number }> = {
  arrival: { moves: 3, time: 25 },
  conservatory: { moves: 7, time: 55 },
  galley: { moves: 4, time: 35 },
};

export interface RoomResult {
  roomId: string;
  moves: number;
  time: number;
  stars: number;
}

export type Records = Record<string, RoomResult>;

export const movesOf = (s: Pick<Stats, "throws" | "pushes">) => s.throws + s.pushes;

/** 3 stars within par on both counts, 2 within double par on both, otherwise 1. */
export function starsFor(roomId: string, moves: number, time: number): number {
  const par = PARS[roomId];
  if (!par) return 1;
  if (moves <= par.moves && time <= par.time) return 3;
  if (moves <= par.moves * 2 && time <= par.time * 2) return 2;
  return 1;
}

/** Snapshot the room just finished, measured from where the room began. */
export function roomResult(state: GameState): RoomResult {
  const moves = movesOf(state.stats) - state.roomStart.moves;
  const time = state.stats.time - state.roomStart.time;
  return { roomId: state.room.id, moves, time, stars: starsFor(state.room.id, moves, time) };
}

/** Better = more stars, then fewer moves, then less time. */
export function isBetter(next: RoomResult, prev: RoomResult | undefined): boolean {
  if (!prev) return true;
  if (next.stars !== prev.stars) return next.stars > prev.stars;
  if (next.moves !== prev.moves) return next.moves < prev.moves;
  return next.time < prev.time;
}

export function mergeRecords(records: Records, results: RoomResult[]): Records {
  const out: Records = { ...records };
  for (const r of results) if (isBetter(r, out[r.roomId])) out[r.roomId] = r;
  return out;
}

/** Defensive parse of stored records: anything malformed is dropped. */
export function parseRecords(raw: string | null): Records {
  if (!raw) return {};
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    const out: Records = {};
    for (const [id, v] of Object.entries(data as Record<string, unknown>)) {
      if (!Object.hasOwn(PARS, id) || !v || typeof v !== "object" || Array.isArray(v)) continue;
      const r = v as Partial<RoomResult>;
      if (
        typeof r.moves === "number" &&
        Number.isInteger(r.moves) &&
        r.moves >= 0 &&
        typeof r.time === "number" &&
        Number.isFinite(r.time) &&
        r.time >= 0 &&
        typeof r.stars === "number" &&
        Number.isInteger(r.stars) &&
        r.stars >= 1 &&
        r.stars <= 3
      ) {
        out[id] = { roomId: id, moves: r.moves, time: r.time, stars: r.stars };
      }
    }
    return out;
  } catch {
    return {};
  }
}
