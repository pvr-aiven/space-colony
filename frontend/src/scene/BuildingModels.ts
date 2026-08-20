import * as THREE from "three";
import { derelictPanelTexture } from "./textures";

export const BUILDING_COLORS: Record<string, number> = {
  solar_array: 0xffd166,
  mining_rig: 0xef476f,
  ice_extractor: 0x4cc9f0,
  shipyard: 0x9b5de5,
  sensor_array: 0x80ffdb,
  refinery: 0xf3722c,
  quantum_gate: 0x9d7bff,
};

// One shared panel texture for every hull surface in the scene. Generating it
// per building would redo the canvas work for each one, and materials only ever
// read it.
let panelTexture: THREE.CanvasTexture | null = null;
function hullTexture(): THREE.CanvasTexture {
  if (!panelTexture) {
    panelTexture = derelictPanelTexture("#6a707d");
    panelTexture.repeat.set(2, 2);
  }
  return panelTexture;
}

// Materials are per-building rather than shared, because a "constructing"
// building mutates opacity — sharing would make one under construction turn
// every other building of that type translucent too.
function accent(color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  // fog: false — buildings are gameplay elements, they should stay visible
  // at any zoom level rather than fading into the background haze.
  return new THREE.MeshStandardMaterial({
    color,
    flatShading: true,
    emissive: color,
    emissiveIntensity: 0.25,
    fog: false,
    ...opts,
  });
}

function structural(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: 0x8b93a3, flatShading: true, roughness: 0.7, metalness: 0.35, fog: false });
}

function hull(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ map: hullTexture(), flatShading: true, roughness: 0.8, metalness: 0.25, fog: false });
}

function glow(color: number, intensity = 1.4): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, fog: false });
}

function put(parent: THREE.Object3D, mesh: THREE.Mesh, x: number, y: number, z: number): THREE.Mesh {
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

// A hex plinth every building sits on, so they read as one built family rather
// than unrelated props dropped on the surface.
function plinth(group: THREE.Object3D, s: number, radius = 0.42): void {
  put(group, new THREE.Mesh(new THREE.CylinderGeometry(radius * s, radius * s * 1.15, s * 0.1, 6), hull()), 0, s * 0.05, 0);
}

function solarArray(color: number, s: number): THREE.Object3D {
  const g = new THREE.Group();
  plinth(g, s, 0.3);

  put(g, new THREE.Mesh(new THREE.CylinderGeometry(s * 0.045, s * 0.055, s * 0.45, 6), structural()), 0, s * 0.32, 0);
  // Tracking motor the wings pivot on.
  put(g, new THREE.Mesh(new THREE.BoxGeometry(s * 0.16, s * 0.13, s * 0.16), structural()), 0, s * 0.58, 0);

  // Each wing is three separate panes with gaps, which reads as photovoltaic
  // cells at this size where a single flat box just reads as a slab.
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const pane = new THREE.Mesh(
        new THREE.BoxGeometry(s * 0.2, s * 0.025, s * 0.5),
        accent(color, { emissiveIntensity: 0.45, side: THREE.DoubleSide }),
      );
      pane.position.x = (i - 1) * s * 0.23;
      wing.add(pane);
      // Bright rim along the pane, catches the bloom.
      const rim = new THREE.Mesh(new THREE.BoxGeometry(s * 0.2, s * 0.012, s * 0.03), glow(color, 1.1));
      rim.position.set(pane.position.x, s * 0.02, s * 0.25);
      wing.add(rim);
    }
    wing.position.set(side * s * 0.42, s * 0.6, 0);
    wing.rotation.z = side * 0.42;
    g.add(wing);
  }
  return g;
}

function miningRig(color: number, s: number): THREE.Object3D {
  const g = new THREE.Group();
  plinth(g, s, 0.44);

  // Derrick: four legs leaning in to a crown block, the classic drill-tower
  // silhouette. Reads far better than the old cylinder + cone.
  const legSpread = s * 0.26;
  for (const [dx, dz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(s * 0.045, s * 0.62, s * 0.045), structural());
    leg.position.set(dx * legSpread, s * 0.42, dz * legSpread);
    leg.rotation.z = -dx * 0.22;
    leg.rotation.x = dz * 0.22;
    g.add(leg);
  }
  put(g, new THREE.Mesh(new THREE.BoxGeometry(s * 0.22, s * 0.09, s * 0.22), hull()), 0, s * 0.75, 0);

  // Drill shaft descending through the platform, hot bit at the tip.
  put(g, new THREE.Mesh(new THREE.CylinderGeometry(s * 0.035, s * 0.035, s * 0.7, 6), structural()), 0, s * 0.4, 0);
  const bit = put(g, new THREE.Mesh(new THREE.ConeGeometry(s * 0.09, s * 0.2, 6), glow(color, 1.6)), 0, s * 0.02, 0);
  bit.rotation.x = Math.PI;

  // Spoil heap beside it — the only irregular shape, so it reads as debris.
  const spoil = put(g, new THREE.Mesh(new THREE.IcosahedronGeometry(s * 0.13, 0), accent(0x6b5b4a, { emissiveIntensity: 0 })), s * 0.36, s * 0.11, s * 0.24);
  spoil.rotation.set(0.4, 0.8, 0.2);
  return g;
}

