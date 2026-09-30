import { expect, test } from "@playwright/test";
import { aim, clearGuide, read, readableGuide, ready, screen, shot } from "./support";

let errors: string[];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
});
test.afterEach(() => expect(errors).toEqual([]));

test("title guards, immediate keyboard aim and live reduced motion", async ({ page }) => {
  await page.goto("/?e2e&intro");
  await ready(page);
  await expect(page.locator("#stage")).toHaveJSProperty("inert", true);
  await page.keyboard.press("e");
  await page.keyboard.press("q");
  await page.keyboard.press("r");
  const title = await read(page);
  expect(title.stats.throws + title.stats.pushes + title.stats.restarts).toBe(0);
  expect(title.stats.time).toBe(0);
  await page.getByRole("button", { name: "Start the shift", exact: true }).click();
  await page.waitForTimeout(150);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.getByRole("button", { name: "Start the shift", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Shift guide", { exact: true })).toBeVisible({ timeout: 1500 });
  await expect(page.locator("#stage")).toBeFocused();
  // The action must consume current key aim even when no animation frame separates events.
  await page.keyboard.down("ArrowRight");
  await page.keyboard.press("Space");
  await page.keyboard.up("ArrowRight");
  await expect.poll(async () => (await read(page)).stats.throws).toBe(1);
  expect((await read(page)).player.vel.x).toBeLessThan(0);
  await page.getByRole("button", { name: "Restart this room (R)" }).click();
  expect((await read(page)).player.holding).toBe("cushion");
  await page.getByRole("button", { name: "Replay the guide" }).click();
  await expect(page.locator("#stage")).toBeFocused();
  await shot(page, "live-motion");
});

test("native buttons, blur, modifiers and editable fields do not leak game keys", async ({
  page,
}) => {
  await page.goto("/?e2e");
  await ready(page);
  await clearGuide(page);
  const restart = page.getByRole("button", { name: "Restart this room (R)" });
  await restart.focus();
  await page.keyboard.press("Space");
  expect((await read(page)).stats.restarts).toBe(1);
  expect((await read(page)).stats.throws).toBe(0);
  await page.evaluate(() =>
    window.dispatchEvent(
      new KeyboardEvent("keydown", { code: "KeyR", key: "r", ctrlKey: true, bubbles: true }),
    ),
  );
  expect((await read(page)).stats.restarts).toBe(1);
  await page.evaluate(() => {
    const field = document.createElement("textarea");
    field.id = "input-probe";
    field.style.cssText = "position:fixed;left:0;top:0;z-index:1000";
    document.body.append(field);
    field.focus();
  });
  await page.keyboard.type("wasderqm ");
  expect((await read(page)).stats.restarts).toBe(1);
  expect((await read(page)).stats.throws).toBe(0);
  await page.locator("#input-probe").evaluate((el) => el.remove());
  await page.locator("#stage").focus();
  await page.keyboard.down("ArrowLeft");
  await page.waitForTimeout(60);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await aim(page, 5, 0.3);
  await page.waitForTimeout(100);
  expect((await read(page)).player.aim.x).toBeGreaterThan(0.9);
  await page.keyboard.up("ArrowLeft");
  await shot(page, "controls");
});

for (const [width, height] of [
  [390, 844],
  [568, 320],
  [320, 568],
] as const) {
  test(`touch guide and canceled drag at ${width}x${height}`, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width, height },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    const localErrors: string[] = [];
    page.on("pageerror", (e) => localErrors.push(e.message));
    await page.goto("http://127.0.0.1:4617/?e2e&intro");
    await ready(page);
    await page.getByRole("button", { name: "Start the shift", exact: true }).tap();
    await readableGuide(page);
    await page.waitForTimeout(2800);
    await shot(page, `guide-${width}`);
    const game = await read(page);
    const p = await screen(page, game.player.pos.x, game.player.pos.y);
    expect(
      await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id === "stage", p),
    ).toBe(true);
    const cdp = await context.newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: p.x, y: p.y, id: 1 }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: p.x + 15, y: p.y, id: 1 }],
    });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
    await page.waitForTimeout(100);
    expect((await read(page)).stats.throws).toBe(0);
    // A button remains usable after the drag's cancellation.
    await page.getByRole("button", { name: "Throw toward your aim (Space)", exact: true }).tap();
    expect((await read(page)).stats.throws).toBe(1);
    await page.getByRole("button", { name: "Skip the guide", exact: true }).tap();
    await page.getByRole("button", { name: "Replay the guide", exact: true }).tap();
    await readableGuide(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
    expect(localErrors).toEqual([]);
    await context.close();
  });
}

test("a slow critical asset keeps the veil until the lounge is ready", async ({ page }) => {
  await page.route("**/textures/env/*.hdr", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 15_000));
    await route.continue();
  });
  await page.goto("/?e2e&intro", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(12_500);
  await expect(page.locator("#arrival")).toBeVisible();
  await expect(page.locator("#arrival")).not.toHaveClass(/is-done/);
  expect((await read(page)).stats.time).toBe(0);
  await shot(page, "slow-startup");
  await ready(page);
  await page.getByRole("button", { name: "Start the shift", exact: true }).click();
  await readableGuide(page);
});

test("missing critical textures offer focused recovery", async ({ page }) => {
  await page.route("**/textures/upholstery/*", (route) => route.abort());
  await page.goto("/?e2e");
  await expect(page.locator("#arrival")).toContainText("The lounge could not load", {
    timeout: 30_000,
  });
  const reload = page.getByRole("button", { name: "Reload", exact: true });
  await expect(reload).toBeFocused();
  await reload.click({ trial: true });
  await shot(page, "startup-recovery");
});
