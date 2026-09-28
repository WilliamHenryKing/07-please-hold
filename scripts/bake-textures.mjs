// Bake the shipped textures from their sourced originals (see assets.manifest.json).
// Usage: node scripts/bake-textures.mjs <source-dir>
// Runs in headless Chromium so decoding, resizing and WebP encoding need no native tools.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const src = process.argv[2];
if (!src) throw new Error("usage: node scripts/bake-textures.mjs <source-dir>");
const out = "public/textures";
const dataUrl = (file) =>
  `data:image/${file.endsWith(".png") ? "png" : "jpeg"};base64,${readFileSync(`${src}/${file}`).toString("base64")}`;

const browser = await chromium.launch();
const page = await browser.newPage();

/** Runs inside the page: helpers shared by every bake. */
const helpers = () => {
  window.img = async (url, w, h) => {
    const bmp = await createImageBitmap(await (await fetch(url)).blob());
    const c = new OffscreenCanvas(w ?? bmp.width, h ?? bmp.height);
    const x = c.getContext("2d");
    x.imageSmoothingQuality = "high";
    x.drawImage(bmp, 0, 0, c.width, c.height);
    return x.getImageData(0, 0, c.width, c.height);
  };
  window.encode = async (data, quality) => {
    const c = new OffscreenCanvas(data.width, data.height);
    c.getContext("2d").putImageData(data, 0, 0);
    const blob = await c.convertToBlob({ type: "image/webp", quality });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000)
      s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  };
  // Resize one image and re-encode it (colour or data map).
  window.resize = async (url, w, h, quality) => window.encode(await window.img(url, w, h), quality);
};
await page.evaluate(helpers);

