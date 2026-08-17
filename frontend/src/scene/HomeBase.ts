import * as THREE from "three";
import { store } from "../state/gameState";
import { planetTexture } from "./textures";
import { buildBuildingModel } from "./BuildingModels";

const SLOT_RADIUS = 6;

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
  });
  return new THREE.Mesh(geo, mat);
}

export class HomeBase {
  readonly group = new THREE.Group();
  private planet: THREE.Mesh;
  private atmosphere: THREE.Mesh;
  private buildingSlots = new THREE.Group();

  constructor() {
    const planetGeo = new THREE.SphereGeometry(3, 48, 32);
    const planetMat = new THREE.MeshStandardMaterial({
      map: planetTexture("#2d6a4f", "#1d4a35"),
      roughness: 0.8,
      emissive: 0x0a2a1f,
      emissiveIntensity: 0.25,
    });
    this.planet = new THREE.Mesh(planetGeo, planetMat);
    this.atmosphere = buildAtmosphere();

    const glow = new THREE.PointLight(0x9fe3c8, 0.8, 12);
    this.planet.add(glow);

    this.group.add(this.planet, this.atmosphere, this.buildingSlots);

    store.subscribe(() => this.syncBuildings());
    this.syncBuildings();
  }

  update(dt: number): void {
    this.planet.rotation.y += dt * 0.05;
    this.atmosphere.rotation.y -= dt * 0.02;
    this.atmosphere.rotation.x += dt * 0.008;
    this.buildingSlots.rotation.y += dt * 0.03;
  }

  private syncBuildings(): void {
    const state = store.getState();
    if (!state) return;

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
