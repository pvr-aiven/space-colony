import * as THREE from "three";
import { store } from "../state/gameState";
import { asteroidTexture, derelictPanelTexture, makeCraggyGeometry, moonTexture } from "./textures";

const KIND_COLORS: Record<string, number> = {
  asteroid: 0xa0a0a0,
  planet: 0x4cc9f0,
  derelict: 0xf72585,
};

const SCALE = 0.4;

interface Marker {
  object: THREE.Object3D;
  pulsingMaterials: THREE.MeshStandardMaterial[];
  phase: number;
  pulseRange: [number, number];
}

interface BuiltSite {
  object: THREE.Object3D;
  pulsingMaterials: THREE.MeshStandardMaterial[];
}

function buildNaturalBody(kind: string, difficulty: number, color: number): BuiltSite {
  const scale = 0.5 + difficulty * 0.15;

  if (kind === "planet") {
    const geo = new THREE.SphereGeometry(scale, 24, 16);
    const material = new THREE.MeshStandardMaterial({
      map: moonTexture("#8a94a6"),
      emissive: color,
      emissiveIntensity: 0.08,
      roughness: 0.9,
    });
    return { object: new THREE.Mesh(geo, material), pulsingMaterials: [material] };
  }

  const geo = makeCraggyGeometry(scale * 0.8, 1, 0.5);
  const material = new THREE.MeshStandardMaterial({
    map: asteroidTexture("#7a6a5a"),
    flatShading: true,
    emissive: color,
    emissiveIntensity: 0.06,
    roughness: 1,
  });
  return { object: new THREE.Mesh(geo, material), pulsingMaterials: [material] };
}

// A derelict is an artificial structure, not a natural body — built from a
// panelled hull, greeble modules bolted on at random, and a beacon
// strip/antenna tip that's the only part that actually pulses.
function buildDerelict(difficulty: number, color: number): BuiltSite {
  const scale = 0.5 + difficulty * 0.15;
  const group = new THREE.Group();

  const hullMaterial = new THREE.MeshStandardMaterial({
    map: derelictPanelTexture("#5a5f6b"),
    flatShading: true,
    roughness: 0.85,
    metalness: 0.3,
  });

  const hull = new THREE.Mesh(new THREE.BoxGeometry(scale * 1.6, scale * 0.6, scale * 0.6), hullMaterial);
  hull.rotation.z = 0.15;
  group.add(hull);

  for (let i = 0; i < 4; i++) {
    const w = scale * (0.15 + Math.random() * 0.25);
    const greeble = new THREE.Mesh(new THREE.BoxGeometry(w, w, w), hullMaterial);
    greeble.position.set(
      (Math.random() - 0.5) * scale * 1.4,
      (Math.random() - 0.5) * scale * 0.5,
      (Math.random() - 0.5) * scale * 0.5,
    );
    greeble.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    group.add(greeble);
  }

  const beaconMaterial = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.4 });
  const beaconStrip = new THREE.Mesh(new THREE.BoxGeometry(scale * 1.1, scale * 0.08, scale * 0.08), beaconMaterial);
  beaconStrip.position.y = scale * 0.38;
  group.add(beaconStrip);

  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(scale * 0.025, scale * 0.025, scale * 0.7, 4), hullMaterial);
  antenna.position.set(scale * 0.4, scale * 0.55, 0);
  antenna.rotation.z = 0.35;
  group.add(antenna);

  const antennaTip = new THREE.Mesh(new THREE.SphereGeometry(scale * 0.07, 6, 6), beaconMaterial);
  antennaTip.position.set(scale * 0.62, scale * 0.85, 0);
  group.add(antennaTip);

  return { object: group, pulsingMaterials: [beaconMaterial] };
}

function buildSite(kind: string, difficulty: number, color: number): BuiltSite {
  return kind === "derelict" ? buildDerelict(difficulty, color) : buildNaturalBody(kind, difficulty, color);
}

export class Sites {
  readonly group = new THREE.Group();
  private markers = new Map<string, Marker>();
  private elapsed = 0;

  constructor() {
    store.subscribe(() => this.sync());
    this.sync();
  }

  update(dt: number): void {
    this.elapsed += dt;
    this.markers.forEach(({ object, pulsingMaterials, phase, pulseRange }) => {
      object.rotation.y += dt * 0.4;
      const [min, max] = pulseRange;
      const mid = (min + max) / 2;
      const amp = (max - min) / 2;
      const intensity = mid + Math.sin(this.elapsed * 1.5 + phase) * amp;
      pulsingMaterials.forEach((m) => (m.emissiveIntensity = intensity));
    });
  }

  getMarker(siteId: string): THREE.Object3D | undefined {
    return this.markers.get(siteId)?.object;
  }

  private sync(): void {
    const catalog = store.getCatalog();
    if (!catalog || this.markers.size > 0) return; // sites are a fixed catalog, build once

    catalog.sites.forEach((site, i) => {
      const color = KIND_COLORS[site.kind] ?? 0xffffff;
      const { object, pulsingMaterials } = buildSite(site.kind, site.difficulty, color);
      object.position.set(site.position.x * SCALE, site.position.y * SCALE, site.position.z * SCALE);
      object.userData = { siteId: site.id, label: site.display_name };

      const beacon = new THREE.PointLight(color, site.kind === "derelict" ? 0.6 : 0.3, 5);
      object.add(beacon);

      this.group.add(object);
      const pulseRange: [number, number] = site.kind === "derelict" ? [0.1, 0.7] : [0.02, 0.14];
      this.markers.set(site.id, { object, pulsingMaterials, phase: i * 1.3, pulseRange });
    });
  }
}
