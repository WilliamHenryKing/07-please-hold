import * as THREE from "three";
import { assetsForBuild, type SceneAssets, tex } from "./assets";

/**
 * The view through every porthole: a star field and Earth, from NASA's Blue Marble (day),
 * cloud cover and Black Marble (night lights), lit by one sun, with an atmosphere rim.
 * Every window samples the same sky at its own offset, so the portholes agree with each other.
 */
export const skyUniforms = {
  uTime: { value: 0 },
  /** Eye offset from the room centre; each window shifts its view by it for parallax. */
  uParallax: { value: new THREE.Vector2() },
};

type EarthTextures = { day: THREE.Texture; night: THREE.Texture; clouds: THREE.Texture };
const skies = new WeakMap<SceneAssets, EarthTextures>();
function earthTextures() {
  const owner = assetsForBuild();
  let earth = skies.get(owner);
  if (!earth) {
    earth = {
      day: tex("planet/earth_day_2k.webp", true),
      night: tex("planet/earth_night_2k.webp", true, 1, true, true),
      clouds: tex("planet/earth_clouds_2k.webp", false),
    };
    for (const t of Object.values(earth)) {
      t.wrapT = THREE.ClampToEdgeWrapping;
      t.anisotropy = 4;
    }
    skies.set(owner, earth);
  }
  return earth;
}

const vertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragment = /* glsl */ `
  uniform float uTime;
  uniform vec2 uOffset;
  uniform vec2 uParallax;
  uniform float uDepth;
  uniform float uScale;
  uniform sampler2D uDay;
  uniform sampler2D uNight;
  uniform sampler2D uClouds;
  varying vec2 vUv;

  const float PI = 3.14159265;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  // Round, soft stars: one candidate per cell at a random offset, most cells empty.
  vec3 stars(vec2 p) {
    vec2 cell = floor(p);
    float h = hash(cell);
    if (h < 0.965) return vec3(0.0);
    vec2 centre = cell + vec2(hash(cell + 3.1), hash(cell + 7.7));
    float d = length(p - centre);
    float size = 0.06 + 0.1 * hash(cell + 1.3);
    float glow = smoothstep(size, 0.0, d);
    float tw = 0.75 + 0.25 * sin(uTime * 1.3 + h * 40.0);
    vec3 tint = mix(vec3(1.0, 0.86, 0.72), vec3(0.78, 0.86, 1.0), hash(cell + 9.2));
    return tint * glow * tw * (0.6 + 2.4 * pow(hash(cell + 5.5), 4.0));
  }

  mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
  mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }

  void main() {
    vec2 p = uOffset - uParallax * uDepth + (vUv - 0.5) * uScale;
    vec3 col = vec3(0.0015, 0.002, 0.005) + stars(p * 38.0 * max(1.0, uScale * 0.5)) * 1.4;

    // Earth sits below every porthole, close enough that its limb visibly curves.
    vec2 centre = vec2(0.6, -2.6);
    float r = 2.2;
    vec2 q = (p - centre) / r;
    float d2 = dot(q, q);
    vec3 L = normalize(vec3(-0.55, 0.62, 0.56));
    if (d2 < 1.0) {
      vec3 n = vec3(q, sqrt(1.0 - d2));
      // Axial tilt, then a slow spin (one turn every ~26 minutes of play).
      vec3 w = rotY(uTime * 0.004 + 2.2) * rotX(0.41) * n;
      vec2 uv = vec2(atan(w.x, w.z) / (2.0 * PI) + 0.5, asin(clamp(w.y, -1.0, 1.0)) / PI + 0.5);
      vec3 day = texture2D(uDay, uv).rgb;
      vec3 night = texture2D(uNight, uv).rgb;
      float cloud = texture2D(uClouds, uv + vec2(uTime * 0.0006, 0.0)).r;
      float ndl = dot(n, L);
      float lit = smoothstep(-0.08, 0.25, ndl);
      // Oceans: blue-dominant, darker than land; they get a sun glint.
      float ocean = smoothstep(0.02, 0.12, day.b - max(day.r, day.g) * 0.9);
      vec3 V = vec3(0.0, 0.0, 1.0);
      float glint = pow(max(dot(reflect(-L, n), V), 0.0), 60.0) * ocean * lit;
      vec3 surface = mix(day, vec3(0.96), cloud * 0.85);
      vec3 sunlit = surface * max(ndl, 0.0) * 3.2 + glint * vec3(4.0, 3.4, 2.6);
      vec3 cities = night * (1.0 - lit) * (1.0 - cloud * 0.7) * vec3(1.6, 1.1, 0.6) * 0.9;
      col = sunlit + cities;
      // Atmosphere: Rayleigh-blue limb, warmed where the terminator crosses it.
      float limb = pow(1.0 - n.z, 2.6);
      vec3 sky = mix(vec3(1.0, 0.55, 0.3), vec3(0.35, 0.6, 1.0), smoothstep(-0.1, 0.35, ndl));
      col += sky * limb * (0.25 + 1.6 * max(ndl + 0.15, 0.0));
      col *= 1.0 - 0.35 * smoothstep(0.96, 1.0, sqrt(d2)) * (1.0 - lit);
    } else {
      // Outer glow of the atmosphere above the limb, brightest toward the sun.
      float h = sqrt(d2) - 1.0;
      vec2 toward = normalize(q);
      float sunward = max(dot(toward, normalize(L.xy)), 0.0);
      float glow = exp(-h * 38.0) * (0.25 + 1.3 * sunward);
      col += vec3(0.32, 0.56, 1.0) * glow;
    }
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function skyMaterial(offset: THREE.Vector2, scale: number, depth = 0.3) {
  const e = earthTextures();
  return new THREE.ShaderMaterial({
    uniforms: {
      ...skyUniforms,
      uOffset: { value: offset },
      uScale: { value: scale },
      uDepth: { value: depth },
      uDay: { value: e.day },
      uNight: { value: e.night },
      uClouds: { value: e.clouds },
    },
    vertexShader: vertex,
    fragmentShader: fragment,
  });
}