const save = (path, b64) => {
  mkdirSync(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  writeFileSync(path, Buffer.from(b64, "base64"));
  console.log(`wrote ${path} (${(Buffer.from(b64, "base64").length / 1024).toFixed(0)} KB)`);
};

// 1. Tufted leather upholstery: one panel face per tile, five buttons in a diamond, creases
//    between them, a stitched border seam, and Leather037's grain (tiled) blended on top.
const quilt = await page.evaluate(
  async ({ nor, rough, col }) => {
    const N = 1024;
    const grainN = await window.img(nor, 1024, 1024);
    const grainR = await window.img(rough, 1024, 1024);
    const grainC = await window.img(col, 1024, 1024);
    const buttons = [
      [0.28, 0.28],
      [0.72, 0.28],
      [0.28, 0.72],
      [0.72, 0.72],
      [0.5, 0.5],
    ];
    const creases = [
      [0.5, 0.5, 0.28, 0.28],
      [0.5, 0.5, 0.72, 0.28],
      [0.5, 0.5, 0.28, 0.72],
      [0.5, 0.5, 0.72, 0.72],
      [0.28, 0.28, 0.06, 0.06],
      [0.72, 0.28, 0.94, 0.06],
      [0.28, 0.72, 0.06, 0.94],
      [0.72, 0.72, 0.94, 0.94],
      [0.28, 0.28, 0.72, 0.28],
      [0.28, 0.72, 0.72, 0.72],
      [0.28, 0.28, 0.28, 0.72],
      [0.72, 0.28, 0.72, 0.72],
    ];
    const segDist = (u, v, [ax, ay, bx, by]) => {
      const dx = bx - ax;
      const dy = by - ay;
      const t = Math.max(0, Math.min(1, ((u - ax) * dx + (v - ay) * dy) / (dx * dx + dy * dy)));
      return Math.hypot(u - ax - t * dx, v - ay - t * dy);
    };
    const H = new Float32Array(N * N);
    const AO = new Float32Array(N * N);
    const STITCH = new Float32Array(N * N);
    const inset = 0.055;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const u = (x + 0.5) / N;
        const v = (y + 0.5) / N;
        let h = 0;
        let ao = 0;
        for (const [bx, by] of buttons) {
          const d = Math.hypot(u - bx, v - by);
          const pinch = Math.exp(-((d / 0.03) ** 2));
          const draw = Math.exp(-((d / 0.1) ** 2));
          h -= 0.9 * pinch + 0.45 * draw;
          ao += 0.55 * pinch + 0.2 * draw;
        }
        for (const s of creases) {
          const d = segDist(u, v, s);
          const c = Math.exp(-((d / 0.011) ** 2));
          h -= 0.22 * c;
          ao += 0.18 * c;
        }
        // Pillowing: each diamond cell puffs up between its buttons.
        h += 0.18 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
        // Stitched border seam: a groove with thread dashes along it.
        const edge = Math.min(u, v, 1 - u, 1 - v);
        const seam = Math.exp(-(((edge - inset) / 0.005) ** 2));
        h -= 0.16 * seam;
        ao += 0.2 * seam;
        const along = edge === u || edge === 1 - u ? v : u;
        const dash = (along * 60) % 1 < 0.62 ? 1 : 0;
        const thread = dash * Math.exp(-(((edge - inset) / 0.0035) ** 2));
        h += 0.1 * thread;
        STITCH[y * N + x] = thread;
        H[y * N + x] = h;
        AO[y * N + x] = Math.min(0.85, ao);
      }
    }
    const nrm = new ImageData(N, N);
    const arm = new ImageData(N, N);
    const alb = new ImageData(N, N);
    // Mean luminance of the grain scan, so the albedo is a neutral cream-ready modulation.
    let mean = 0;
    for (let i = 0; i < N * N; i++)
      mean +=
        0.2126 * grainC.data[i * 4] +
        0.7152 * grainC.data[i * 4 + 1] +
        0.0722 * grainC.data[i * 4 + 2];
    mean /= N * N;
    const K = 34; // slope scale: tuft depth relative to texel size
    const at = (x, y) => H[((y + N) % N) * N + ((x + N) % N)];
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        // Image rows run top-down; v runs bottom-up, so the y gradient flips sign.
        const dx = (at(x + 1, y) - at(x - 1, y)) * 0.5 * K;
        const dy = -(at(x, y + 1) - at(x, y - 1)) * 0.5 * K;
        let nx = -dx;
        let ny = -dy;
        let nz = 1;
        // Leather grain, tiled 5x, blended with a whiteout blend.
        const gx = (x * 5) % N;
        const gy = (y * 5) % N;
        const g = (gy * N + gx) * 4;
        const lx = (grainN.data[g] / 255) * 2 - 1;
        const ly = (grainN.data[g + 1] / 255) * 2 - 1;
        const lz = (grainN.data[g + 2] / 255) * 2 - 1;
        const len0 = Math.hypot(nx, ny, nz);
        nx /= len0;
        ny /= len0;
        nz /= len0;
        let bx = nx + lx * 0.8;
        let by = ny + ly * 0.8;
        let bz = nz * lz;
        const len = Math.hypot(bx, by, bz);
        bx /= len;
        by /= len;
        bz /= len;
        nrm.data[i * 4] = (bx * 0.5 + 0.5) * 255;
        nrm.data[i * 4 + 1] = (by * 0.5 + 0.5) * 255;
        nrm.data[i * 4 + 2] = (bz * 0.5 + 0.5) * 255;
        nrm.data[i * 4 + 3] = 255;
        const ao = 1 - AO[i];
        const r = grainR.data[g] / 255;
        const stitch = STITCH[i];
        // ARM: R = ambient occlusion, G = roughness (vinyl sheen on the puffs), B = metalness.
        arm.data[i * 4] = ao * 255;
        arm.data[i * 4 + 1] = Math.min(1, 0.38 + r * 0.35 + (1 - ao) * 0.25 + stitch * 0.3) * 255;
        arm.data[i * 4 + 2] = 0;
        arm.data[i * 4 + 3] = 255;
        const lum =
          0.2126 * grainC.data[g] + 0.7152 * grainC.data[g + 1] + 0.0722 * grainC.data[g + 2];
        const tone = Math.min(1.1, (lum / mean) ** 0.5) * (0.86 + 0.14 * ao);
        const base = 0.93 * tone;
        // Thread: a slightly darker, warmer waxed cotton.
        alb.data[i * 4] = Math.min(255, (base * (1 - stitch) + 0.62 * stitch) * 255);
        alb.data[i * 4 + 1] = Math.min(255, (base * (1 - stitch) + 0.52 * stitch) * 255);
        alb.data[i * 4 + 2] = Math.min(255, (base * (1 - stitch) + 0.42 * stitch) * 255);
        alb.data[i * 4 + 3] = 255;
      }
    }
    return {
      color: await window.encode(alb, 0.9),
      normal: await window.encode(nrm, 0.92),
      arm: await window.encode(arm, 0.9),
    };
  },
  {
    nor: dataUrl("Leather037/Leather037_1K-JPG_NormalGL.jpg"),
    rough: dataUrl("Leather037/Leather037_1K-JPG_Roughness.jpg"),
    col: dataUrl("Leather037/Leather037_1K-JPG_Color.jpg"),
  },
);
save(`${out}/upholstery/tufted_leather_color.webp`, quilt.color);
save(`${out}/upholstery/tufted_leather_normal.webp`, quilt.normal);
save(`${out}/upholstery/tufted_leather_arm.webp`, quilt.arm);