function iceExtractor(color: number, s: number): THREE.Object3D {
  const g = new THREE.Group();
  plinth(g, s, 0.36);

  // Heated collar the crystals grow out of.
  put(g, new THREE.Mesh(new THREE.CylinderGeometry(s * 0.2, s * 0.24, s * 0.12, 8), glow(color, 0.9)), 0, s * 0.16, 0);
  // Condenser coil around it.
  const coil = put(g, new THREE.Mesh(new THREE.TorusGeometry(s * 0.26, s * 0.028, 6, 14), structural()), 0, s * 0.24, 0);
  coil.rotation.x = Math.PI / 2;

  // A cluster of differently-sized crystals, not one lone octahedron.
  const crystalMat = accent(color, { emissiveIntensity: 0.55, transparent: true, opacity: 0.8, roughness: 0.15 });
  const shards: Array<[number, number, number, number]> = [
    [0, 0.52, 0, 0.3],
    [0.16, 0.4, 0.1, 0.18],
    [-0.14, 0.38, -0.08, 0.15],
  ];
  for (const [x, y, z, r] of shards) {
    const shard = put(g, new THREE.Mesh(new THREE.OctahedronGeometry(s * r, 0), crystalMat), x * s, y * s, z * s);
    shard.rotation.set(Math.random() * 0.5, Math.random() * Math.PI, Math.random() * 0.5);
    shard.scale.y = 1.5;
  }

  put(g, new THREE.Mesh(new THREE.CylinderGeometry(s * 0.1, s * 0.1, s * 0.22, 8), hull()), s * 0.32, s * 0.21, -s * 0.2);
  return g;
}

function shipyardModel(color: number, s: number): THREE.Object3D {
  const g = new THREE.Group();

  // Landing pad with a lit rim, instead of a floating slab.
  put(g, new THREE.Mesh(new THREE.CylinderGeometry(s * 0.52, s * 0.55, s * 0.07, 8), hull()), 0, s * 0.035, 0);
  const rim = put(g, new THREE.Mesh(new THREE.TorusGeometry(s * 0.52, s * 0.022, 6, 16), glow(color, 1.2)), 0, s * 0.08, 0);
  rim.rotation.x = Math.PI / 2;

  // Open gantry: two frames plus cross beams, so you can see through it.
  for (const side of [-1, 1]) {
    for (const z of [-1, 1]) {
      put(g, new THREE.Mesh(new THREE.BoxGeometry(s * 0.05, s * 0.62, s * 0.05), structural()), side * s * 0.4, s * 0.37, z * s * 0.26);
    }
    const beam = put(g, new THREE.Mesh(new THREE.BoxGeometry(s * 0.05, s * 0.05, s * 0.57), structural()), side * s * 0.4, s * 0.67, 0);
    void beam;
  }
  put(g, new THREE.Mesh(new THREE.BoxGeometry(s * 0.85, s * 0.05, s * 0.05), structural()), 0, s * 0.67, -s * 0.26);
  put(g, new THREE.Mesh(new THREE.BoxGeometry(s * 0.85, s * 0.05, s * 0.05), structural()), 0, s * 0.67, s * 0.26);

  // Crane arm reaching over the pad.
  const arm = put(g, new THREE.Mesh(new THREE.BoxGeometry(s * 0.5, s * 0.045, s * 0.045), structural()), s * 0.16, s * 0.72, 0);
  arm.rotation.z = -0.25;
  put(g, new THREE.Mesh(new THREE.BoxGeometry(s * 0.03, s * 0.14, s * 0.03), structural()), s * 0.38, s * 0.6, 0);

  // A hull under construction sitting on the pad — the thing that makes it
  // read as a shipyard rather than a generic platform.
  const wip = put(g, new THREE.Mesh(new THREE.BoxGeometry(s * 0.36, s * 0.12, s * 0.16), accent(color, { emissiveIntensity: 0.3 })), 0, s * 0.15, 0);
  wip.rotation.y = 0.2;
  return g;
}

