import * as THREE from "three";
import { store } from "../state/gameState";
import { isSiteRevealed, isSiteTravelable } from "../state/siteAccess";
import {
  asteroidTexture,
  derelictPanelTexture,
  gasGiantTexture,
  makeCraggyGeometry,
  moonTexture,
  planetTexture,
} from "./textures";

const KIND_COLORS: Record<string, number> = {
  asteroid: 0xa0a0a0,
  planet: 0x4cc9f0,
  derelict: 0xf72585,
  deep_planet: 0xb388ff,
};

interface Marker {
  object: THREE.Object3D;
  pulsingMaterials: THREE.MeshStandardMaterial[];
  phase: number;
  pulseRange: [number, number];
  siteCode: string;
}

interface BuiltSite {
  object: THREE.Object3D;
  pulsingMaterials: THREE.MeshStandardMaterial[];
}

// Deep-space sites are full planets, not rocks — rendered much larger than the
// local sites so they read as distant worlds rather than nearby debris, with a
// faint halo to suggest atmosphere at range.
function buildDeepPlanet(difficulty: number, color: number, siteCode: string): BuiltSite {
  const group = new THREE.Group();
  const radius = 2.6 + difficulty * 0.35;

  // Vary the surface by site so the three don't look like the same world.
  const texture =
    siteCode === "outer_ice_belt"
      ? moonTexture("#a8c4d8")
      : siteCode === "crimson_expanse"
        ? planetTexture("#8c2f2f", "#5a1b1b")
        : gasGiantTexture("#c9a86a", "#7d5a2e");

  const material = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.85,
    emissive: color,
    emissiveIntensity: 0.12,
    fog: false,
  });
  group.add(new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 24), material));

  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.12, 24, 16),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.14,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    }),
  );
  group.add(halo);

  return { object: group, pulsingMaterials: [material] };
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
      fog: false,
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
    fog: false,
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
    fog: false,
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

  const beaconMaterial = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.4, fog: false });
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

function buildSite(kind: string, difficulty: number, color: number, siteCode: string): BuiltSite {
  if (kind === "deep_planet") return buildDeepPlanet(difficulty, color, siteCode);
  if (kind === "derelict") return buildDerelict(difficulty, color);
  return buildNaturalBody(kind, difficulty, color);
}

export class Sites {
  readonly group = new THREE.Group();
  private markers = new Map<string, Marker>();
  private elapsed = 0;

  constructor() {
    store.subscribe(() => {
      this.build();
      this.applyVisibility();
    });
    this.build();
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

  // Every site gets a mesh up front; reveal state only toggles visibility.
  // Rebuilding on each state change instead would churn geometry every poll,
  // and reveal can flip at any time (the moment a sensor array finishes).
  private build(): void {
    const catalog = store.getCatalog();
    if (!catalog || this.markers.size > 0) return;

    catalog.sites.forEach((site, i) => {
      const color = KIND_COLORS[site.kind] ?? 0xffffff;
      const { object, pulsingMaterials } = buildSite(site.kind, site.difficulty, color, site.code);
      object.position.set(site.position.x, site.position.y, site.position.z);
      object.userData = { siteId: site.id, label: site.display_name };

      const beacon = new THREE.PointLight(color, site.kind === "derelict" ? 0.6 : 0.3, 5);
      object.add(beacon);

      this.group.add(object);
      const pulseRange: [number, number] = site.kind === "derelict" ? [0.1, 0.7] : [0.02, 0.14];
      this.markers.set(site.id, { object, pulsingMaterials, phase: i * 1.3, pulseRange, siteCode: site.code });
    });

    this.applyVisibility();
  }

  private applyVisibility(): void {
    const catalog = store.getCatalog();
    const state = store.getState();
    if (!catalog) return;

    for (const site of catalog.sites) {
      const marker = this.markers.get(site.id);
      if (!marker) continue;
      const revealed = isSiteRevealed(site, state);
      marker.object.visible = revealed;
      // Unreachable-but-visible sites glow a little less, so "I can see it but
      // can't go yet" reads differently from a site that's ready to dispatch to.
      const reachable = isSiteTravelable(site, state);
      marker.pulseRange = reachable ? (site.kind === "derelict" ? [0.1, 0.7] : [0.02, 0.14]) : [0.01, 0.05];
    }
  }
}
