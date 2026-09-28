import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useEffect, useRef, useState } from "react";
import { formatTime } from "../game/evaluation";
import { Stars } from "./Stars";
import type { HudSnapshot } from "./store";

type Stage = "holding" | "connecting" | "connected";

/**
 * The finale: after all that holding, the call finally connects, then the shift review
 * with each room's stars against your best.
 */
export function EndCard({
  result,
  onReplay,
  reduced,
}: {
  result: NonNullable<HudSnapshot["result"]>;
  onReplay: () => void;
  reduced: boolean;
}) {
  const card = useRef<HTMLDivElement>(null);
  const replay = useRef<HTMLButtonElement>(null);
  const [stage, setStage] = useState<Stage>("holding");
  useEffect(() => {
    const scale = reduced ? 0.4 : 1;
    const a = window.setTimeout(() => setStage("connecting"), 1500 * scale);
    const b = window.setTimeout(() => setStage("connected"), 3000 * scale);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
    };
  }, [reduced]);
  useEffect(() => {
    if (stage === "connected") replay.current?.focus();
  }, [stage]);
  useGSAP(() => {
    if (!card.current) return;
    gsap.from(
      card.current,
      reduced
        ? { opacity: 0, duration: 0.3 }
        : { opacity: 0, y: 40, rotate: -2, duration: 0.7, ease: "back.out(1.6)" },
    );
  }, []);
  const { stats, evaluation, rooms } = result;
  const total = rooms.reduce((n, r) => n + r.result.stars, 0);
  const facts: [string, string][] = [
    ["Shift length", formatTime(stats.time)],
    ["Moves", String(stats.throws + stats.pushes)],
    ["Wall contacts", String(stats.bumps)],
    ["Stars", `${total} / ${rooms.length * 3}`],
  ];
  return (
    <div className="pointer-events-auto fixed inset-0 z-20 grid place-items-center overflow-y-auto bg-[#1d2130]/60 p-4">
      <div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-labelledby="eval-title"
        className="w-full max-w-md rounded-3xl border-4 border-[#e3c7a1] bg-[#f4ead8] p-5 text-[#3a2a22] shadow-2xl sm:p-6"
      >
        <div aria-live="polite" className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className={`grid size-11 shrink-0 place-items-center rounded-full text-2xl ${stage === "connected" ? "bg-[#9ed39a]" : "bg-[#e3c7a1]"} ${stage !== "connected" && !reduced ? "animate-pulse" : ""}`}
          >
            ☎
          </span>
          <p className="text-sm font-semibold">
            {stage === "holding" && "Your call is important to us. Please hold…"}
            {stage === "connecting" && "Connecting you now…"}
            {stage === "connected" &&
              "Connected! “Lounge? Yes, the tea arrived. Covered, upright, faintly warm. Thank you for holding.”"}
          </p>
        </div>
        {stage === "connected" && (
          <>
            <p className="mt-4 text-xs font-bold uppercase tracking-[0.2em] text-[#8c3b3b]">
              End of shift · Performance review
            </p>
            <h2 id="eval-title" className="mt-1 text-3xl font-extrabold">
              {evaluation.rating} attendant
            </h2>
            <ul className="mt-2 space-y-1 text-sm leading-snug">
              {evaluation.lines.slice(0, 3).map((l) => (
                <li key={l}>“{l}”</li>
              ))}
            </ul>
            <table className="mt-3 w-full text-left text-sm">
              <caption className="sr-only">Your rooms this shift</caption>
              <thead className="text-xs text-[#3a2a22]/65">
                <tr>
                  <th className="py-1 font-medium">Room</th>
                  <th className="font-medium">Stars</th>
                  <th className="font-medium">Moves</th>
                  <th className="font-medium">Time</th>
                  <th className="font-medium">Best</th>
                </tr>
              </thead>
              <tbody>
                {rooms.map((r) => (
                  <tr key={r.result.roomId} className="border-t border-[#3a2a22]/10">
                    <td className="py-1 font-semibold">{r.name}</td>
                    <td>
                      <Stars n={r.result.stars} />
                    </td>
                    <td>{r.result.moves}</td>
                    <td>{formatTime(r.result.time)}</td>
                    <td>{r.best ? <Stars n={r.best.stars} /> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              {facts.map(([k, v]) => (
                <div key={k} className="rounded-xl bg-[#3a2a22]/6 px-3 py-1.5">
                  <dt className="text-xs text-[#3a2a22]/65">{k}</dt>
                  <dd className="text-lg font-bold">{v}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
        {stage !== "connected" && (
          <h2 id="eval-title" className="sr-only">
            Connecting your call
          </h2>
        )}
        <button
          ref={replay}
          type="button"
          onClick={stage === "connected" ? onReplay : () => setStage("connected")}
          className="mt-4 w-full rounded-2xl bg-[#8c3b3b] px-4 py-3 text-lg font-bold text-[#fff4dc] shadow-[0_4px_0_rgba(58,42,34,0.35)] active:translate-y-0.5 active:shadow-none"
        >
          {stage === "connected" ? "Start another shift" : "Skip the hold music"}
        </button>
      </div>
    </div>
  );
}
