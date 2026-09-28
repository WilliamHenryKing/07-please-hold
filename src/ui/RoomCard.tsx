import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useRef } from "react";
import { formatTime } from "../game/evaluation";
import { PARS } from "../game/scoring";
import { Stars } from "./Stars";
import type { HudSnapshot } from "./store";

/** Between rooms: how the room just went, against par and your best. */
export function RoomCard({
  card,
  reduced,
}: {
  card: NonNullable<HudSnapshot["roomCard"]>;
  reduced: boolean;
}) {
  const el = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    if (!el.current) return;
    gsap.from(
      el.current,
      reduced
        ? { opacity: 0, duration: 0.2 }
        : { opacity: 0, y: -12, duration: 0.5, ease: "back.out(2)" },
    );
  }, []);
  const { result, best } = card;
  const par = PARS[result.roomId];
  const isBest =
    !best ||
    (best.stars === result.stars && best.moves === result.moves && best.time === result.time);
  return (
    <div
      ref={el}
      role="status"
      className="mx-auto w-fit max-w-full rounded-2xl bg-[#f4ead8]/95 px-4 py-2 text-center text-sm text-[#3a2a22] shadow-lg"
    >
      <p className="font-bold">
        {card.name} tidy <Stars n={result.stars} className="ml-1 text-lg" />
      </p>
      <p className="text-[#3a2a22]/75">
        {result.moves} moves · {formatTime(result.time)}
        {par && (
          <span>
            {" "}
            (par {par.moves} · {formatTime(par.time)})
          </span>
        )}
        {best && !isBest && (
          <span>
            {" "}
            · best <Stars n={best.stars} /> {best.moves} moves
          </span>
        )}
        {isBest && <span className="font-semibold text-[#4f8a4b]"> · new best</span>}
      </p>
    </div>
  );
}
