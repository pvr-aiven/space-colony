import * as THREE from "three";
import { store } from "../state/gameState";

const BUILDING_COLORS: Record<string, number> = {
  solar_array: 0xffd166,
  mining_rig: 0xef476f,
  ice_extractor: 0x4cc9f0,
  shipyard: 0x9b5de5,
  sensor_array: 0x80ffdb,
  refinery: 0xf3722c,
};

const SLOT_RADIUS = 6;

export class HomeBase {
  readonly group = new THREE.Group();
  private planet: THREE.Mesh;
  private buildingSlots = new THREE.Group();

  constructor() {
    const planetGeo = new THREE.IcosahedronGeometry(3, 1);
    const planetMat = new THREE.MeshStandardMaterial({ color: 0x2d6a4f, flatShading: true, roughness: 0.8 });
    this.planet = new THREE.Mesh(planetGeo, planetMat);
    this.group.add(this.planet);
    this.group.add(this.buildingSlots);

    store.subscribe(() => this.syncBuildings());
    this.syncBuildings();
  }

  update(dt: number): void {
    this.planet.rotation.y += dt * 0.05;
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

      const color = BUILDING_COLORS[building.building_code] ?? 0xaaaaaa;
      const size = 0.6 + building.level * 0.15;
      const geo = new THREE.BoxGeometry(size, size, size);
      const mat = new THREE.MeshStandardMaterial({
        color,
        flatShading: true,
        opacity: building.status === "constructing" ? 0.5 : 1,
        transparent: building.status === "constructing",
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, 0, z);
      mesh.userData = { buildingId: building.id };
      this.buildingSlots.add(mesh);
    });
  }
}