// Parabolic profile revolved into a real dish. A flat cylinder never reads as
// a receiver at this size.
function dishGeometry(s: number): THREE.LatheGeometry {
  const points: THREE.Vector2[] = [];
  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    const r = (i / steps) * s * 0.38;
    points.push(new THREE.Vector2(r, (r * r) / (s * 0.55)));
  }
  return new THREE.LatheGeometry(points, 16);
}

function sensorArray(color: number, s: number): THREE.Object3D {
  const g = new THREE.Group();
  plinth(g, s, 0.3);

  // Tripod mount.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = new THREE.Mesh(new THREE.BoxGeometry(s * 0.04, s * 0.3, s * 0.04), structural());
    leg.position.set(Math.cos(a) * s * 0.16, s * 0.2, Math.sin(a) * s * 0.16);
    leg.rotation.z = -Math.cos(a) * 0.35;
    leg.rotation.x = Math.sin(a) * 0.35;
    g.add(leg);
  }
  put(g, new THREE.Mesh(new THREE.CylinderGeometry(s * 0.09, s * 0.11, s * 0.14, 8), hull()), 0, s * 0.4, 0);

  // Yoke arms holding the dish, so it's clearly mounted and tiltable.
  const head = new THREE.Group();
  for (const side of [-1, 1]) {
    put(head, new THREE.Mesh(new THREE.BoxGeometry(s * 0.03, s * 0.18, s * 0.03), structural()), side * s * 0.2, s * 0.06, 0);
  }

  const dish = new THREE.Mesh(dishGeometry(s), accent(color, { emissiveIntensity: 0.3, side: THREE.DoubleSide }));
  dish.position.y = s * 0.14;
  head.add(dish);

  const rim = new THREE.Mesh(new THREE.TorusGeometry(s * 0.38, s * 0.018, 6, 18), glow(color, 1.1));
  rim.position.y = s * 0.14;
  rim.rotation.x = Math.PI / 2;
  head.add(rim);

  // Feed horn at the focus, pointing back into the dish.
  const horn = new THREE.Mesh(new THREE.ConeGeometry(s * 0.05, s * 0.14, 8), structural());
  horn.position.y = s * 0.32;
  horn.rotation.x = Math.PI;
  head.add(horn);
  for (const side of [-1, 1]) {
    const stay = new THREE.Mesh(new THREE.BoxGeometry(s * 0.014, s * 0.22, s * 0.014), structural());
    stay.position.set(side * s * 0.12, s * 0.24, 0);
    stay.rotation.z = side * 0.5;
    head.add(stay);
  }

  head.position.y = s * 0.47;
  head.rotation.x = -0.5; // tilted at the sky
  g.add(head);
  return g;
}

function refineryModel(color: number, s: number): THREE.Object3D {
  const g = new THREE.Group();
  put(g, new THREE.Mesh(new THREE.BoxGeometry(s * 0.8, s * 0.09, s * 0.6), hull()), 0, s * 0.045, 0);

  // Distillation columns of differing heights, each banded with rings.
  const columns: Array<[number, number, number]> = [
    [-0.24, 0.62, -0.12],
    [0.02, 0.46, 0.16],
    [0.26, 0.54, -0.14],
  ];
  for (const [x, h, z] of columns) {
    put(g, new THREE.Mesh(new THREE.CylinderGeometry(s * 0.085, s * 0.085, s * h, 10), structural()), x * s, s * (h / 2 + 0.09), z * s);
    for (let b = 0; b < 3; b++) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(s * 0.088, s * 0.012, 5, 12), accent(color, { emissiveIntensity: 0.5 }));
      band.position.set(x * s, s * (0.16 + b * (h / 3.2)), z * s);
      band.rotation.x = Math.PI / 2;
      g.add(band);
    }
  }

  // Pipework tying the column tops together.
  const pipe = put(g, new THREE.Mesh(new THREE.CylinderGeometry(s * 0.022, s * 0.022, s * 0.52, 6), structural()), s * 0.01, s * 0.6, 0);
  pipe.rotation.z = Math.PI / 2;
  pipe.rotation.y = 0.4;

  // Spherical storage tanks.
  for (const [x, z] of [
    [-0.3, 0.2],
    [0.3, 0.22],
  ]) {
    put(g, new THREE.Mesh(new THREE.SphereGeometry(s * 0.11, 12, 8), hull()), x * s, s * 0.2, z * s);
  }

  // Flare stack with a lit tip — instant "this is a refinery" read.
  put(g, new THREE.Mesh(new THREE.CylinderGeometry(s * 0.03, s * 0.035, s * 0.7, 6), structural()), -s * 0.36, s * 0.44, s * 0.22);
  const flame = put(g, new THREE.Mesh(new THREE.ConeGeometry(s * 0.055, s * 0.16, 6), glow(0xffb347, 2.2)), -s * 0.36, s * 0.85, s * 0.22);
  void flame;
  return g;
}

