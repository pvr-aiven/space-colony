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
    this.group.add(this.planet, this.atmosphere);

    store.subscribe(() => this.syncBuildings());
    this.syncBuildings();
  }

  update(dt: number): void {
    this.planet.rotation.y += dt * 0.05;
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

    const buildingsWithSlot = state.buildings;
    const total = Math.max(buildingsWithSlot.length, 1);

    buildingsWithSlot.forEach((building, i) => {
      const angle = (i / total) * Math.PI * 2;
      const x = Math.cos(angle) * SLOT_RADIUS;
      const z = Math.sin(angle) * SLOT_RADIUS;

      const model = buildBuildingModel(building.building_code, building.level, building.status);
      model.position.set(x, 0, z);
      model.rotation.y = -angle; // face outward from the planet, away from center
      model.userData = { buildingId: building.id };
      this.buildingSlots.add(model);
    });
  }
}
