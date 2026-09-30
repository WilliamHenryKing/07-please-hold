import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { formatTime } from "../game/evaluation";
import { advanceCallStage, type CallStage, callStageAt } from "./callStage";
import { Stars } from "./Stars";
import type { HudSnapshot } from "./store";

/**
 * The finale: after all that holding, the call finally connects, then the shift review
 * with each room's stars against your best.
 */
export function EndCard({
  result,
  onReplay,
  reduced,
  sound,
}: {
  result: NonNullable<HudSnapshot["result"]>;
  onReplay: () => void;
  reduced: boolean;
  sound: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const born = useRef<number | null>(null);
  const timers = useRef<number[]>([]);
  const connected = useRef(false);
  const [stage, setStage] = useState<CallStage>("holding");
  const clearTimers = useCallback(() => {
    for (const timer of timers.current) window.clearTimeout(timer);
    timers.current = [];
  }, []);
  const finishCall = () => {
    connected.current = true;
    clearTimers();
    setStage("connected");
  };
  useLayoutEffect(() => {
    const el = dialog.current;
    if (!el) return;
    el.showModal();
    el.scrollTop = 0;
    el.focus({ preventScroll: true });
    return () => el.close();
  }, []);
  useEffect(() => {
    if (connected.current) return;
    born.current ??= performance.now();
    const elapsed = performance.now() - born.current;
    const scale = reduced ? 0.4 : 1;
    setStage((current) => advanceCallStage(current, callStageAt(elapsed, reduced)));
    timers.current = [
      window.setTimeout(
        () => {
          if (!connected.current) setStage((current) => advanceCallStage(current, "connecting"));
        },
        Math.max(0, 1500 * scale - elapsed),
      ),
      window.setTimeout(
        () => {
          connected.current = true;
          setStage("connected");
        },
        Math.max(0, 3000 * scale - elapsed),
      ),
    ];
    return clearTimers;
  }, [reduced, clearTimers]);
  useLayoutEffect(() => {
    if (stage === "connected" && dialog.current) {
      dialog.current.scrollTop = 0;
      dialog.current.focus({ preventScroll: true });
    }
  }, [stage]);
  useGSAP(
    () => {
      if (!card.current) return;
      gsap.from(
        card.current,
        reduced
          ? { opacity: 0, duration: 0.3 }
          : { opacity: 0, y: 40, rotate: -2, duration: 0.7, ease: "back.out(1.6)" },
      );
    },
    { scope: card, dependencies: [reduced], revertOnUpdate: true },
  );
  const { stats, evaluation, rooms } = result;
  const total = rooms.reduce((n, r) => n + r.result.stars, 0);
  const facts: [string, string][] = [
    ["Shift length", formatTime(stats.time)],
    ["Moves", String(stats.throws + stats.pushes)],
    ["Wall contacts", String(stats.bumps)],
    ["Stars", `${total} / ${rooms.length * 3}`],
  ];
  return (
    <dialog
      ref={dialog}
      className="ending-dialog pointer-events-auto"
      aria-labelledby="eval-title"
      aria-describedby="call-status"
      aria-modal="true"
      data-keyboard-scroll
      tabIndex={-1}
      onCancel={(event) => event.preventDefault()}
    >
      <div ref={card} className="ending-card">
        <div className="ending-toolbar">{sound}</div>
        <div id="call-status" aria-live="polite" className="flex items-center gap-3">
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
            <table className="room-records mt-3 w-full text-left text-sm">
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
          type="button"
          onClick={stage === "connected" ? onReplay : finishCall}
          className="mt-4 w-full rounded-2xl bg-[#8c3b3b] px-4 py-3 text-lg font-bold text-[#fff4dc] shadow-[0_4px_0_rgba(58,42,34,0.35)] active:translate-y-0.5 active:shadow-none"
        >
          {stage === "connected" ? "Start another shift" : "Skip the hold music"}
        </button>
      </div>
    </dialog>
  );
}
