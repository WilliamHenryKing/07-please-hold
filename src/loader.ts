// Only a successfully prepared and rendered room lifts the arrival veil.
let removal = 0;
let slow = 0;

function status(message: string) {
  const veil = document.getElementById("arrival");
  if (!veil) return;
  const label = veil.querySelector(".sub");
  if (label) label.textContent = message;
  if (!veil.querySelector("button")) {
    const reload = document.createElement("button");
    reload.type = "button";
    reload.textContent = "Reload";
    reload.style.cssText =
      "min-height:44px;padding:10px 22px;border:2px solid #8c3b3b;border-radius:16px;background:#fff4dc;color:#3a2a22;font:700 16px system-ui;cursor:pointer";
    reload.onclick = () => window.location.reload();
    veil.append(reload);
  }
}

export function worldReady() {
  clearTimeout(slow);
  const veil = document.getElementById("arrival");
  if (!veil || veil.classList.contains("is-done")) return;
  veil.classList.add("is-done");
  removal = window.setTimeout(() => veil.remove(), 700);
}

export function worldFailed() {
  clearTimeout(slow);
  clearTimeout(removal);
  let veil = document.getElementById("arrival");
  if (!veil) {
    veil = document.createElement("div");
    veil.id = "arrival";
    veil.setAttribute("role", "alert");
    const label = document.createElement("span");
    label.className = "sub";
    veil.append(label);
    document.body.append(veil);
  }
  veil.classList.remove("is-done");
  veil.querySelector(".bar")?.remove();
  veil.querySelector(".port")?.remove();
  status("The lounge could not load. Please try again.");
  veil.querySelector("button")?.focus({ preventScroll: true });
}

if (typeof window !== "undefined") {
  slow = window.setTimeout(() => status("Still preparing the lounge…"), 30_000);
}
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    clearTimeout(slow);
    clearTimeout(removal);
  });
