// Visual review captures: stage every camera bookmark and screenshot it in headless Chromium
// on SwiftShader. Usage: node scripts/capture.mjs <label>   (needs `bun run preview` running)
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const label = process.argv[2] ?? "baseline";
const base = process.env.BASE ?? "http://127.0.0.1:4617";
const out = `docs/visual/captures/${label}`;
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const probe = await browser.newPage();
await probe.goto(`${base}/?e2e`);
await probe.waitForFunction(() => window.__VISUAL_TEST__?.ready, undefined, { timeout: 60_000 });
const { bookmarks, renderer } = await probe.evaluate(() => window.__VISUAL_TEST__);
await probe.close();
console.log(`renderer: ${renderer}`);

const meta = { label, renderer, date: new Date().toISOString(), shots: [] };
for (const name of bookmarks) {
  const vp = name.startsWith("phone")
    ? { width: 390, height: 844, scale: 2, mobile: true }
    : { width: 1440, height: 900, scale: 1, mobile: false };
  const page = await browser.newPage({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.scale,
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
  });
  await page.goto(`${base}/?e2e${process.env.QUALITY ? `&quality=${process.env.QUALITY}` : ""}`);
  await page.waitForFunction(() => window.__VISUAL_TEST__?.ready, undefined, { timeout: 60_000 });
  const posed = await page.evaluate((n) => window.__VISUAL_TEST__.setBookmark(n), name);
  // Let the room banner pass and held items settle, then freeze time for a stable frame.
  await page.waitForTimeout(3600);
  await page.evaluate(() => window.__VISUAL_TEST__.freeze(true));
  await page.evaluate(() => window.__VISUAL_TEST__.settle(6));
  const file = `${out}/${name}.png`;
  await page.screenshot({ path: file });
  meta.shots.push({ name, file, posed, viewport: vp });
  console.log(`captured ${file}`);
  await page.close();
}
writeFileSync(`${out}/capture.json`, `${JSON.stringify(meta, null, 2)}\n`);
await browser.close();
