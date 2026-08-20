import * as THREE from "three";
import { store } from "../state/gameState";
import { planetTexture } from "./textures";
import { buildBuildingModel, disposeBuildingModel } from "./BuildingModels";

// Just outside the planet's surface (radius 3) — close enough to read as
// "attached to the planet", far enough to clear the atmosphere shell
// (radius 3.4). The old radius of 6 happened to land almost exactly on
// top of two nearby site markers (asteroid_belt_alpha and ice_moon sit at
// distance ~5-5.7 from the origin), which is what caused buildings to
// visually clip through them.
const SLOT_RADIUS = 3.9;

/**
 * Planet rotation in rad/s. Exported because idle ships orbit at exactly this
 * rate to stay geostationary — a ship parked over the base should hold station
 * above the same spot, not drift past it.
 */
export const PLANET_SPIN_RATE = 0.05;

/**
 * The quantum gate is the one "building" rendered as a fixed installation out
 * in space rather than bolted to the planet surface.
 *
 * It has to be static: ships jump *from* the gate, so the jump effects anchor
 * to this point. While it rode the rotating surface slot ring, the effects
 * (which follow the ship) had no relation to where the gate actually was —
 * the ship charged and vanished off to one side of it.
 *
 * Well outside both the orbit ring (radius 8) and every local site (all within
 * ~12 units), in a direction none of them occupy.
 */
export const QUANTUM_GATE_POSITION = new THREE.Vector3(-15, 2.5, 0);
const QUANTUM_GATE_SCALE = 3.2;

function buildAtmosphere(): THREE.Mesh {
  // Slightly larger, translucent, additive-blended shell around the planet
  // — cheap stand-in for cloud cover without a texture/shader dependency.
  const geo = new THREE.IcosahedronGeometry(3.4, 1);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x9fe3c8,
    transparent: true,
    opacity: 0.12,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  return new THREE.Mesh(geo, mat);
}

export class HomeBase {
  readonly group = new THREE.Group();
  private planet: THREE.Mesh;
  private atmosphere: THREE.Mesh;
  private buildingSlots = new THREE.Group();
  /** Installations that must NOT inherit the planet's spin — currently the quantum gate. */
  private staticStructures = new THREE.Group();
  /** Signature of the building set currently rendered, to skip no-op rebuilds. */
  private builtKey = "";

  constructor() {
    const planetGeo = new THREE.SphereGeometry(3, 48, 32);
    const planetMat = new THREE.MeshStandardMaterial({
      map: planetTexture("#2d6a4f", "#1d4a35"),
      roughness: 0.8,
      emissive: 0x0a2a1f,
      emissiveIntensity: 0.25,
      fog: false,
    });
    this.planet = new THREE.Mesh(planetGeo, planetMat);
    this.atmosphere = buildAtmosphere();

    const glow = new THREE.PointLight(0x9fe3c8, 0.8, 12);
    this.planet.add(glow);

    // buildingSlots is a child of the planet mesh, not a sibling — buildings
    // are meant to be attached to the planet, so they should inherit its
    // spin exactly rather than drifting at their own independent rate.
    this.planet.add(this.buildingSlots);
    // staticStructures is a sibling of the planet, so it keeps a fixed
    // world position instead of being carried around by the spin.
    this.group.add(this.planet, this.atmosphere, this.staticStructures);

    store.subscribe(() => this.syncBuildings());
    this.syncBuildings();
  }

  update(dt: number): void {
    this.planet.rotation.y += dt * PLANET_SPIN_RATE;
    this.atmosphere.rotation.y -= dt * 0.02;
    this.atmosphere.rotation.x += dt * 0.008;
  }

  private syncBuildings(): void {
    const state = store.getState();
    if (!state) return;

    // Rebuilding was previously unconditional, so every 6-second poll threw
    // away and re-created every building model — and Group.clear() only
    // detaches children, so their geometries and materials leaked each time.
    // Only rebuild when something that affects the models actually changed.
    const key = state.buildings.map((b) => `${b.building_code}:${b.level}:${b.status}`).join("|");
    if (key === this.builtKey) return;
    this.builtKey = key;

    for (const child of [...this.buildingSlots.children]) disposeBuildingModel(child);
    this.buildingSlots.clear();
    for (const child of [...this.staticStructures.children]) disposeBuildingModel(child);
    this.staticStructures.clear();

    // The quantum gate is placed separately, so surface buildings share the
    // slot ring between themselves rather than leaving a gap where the gate
    // would have been.
    const surface = state.buildings.filter((b) => b.building_code !== "quantum_gate");
    const total = Math.max(surface.length, 1);

    surface.forEach((building, i) => {
      const angle = (i / total) * Math.PI * 2;
      const x = Math.cos(angle) * SLOT_RADIUS;
      const z = Math.sin(angle) * SLOT_RADIUS;

      const model = buildBuildingModel(building.building_code, building.level, building.status);
      model.position.set(x, 0, z);
      model.rotation.y = -angle; // face outward from the planet, away from center
      model.userData = { buildingId: building.id };
      this.buildingSlots.add(model);
    });

    const gate = state.buildings.find((b) => b.building_code === "quantum_gate");
    if (gate) {
      const model = buildBuildingModel(gate.building_code, gate.level, gate.status);
      model.scale.setScalar(QUANTUM_GATE_SCALE);
      model.position.copy(QUANTUM_GATE_POSITION);
      // Ring axis pointing away from the planet, so ships pass out through it
      // rather than across it.
      model.lookAt(QUANTUM_GATE_POSITION.clone().multiplyScalar(2));
      model.userData = { buildingId: gate.id };
      this.staticStructures.add(model);
    }
  }
}
