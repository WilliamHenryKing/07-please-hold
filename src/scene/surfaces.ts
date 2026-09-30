import * as THREE from "three";
import { assetsForBuild, pbrSet, type SceneAssets, tex } from "./assets";

// The material library: sourced PBR sets (assets.manifest.json) tinted per role. Instance or
// base colours multiply the neutral albedo, so repeated panels vary without new textures.

function pbr(
  set: { map?: THREE.Texture; normalMap: THREE.Texture; arm: THREE.Texture } | null,
  params: THREE.MeshPhysicalMaterialParameters,
  normalScale = 1,
) {
  const m = new THREE.MeshPhysicalMaterial(params);
  if (set) {
    if (set.map) m.map = set.map;
    m.normalMap = set.normalMap;
    m.normalScale.set(normalScale, normalScale);
    m.roughnessMap = set.arm;
    m.aoMap = set.arm;
    m.aoMapIntensity = 1;
  }
  assetsForBuild().resources.material(m);
  return m;
}

const libraries = new WeakMap<SceneAssets, ReturnType<typeof build>>();

function build() {
  const tufted = pbrSet(
    "upholstery/tufted_leather_color.webp",
    "upholstery/tufted_leather_normal.webp",
    "upholstery/tufted_leather_arm.webp",
  );
  const leather = (repeat: number) =>
    pbrSet(
      "upholstery/tufted_leather_color.webp",
      "upholstery/leather_normal.webp",
      "upholstery/leather_arm.webp",
      repeat,
    );
  // Fabrics ship weave only (normal + ARM); the dye comes from each material's colour.
  const boucle = {
    normalMap: tex("fabric/wool_boucle_nor_gl_512.webp", false, 1.5),
    arm: tex("fabric/wool_boucle_arm_512.webp", false, 1.5),
  };
  const linen = {
    normalMap: tex("cloth/rough_linen_nor_gl_512.webp", false, 7),
    arm: tex("cloth/rough_linen_arm_512.webp", false, 7),
  };
  const brushed = {
    normalMap: tex("brass/brushed_metal_normal.webp", false, 2),
    arm: tex("brass/brushed_metal_arm.webp", false, 2),
  };
  // Grain only (no albedo): the tufted colour map carries seams that must not tile.
  const grain = (repeat: number) => {
    const { normalMap, arm } = leather(repeat);
    return { normalMap, arm };
  };
  return {
    /** Quilted wall panels: vinyl-leather with tufted buttons, creases and stitched seams. */
    quilt: pbr(tufted, {
      color: 0xffffff,
      roughness: 1,
      sheen: 0.25,
      sheenRoughness: 0.6,
      sheenColor: 0xfff2dc,
    }),
    /** Floor, ceiling and wall pads, porthole surround: plain leather grain. */
    pad: (color: number) =>
      pbr(grain(3), { color, roughness: 1, sheen: 0.2, sheenColor: 0xfff2dc }),
    /** Buttons: leather-covered, slightly glossier from handling. */
    button: pbr(grain(1), { color: 0x8a6d55, roughness: 0.8 }),
    /** Real brass: metal, brushed and scuffed; its colour is the specular tint. */
    brass: pbr(
      { normalMap: brushed.normalMap, arm: brushed.arm },
      { color: 0xe3b25e, metalness: 1, roughness: 1 },
      0.6,
    ),
    /** Polished steel trim (porthole rims, hatch frame). */
    steel: pbr(
      { normalMap: brushed.normalMap, arm: brushed.arm },
      { color: 0xc9ccd2, metalness: 1, roughness: 0.7 },
      0.4,
    ),
    /** Rubberised grip sleeves on the rails. */
    grip: pbr(
      { normalMap: linen.normalMap, arm: linen.arm },
      { color: 0x2c3540, roughness: 1 },
      0.8,
    ),
    /** Wool bouclé for the sofa and the guest's seat. */
    fabric: (color: number) =>
      pbr(
        // Loops from the normal and roughness maps; the scan's albedo tiled into a check.
        { normalMap: boucle.normalMap, arm: boucle.arm },
        { color, roughness: 1, sheen: 0.6, sheenRoughness: 0.8, sheenColor: 0xffffff },
        1,
      ),
    /** Uniform wool-linen: the weave comes from the normal and roughness maps, the dye from `color`. */
    cloth: (color: number) =>
      pbr(
        { normalMap: linen.normalMap, arm: linen.arm },
        { color, roughness: 1, sheen: 0.15, sheenRoughness: 0.8, sheenColor: 0xd8b8a0 },
        1.6,
      ),
    /** Lamp bulbs: emissive in HDR (well above the bloom threshold); each has a real light. */
    bulb: new THREE.MeshStandardMaterial({
      color: 0xfff4e0,
      emissive: 0xffc98a,
      emissiveIntensity: 9,
      roughness: 0.3,
    }),
  };
}

export function surfaces() {
  const owner = assetsForBuild();
  let lib = libraries.get(owner);
  if (!lib) {
    lib = build();
    for (const value of Object.values(lib))
      if (value instanceof THREE.Material) owner.resources.retain(value);
    libraries.set(owner, lib);
  }
  return lib;
}