// 2. Plain leather grain (buttons, pads, cushion): the scan's normal and a packed ARM map.
const plain = await page.evaluate(
  async ({ nor, rough }) => {
    const n = await window.img(nor, 512, 512);
    const r = await window.img(rough, 512, 512);
    const arm = new ImageData(512, 512);
    for (let i = 0; i < 512 * 512; i++) {
      arm.data[i * 4] = 255;
      arm.data[i * 4 + 1] = Math.min(255, 90 + r.data[i * 4] * 0.4);
      arm.data[i * 4 + 2] = 0;
      arm.data[i * 4 + 3] = 255;
    }
    return { normal: await window.encode(n, 0.92), arm: await window.encode(arm, 0.9) };
  },
  {
    nor: dataUrl("Leather037/Leather037_1K-JPG_NormalGL.jpg"),
    rough: dataUrl("Leather037/Leather037_1K-JPG_Roughness.jpg"),
  },
);
save(`${out}/upholstery/leather_normal.webp`, plain.normal);
save(`${out}/upholstery/leather_arm.webp`, plain.arm);

// 3. Brushed, scuffed metal for the brass: normal and ARM (R = AO, G = roughness, B = metal).
const metal = await page.evaluate(
  async ({ nor, rough }) => {
    const n = await window.img(nor, 512, 512);
    const r = await window.img(rough, 512, 512);
    const arm = new ImageData(512, 512);
    for (let i = 0; i < 512 * 512; i++) {
      arm.data[i * 4] = 255;
      // Polished where hands hold the rail most: keep the scan's range but bias it glossy.
      arm.data[i * 4 + 1] = Math.min(255, 30 + r.data[i * 4] * 0.55);
      arm.data[i * 4 + 2] = 255;
      arm.data[i * 4 + 3] = 255;
    }
    return { normal: await window.encode(n, 0.92), arm: await window.encode(arm, 0.9) };
  },
  {
    nor: dataUrl("Metal054A/Metal054A_1K-JPG_NormalGL.jpg"),
    rough: dataUrl("Metal054A/Metal054A_1K-JPG_Roughness.jpg"),
  },
);
save(`${out}/brass/brushed_metal_normal.webp`, metal.normal);
save(`${out}/brass/brushed_metal_arm.webp`, metal.arm);

// 4. Fabrics copied from ODD TIDE (Poly Haven CC0): sofa wool bouclé, uniform linen weave.
for (const [set, dir, size] of [
  ["wool_boucle", "fabric", 512],
  ["rough_linen", "cloth", 512],
]) {
  for (const [kind, q] of [
    ["diff", 0.88],
    ["nor_gl", 0.92],
    ["arm", 0.9],
  ]) {
    const b64 = await page.evaluate(({ url, s, q }) => window.resize(url, s, s, q), {
      url: dataUrl(`${set}/${set}_${kind}_1k.jpg`),
      s: size,
      q,
    });
    save(`${out}/${dir}/${set}_${kind}_${size}.webp`, b64);
  }
}