// A free-floating ring: no plinth or pylons, since it hangs in open space
// rather than standing on anything.
//
// Everything is centred on the group origin, which matters beyond looks — the
// jump effects anchor to the gate's position, so the ring's centre has to *be*
// that position. The earlier design raised the ring above a base, leaving the
// effect firing a few units below the hole the ship flies through.
function quantumGate(color: number, s: number, level: number): THREE.Object3D {
  const g = new THREE.Group();
  const R = s * 0.34;

  put(g, new THREE.Mesh(new THREE.TorusGeometry(R, s * 0.06, 8, 24), accent(color, { emissiveIntensity: 0.6 })), 0, 0, 0);

  // Membrane across the ring: additive so it glows through rather than looking
  // like a solid disc, and feeds the bloom pass. A higher-level gate holds a
  // denser field.
  put(
    g,
    new THREE.Mesh(
      new THREE.CircleGeometry(R * 0.88, 24),
      new THREE.MeshBasicMaterial({
        color: 0xd8c8ff,
        transparent: true,
        opacity: 0.22 + level * 0.1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      }),
    ),
    0,
    0,
    0,
  );

  // Emitter nodes around the rim — more of them as the gate is upgraded.
  const nodes = 6 + (level - 1) * 4;
  for (let i = 0; i < nodes; i++) {
    const a = (i / nodes) * Math.PI * 2;
    put(g, new THREE.Mesh(new THREE.SphereGeometry(s * 0.045, 8, 6), glow(color, 1.8)), Math.cos(a) * R, Math.sin(a) * R, 0);
  }

  // Level 2+ adds an outer stabiliser ring on radial struts, so an upgraded
  // gate is obviously a bigger installation and not just a brighter one.
  if (level >= 2) {
    const outerR = R * 1.4;
    put(g, new THREE.Mesh(new THREE.TorusGeometry(outerR, s * 0.025, 6, 28), structural()), 0, 0, 0);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const strut = new THREE.Mesh(new THREE.BoxGeometry(s * 0.03, outerR - R, s * 0.03), structural());
      const mid = (R + outerR) / 2;
      strut.position.set(Math.cos(a) * mid, Math.sin(a) * mid, 0);
      strut.rotation.z = a - Math.PI / 2;
      g.add(strut);
    }
  }
  return g;
}

const BUILDERS: Record<string, (color: number, scale: number, level: number) => THREE.Object3D> = {
  solar_array: solarArray,
  mining_rig: miningRig,
  ice_extractor: iceExtractor,
  shipyard: shipyardModel,
  sensor_array: sensorArray,
  refinery: refineryModel,
  quantum_gate: quantumGate,
};

// Level-2/3 add small "expansion module" boxes bolted onto the base model —
// same visual language as the derelict greebles, cheap way to read progress
// at a glance without a completely different model per level.
function addLevelModules(target: THREE.Object3D, level: number, color: number, scale: number): void {
  for (let i = 1; i < level; i++) {
    const size = scale * 0.15;
    const module = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), accent(color, { emissiveIntensity: 0.35 }));
    const angle = i * 2.4;
    module.position.set(Math.cos(angle) * scale * 0.5, scale * 0.16, Math.sin(angle) * scale * 0.5);
    module.rotation.y = angle;
    target.add(module);
  }
}

export function buildBuildingModel(code: string, level: number, status: "constructing" | "active"): THREE.Object3D {
  const color = BUILDING_COLORS[code] ?? 0xaaaaaa;
  const scale = 1.4 + level * 0.15;
  const builder =
    BUILDERS[code] ??
    ((c: number, sc: number) => new THREE.Mesh(new THREE.BoxGeometry(sc * 0.5, sc * 0.5, sc * 0.5), accent(c)));
  const model = builder(color, scale, level);
  // The gate expresses its level in its own geometry (extra emitter nodes, an
  // outer stabiliser ring); the generic surface-mounted modules would just
  // float around a structure that has no ground to bolt them to.
  if (code !== "quantum_gate") addLevelModules(model, level, color, scale);

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

// Geometries and materials are created per building, so whoever replaces a
// model has to release the old one — THREE.Group.clear() only detaches
// children, it doesn't free their GPU resources.
export function disposeBuildingModel(model: THREE.Object3D): void {
  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    const material = child.material;
    // The shared hull texture is deliberately not disposed — it outlives any
    // individual building.
    if (Array.isArray(material)) material.forEach((m) => m.dispose());
    else material.dispose();
  });
}
