import * as THREE from "three";

/**
 * The view through every porthole: stars and a huge, slowly turning planet with a warm limb.
 * Each window samples a different part of the same sky via `uOffset`, so portholes agree.
 */
export const skyUniforms = {
  uTime: { value: 0 },
  /** Eye offset from the room centre; each window shifts its view by it for parallax. */
  uParallax: { value: new THREE.Vector2() },
};

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
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }

  void main() {
    vec2 p = uOffset - uParallax * uDepth + (vUv - 0.5) * uScale;
    // Space: deep blue with sparse stars that drift very slowly.
    vec2 sp = p * 40.0 * max(1.0, uScale * 0.5) + vec2(uTime * 0.05, 0.0);
    float star = step(0.992, hash(floor(sp))) * (0.6 + 0.4 * sin(uTime * 1.5 + hash(floor(sp)) * 6.28));
    vec3 col = vec3(0.04, 0.05, 0.11) + star * vec3(1.0, 0.95, 0.85);

    // Planet: a vast disc below and to the right; bands rotate slowly around it.
    vec2 centre = vec2(1.4, -3.2);
    float r = 3.6;
    float d = length(p - centre);
    if (d < r) {
      vec2 q = (p - centre) / r;
      float z = sqrt(max(0.0, 1.0 - dot(q, q)));
      vec3 n = vec3(q, z);
      float lon = atan(q.x, z) + uTime * 0.012;
      float lat = q.y;
      float bands = fbm(vec2(lon * 3.0, lat * 9.0)) * 0.6 + 0.4 * sin(lat * 18.0 + fbm(vec2(lon * 2.0, lat * 4.0)) * 4.0);
      vec3 ocean = mix(vec3(0.16, 0.32, 0.45), vec3(0.3, 0.52, 0.58), bands);
      float land = smoothstep(0.55, 0.62, fbm(vec2(lon * 2.2 + 3.0, lat * 3.0)));
      vec3 surf = mix(ocean, vec3(0.78, 0.62, 0.42), land);
      float cloud = smoothstep(0.55, 0.8, fbm(vec2(lon * 4.0 - uTime * 0.01, lat * 6.0)));
      surf = mix(surf, vec3(0.96, 0.93, 0.88), cloud * 0.8);
      float light = clamp(dot(n, normalize(vec3(-0.6, 0.7, 0.5))), 0.0, 1.0);
      col = surf * (0.08 + 1.1 * light);
      col += vec3(1.0, 0.6, 0.35) * pow(1.0 - z, 3.0) * 0.8 * (0.3 + light);
    } else {
      // Atmosphere halo, warm on the sunward side.
      float halo = exp(-(d - r) * 7.0);
      col += vec3(0.95, 0.62, 0.4) * halo * 0.55;
    }
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

export function skyMaterial(offset: THREE.Vector2, scale: number, depth = 0.3) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...skyUniforms,
      uOffset: { value: offset },
      uScale: { value: scale },
      uDepth: { value: depth },
    },
    vertexShader: vertex,
    fragmentShader: fragment,
    toneMapped: false,
  });
}