// 5. NASA Earth: Blue Marble (day), cloud cover and Black Marble (night lights) at 2048 × 1024.
for (const [file, name, q] of [
  ["world.topo.bathy.200412.3x5400x2700.jpg", "earth_day_2k", 0.86],
  ["cloud_combined_2048.jpg", "earth_clouds_2k", 0.82],
  ["BlackMarble_2016_3km.jpg", "earth_night_2k", 0.82],
]) {
  const b64 = await page.evaluate(({ url, q }) => window.resize(url, 2048, 1024, q), {
    url: dataUrl(file),
    q,
  });
  save(`${out}/planet/${name}.webp`, b64);
}

// 6. KayKit Rogue atlas repainted as a bellhop uniform: the green tunic cells become bellhop
//    red, the bright neckerchief a gold braid, steel fittings brass, gloves white.
const bellhop = await page.evaluate(
  async ({ url }) => {
    const d = await window.img(url, 1024, 1024);
    // Swatches are 128 px wide and 256 px tall (8 columns × 4 rows).
    const cell = (x, y) => `${Math.floor(x / 128)},${Math.floor(y / 256)}`;
    // Cells measured from each mesh's UVs: tunic (0,1), cuffs and neckerchief (1,1), buckle
    // (3,0), gloves (5,2), straps (5,0)/(6,0), trousers (7,1), boots (3,2). Hair, skin and eyes stay.
    const tunic = new Set(["0,1"]);
    const braid = new Set(["1,1"]);
    const metal = new Set(["3,0"]);
    const gloves = new Set(["5,2"]);
    const straps = new Set(["5,0", "6,0"]);
    const trousers = new Set(["7,1"]);
    const boots = new Set(["3,2"]);
    for (let y = 0; y < 1024; y++) {
      for (let x = 0; x < 1024; x++) {
        const i = (y * 1024 + x) * 4;
        const r = d.data[i] / 255;
        const g = d.data[i + 1] / 255;
        const b = d.data[i + 2] / 255;
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const c = cell(x, y);
        let out = null;
        if (tunic.has(c)) out = [0.62, 0.2, 0.2].map((k) => k * (0.55 + lum * 1.4));
        else if (braid.has(c)) out = [0.95, 0.76, 0.42].map((k) => k * (0.6 + lum * 0.9));
        else if (metal.has(c)) out = [0.93, 0.74, 0.4].map((k) => k * (0.45 + lum * 0.8));
        else if (gloves.has(c)) out = [0.96, 0.94, 0.9].map((k) => k * (0.7 + lum * 0.5));
        else if (straps.has(c)) out = [0.36, 0.13, 0.12].map((k) => k * (0.6 + lum * 1.1));
        else if (trousers.has(c)) out = [0.16, 0.19, 0.28].map((k) => k * (0.7 + lum * 1.2));
        else if (boots.has(c)) out = [0.12, 0.1, 0.1].map((k) => k * (0.7 + lum * 1.4));
        if (!out) continue;
        d.data[i] = Math.min(255, out[0] * 255);
        d.data[i + 1] = Math.min(255, out[1] * 255);
        d.data[i + 2] = Math.min(255, out[2] * 255);
      }
    }
    // The swatches are smooth gradients, so 256 px holds them without banding.
    const c = new OffscreenCanvas(256, 256);
    const x = c.getContext("2d");
    const full = new OffscreenCanvas(1024, 1024);
    full.getContext("2d").putImageData(d, 0, 0);
    x.imageSmoothingQuality = "high";
    x.drawImage(full, 0, 0, 256, 256);
    return window.encode(x.getImageData(0, 0, 256, 256), 0.92);
  },
  { url: dataUrl("kaykit/addons/kaykit_character_pack_adventures/Assets/gltf/rogue_texture.png") },
);
save(`${out}/character/bellhop_atlas.webp`, bellhop);

await browser.close();
