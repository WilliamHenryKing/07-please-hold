/** The neutral play surface keeps Space available for the current primary action. */
export function focusPlaySurface() {
  const canvas = document.querySelector<HTMLCanvasElement>("#stage");
  if (canvas && !canvas.inert) canvas.focus({ preventScroll: true });
}
