import { mergeRecords, parseRecords, type Records, type RoomResult } from "../game/scoring";

const KEY = "please-hold:records";

/** Best result per room, kept in this browser only. Storage failures are harmless. */
export function loadRecords(): Records {
  try {
    return parseRecords(window.localStorage.getItem(KEY));
  } catch {
    return {};
  }
}

export function saveResults(records: Records, results: RoomResult[]): Records {
  const next = mergeRecords(records, results);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private mode or blocked storage: stars still show for this visit.
  }
  return next;
}
