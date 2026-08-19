import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// Kenney "Space Kit" 2.0 models (CC0) — see public/models/KENNEY-LICENSE.txt.
// Only the three craft actually used are vendored, not the whole 153-model
// pack. Served from public/ (Vite copies it verbatim into dist/, nginx's
// `location /` try_files picks it up in production).
const MODEL_FILES: Record<string, string> = {
  scout: "models/craft_speederA.glb",
  freighter: "models/craft_cargoA.glb",
  heavy_cruiser: "models/craft_miner.glb",
};

// Longest-axis length each ship is normalized to, in scene units. The source
// models don't share a consistent scale, so rather than hardcoding per-model
// multipliers we measure each one's bounding box on load and scale to these.
const TARGET_LENGTH: Record<string, number> = {
  scout: 1.3,
  freighter: 1.8,
  heavy_cruiser: 2.3,
};

const cache = new Map<string, THREE.Object3D>();

function normalize(model: THREE.Object3D, shipCode: string): THREE.Object3D {
  // Wrap in a group so the caller can rotate/position the outer object
  // freely without fighting the centering/scaling applied to the inner one.
  const wrapper = new THREE.Group();

  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const longest = Math.max(size.x, size.y, size.z) || 1;
  const scale = (TARGET_LENGTH[shipCode] ?? 1.5) / longest;

  model.position.sub(center); // re-center on its own origin before scaling
  model.scale.setScalar(scale);
  model.position.multiplyScalar(scale);

  // These models are Y-up with the nose along -Z (their bounding boxes show Y
  // as the flattest axis and Z as the longest, and the tapered end sits on
  // -Z). But THREE.Object3D.lookAt() aims an object's *+Z* at the target —
  // it's Camera.lookAt() that uses -Z — so a -Z-nosed model aimed with
  // lookAt() flies tail-first. Yaw 180° here so the nose becomes +Z and
  // lookAt() points it the right way round.
  model.rotation.y = Math.PI;

  wrapper.add(model);
  return wrapper;
}

let loadOnce: Promise<void> | null = null;

// Resolves once every model has either loaded or failed. Never rejects: a
// missing/corrupt model must degrade to the procedural fallback in Ship.ts
// rather than taking the whole game down with it.
//
// Memoized because main.ts calls this from inside its bootstrap retry loop —
// without this, a backend that's down would re-download every model on each
// 4-second retry.
export function preloadShipModels(): Promise<void> {
  if (loadOnce) return loadOnce;

  const loader = new GLTFLoader();
  loadOnce = Promise.all(
    Object.entries(MODEL_FILES).map(async ([shipCode, url]) => {
      try {
        const gltf = await loader.loadAsync(url);
        cache.set(shipCode, normalize(gltf.scene, shipCode));
      } catch (err) {
        console.warn(`Failed to load ship model for ${shipCode}, falling back to primitive`, err);
      }
    }),
  ).then(() => undefined);

  return loadOnce;
}

// Returns a fresh clone per ship instance, or null when the model isn't
// available (still loading, or failed) so the caller can fall back.
export function createShipModel(shipCode: string): THREE.Object3D | null {
  const template = cache.get(shipCode);
  if (!template) return null;

  const clone = template.clone(true);
  // clone(true) shares materials by reference; give each ship its own so
  // per-ship tinting/emissive changes don't leak across the whole fleet.
  clone.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.material = (child.material as THREE.Material).clone();
      const mat = child.material as THREE.MeshStandardMaterial;
      // Match the rest of the scene: gameplay objects stay readable at any
      // zoom instead of fading into the fog.
      mat.fog = false;
      if (mat.emissive) mat.emissiveIntensity = 0.25;
    }
  });
  return clone;
}
