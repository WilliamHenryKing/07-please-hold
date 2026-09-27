import type { Stats } from "./types";

export interface Evaluation {
  rating: string;
  stars: number;
  lines: string[];
}

export function formatTime(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The end-of-shift performance review. Deterministic from the stats alone. */
export function evaluate(stats: Stats): Evaluation {
  const messy = stats.bumps + stats.bonks * 2 + stats.restarts * 3;
  const stars = messy <= 6 ? 3 : messy <= 16 ? 2 : 1;
  const rating = ["Provisional", "Satisfactory", "Exemplary"][stars - 1] ?? "Provisional";
  const lines = [
    "The lounge committee praises your dynamic approach to furniture.",
    stats.bonks > 0
      ? `You were struck by your own ${plural(stats.bonks, "returning object")}. Guests found this reassuring.`
      : "No attendant was struck by returning cushions. A lounge first.",
    stats.bumps > 8
      ? `The padded walls absorbed ${plural(stats.bumps, "enthusiastic contact")}. That is what they are for.`
      : "Wall contact was kept to a tasteful minimum.",
    stats.restarts > 0
      ? `You re-entered ${plural(stats.restarts, "room")} with fresh composure.`
      : "The tea arrived covered, upright and faintly warm.",
  ];
  return { rating, stars, lines };
}
