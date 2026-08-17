import * as THREE from "three";

export const BUILDING_COLORS: Record<string, number> = {
  solar_array: 0xffd166,
  mining_rig: 0xef476f,
  ice_extractor: 0x4cc9f0,
  shipyard: 0x9b5de5,
  sensor_array: 0x80ffdb,
  refinery: 0xf3722c,
};

function standardMaterial(color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, emissive: color, emissiveIntensity: 0.2, ...opts });
}

function solarArray(color: number, scale: number): THREE.Object3D {
  const group = new THREE.Group();
  const mat = standardMaterial(color, { emissiveIntensity: 0.35, side: THREE.DoubleSide });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(scale * 0.05, scale * 0.05, scale * 0.5, 5), standardMaterial(0x888899));
  pole.position.y = scale * 0.25;
  group.add(pole);
  for (const side of [-1, 1]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(scale * 0.55, scale * 0.04, scale * 0.9), mat);
    panel.position.set(side * scale * 0.32, scale * 0.5, 0);
    panel.rotation.z = side * 0.5;
    group.add(panel);
  }
  return group;
}

function miningRig(color: number, scale: number): THREE.Object3D {
  const group = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(scale * 0.35, scale * 0.4, scale * 0.3, 6), standardMaterial(0x666677));
  base.position.y = scale * 0.15;
  group.add(base);
  const drill = new THREE.Mesh(new THREE.ConeGeometry(scale * 0.18, scale * 0.7, 6), standardMaterial(color, { emissiveIntensity: 0.3 }));
  drill.position.y = scale * 0.65;
  group.add(drill);
  return group;
}

function iceExtractor(color: number, scale: number): THREE.Object3D {
  const group = new THREE.Group();
  const crystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(scale * 0.45, 0),
    standardMaterial(color, { emissiveIntensity: 0.45, transparent: true, opacity: 0.85, roughness: 0.2 }),
  );
  crystal.position.y = scale * 0.45;
  group.add(crystal);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(scale * 0.3, scale * 0.35, scale * 0.15, 6), standardMaterial(0x666677));
  group.add(base);
  return group;
}

function shipyardModel(color: number, scale: number): THREE.Object3D {
  const group = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(scale * 1.1, scale * 0.35, scale * 0.5), standardMaterial(color, { emissiveIntensity: 0.25 }));
  hull.position.y = scale * 0.2;
  group.add(hull);
  for (const side of [-1, 1]) {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(scale * 0.08, scale * 0.5, scale * 0.08), standardMaterial(0x888899));
    strut.position.set(side * scale * 0.5, scale * 0.45, scale * 0.2);
    group.add(strut);
  }
  return group;
}

function sensorArray(color: number, scale: number): THREE.Object3D {
  const group = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(scale * 0.1, scale * 0.14, scale * 0.5, 6), standardMaterial(0x666677));
  base.position.y = scale * 0.25;
  group.add(base);
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(scale * 0.4, scale * 0.4, scale * 0.08, 12, 1, false), standardMaterial(color, { emissiveIntensity: 0.4 }));
  dish.position.y = scale * 0.55;
  dish.rotation.x = -0.6;
  group.add(dish);
  return group;
}

function refineryModel(color: number, scale: number): THREE.Object3D {
  const group = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(scale * 0.8, scale * 0.5, scale * 0.6), standardMaterial(color, { emissiveIntensity: 0.25 }));
  hull.position.y = scale * 0.25;
  group.add(hull);
  for (const [x, z] of [
    [-0.35, 0.25],
    [0.35, 0.25],
    [0, -0.3],
  ]) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(scale * 0.12, scale * 0.12, scale * 0.4, 8), standardMaterial(0x888899));
    tank.position.set(x * scale, scale * 0.2, z * scale);
    group.add(tank);
  }
  return group;
}

const BUILDERS: Record<string, (color: number, scale: number) => THREE.Object3D> = {
  solar_array: solarArray,
  mining_rig: miningRig,
  ice_extractor: iceExtractor,
  shipyard: shipyardModel,
  sensor_array: sensorArray,
  refinery: refineryModel,
};

// Level-2/3 add small "expansion module" boxes bolted onto the base model —
// same visual language as the derelict greebles, cheap way to read progress
// at a glance without a completely different model per level.
function addLevelModules(target: THREE.Object3D, level: number, color: number, scale: number): void {
  const mat = standardMaterial(color, { emissiveIntensity: 0.3 });
  for (let i = 1; i < level; i++) {
    const size = scale * 0.18;
    const module = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), mat);
    const angle = i * 2.4;
    module.position.set(Math.cos(angle) * scale * 0.55, scale * 0.12, Math.sin(angle) * scale * 0.55);
    target.add(module);
  }
}

export function buildBuildingModel(code: string, level: number, status: "constructing" | "active"): THREE.Object3D {
  const color = BUILDING_COLORS[code] ?? 0xaaaaaa;
  const scale = 1.4 + level * 0.15;
  const builder = BUILDERS[code] ?? ((c: number, s: number) => new THREE.Mesh(new THREE.BoxGeometry(s * 0.6, s * 0.6, s * 0.6), standardMaterial(c)));
  const model = builder(color, scale);
  addLevelModules(model, level, color, scale);

  if (status === "constructing") {
    model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const mat = child.material as THREE.MeshStandardMaterial;
        mat.transparent = true;
        mat.opacity = 0.45;
      }
    });
  }

  return model;
}
