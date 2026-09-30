import { useLayoutEffect, useRef } from "react";
import { focusPlaySurface } from "./focus";
import type { Controls } from "./Hud";
import type { HudSnapshot } from "./store";

export function Title({ onBegin }: { onBegin: () => void }) {
  const button = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => button.current?.focus({ preventScroll: true }), []);
  return (
    <section className="opening" aria-labelledby="opening-title">
      <div className="opening-copy">
        <p className="rise eyebrow">Orbital hospitality · Your first shift</p>
        <h1 className="rise" id="opening-title">
          Please
          <br />
          <em>hold.</em>
        </h1>
        <p className="rise premise">
          Your call is important.
          <br />
          Your furniture is escaping.
        </p>
        <div className="rise">
          <button ref={button} type="button" className="intro-button" onClick={onBegin}>
            Start the shift
          </button>
          <span className="enter-note">or press Enter</span>
        </div>
      </div>
    </section>
  );
}

export function Guide({ hud, controls }: { hud: HudSnapshot; controls: Controls }) {
  const el = useRef<HTMLElement>(null);
  const prompt = hud.guidePrompt;
  useLayoutEffect(() => {
    if (prompt?.key && el.current) el.current.scrollTop = 0;
  }, [prompt?.key]);
  if (!prompt) return null;
  return (
    <aside
      ref={el}
      className="shift-guide"
      aria-label="Shift guide"
      aria-live="polite"
      data-keyboard-scroll
      // biome-ignore lint/a11y/noNoninteractiveTabindex: The bounded guide is a native keyboard scroll surface.
      tabIndex={0}
    >
      <h2 className="eyebrow">
        {prompt.step === null ? "Practice" : `${prompt.step + 1}/4`} · {prompt.title}
      </h2>
      <p>{prompt.body}</p>
      <div className="guide-foot">
        <span aria-hidden="true">
          {prompt.step === null
            ? "Your current task"
            : [0, 1, 2, 3].map((i) => (i === prompt.step ? "● " : "○ "))}
        </span>
        <button
          type="button"
          onClick={() => {
            controls.skipGuide();
            focusPlaySurface();
          }}
        >
          Skip the guide
        </button>
      </div>
    </aside>
  );
}
