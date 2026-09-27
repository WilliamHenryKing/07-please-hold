import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useRef } from "react";
import { formatTime } from "../game/evaluation";
import type { HudSnapshot } from "./store";

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
  useGSAP(() => {
    if (!card.current) return;
    gsap.from(
      card.current,
      reduced
        ? { opacity: 0, duration: 0.3 }
        : { opacity: 0, y: 40, rotate: -2, duration: 0.7, ease: "back.out(1.6)" },
    );
  }, []);
  const { stats, evaluation } = result;
  const facts: [string, string][] = [
    ["Shift length", formatTime(stats.time)],
    ["Throws", String(stats.throws)],
    ["Push-offs", String(stats.pushes)],
    ["Wall contacts", String(stats.bumps)],
  ];
  return (
    <div className="pointer-events-auto fixed inset-0 z-20 grid place-items-center bg-[#1d2130]/55 p-4">
      <div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-labelledby="eval-title"
        className="w-full max-w-md rounded-3xl border-4 border-[#e3c7a1] bg-[#f4ead8] p-6 text-[#3a2a22] shadow-2xl"
      >
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#8c3b3b]">
          End of shift · Performance review
        </p>
        <h2 id="eval-title" className="mt-1 text-3xl font-extrabold">
          {evaluation.rating} attendant
        </h2>
        <p
          className="mt-1 text-2xl text-[#d9a441]"
          role="img"
          aria-label={`${evaluation.stars} of 3 stars`}
        >
          {"★".repeat(evaluation.stars)}
          <span className="text-[#3a2a22]/20">{"★".repeat(3 - evaluation.stars)}</span>
        </p>
        <ul className="mt-3 space-y-1.5 text-sm leading-snug">
          {evaluation.lines.map((l) => (
            <li key={l}>“{l}”</li>
          ))}
        </ul>
        <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
          {facts.map(([k, v]) => (
            <div key={k} className="rounded-xl bg-[#3a2a22]/6 px-3 py-2">
              <dt className="text-xs text-[#3a2a22]/65">{k}</dt>
              <dd className="text-lg font-bold">{v}</dd>
            </div>
          ))}
        </dl>
        <button
          type="button"
          // biome-ignore lint/a11y/noAutofocus: the dialog's only action should take focus
          autoFocus
          onClick={onReplay}
          className="mt-5 w-full rounded-2xl bg-[#8c3b3b] px-4 py-3 text-lg font-bold text-[#fff4dc] shadow-[0_4px_0_rgba(58,42,34,0.35)] active:translate-y-0.5 active:shadow-none"
        >
          Start another shift
        </button>
      </div>
    </div>
  );
}
