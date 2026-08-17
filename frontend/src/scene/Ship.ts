import * as THREE from "three";
import { store } from "../state/gameState";
import type { Sites } from "./Site";

const SHIP_COLORS: Record<string, number> = {
  scout: 0x80ffdb,
  freighter: 0xffd166,
  heavy_cruiser: 0xef476f,
};

const HOME_POSITION = new THREE.Vector3(0, 0, 0);
const IDLE_ORBIT_RADIUS = 8;

export class Ships {
  readonly group = new THREE.Group();
  private meshes = new Map<string, THREE.Mesh>();

  constructor(private sites: Sites) {
    store.subscribe(() => this.sync());
    this.sync();
  }

  update(): void {
    const state = store.getState();
    if (!state) return;

    state.ships.forEach((ship, i) => {
      const mesh = this.meshes.get(ship.id);
      if (!mesh) return;

      if (ship.status === "en_route" && ship.departed_at && ship.eta_at && ship.current_site_id) {
        const target = this.sites.getMarker(ship.current_site_id)?.position;
        if (!target) return;
        const departed = new Date(ship.departed_at).getTime();
        const eta = new Date(ship.eta_at).getTime();
        const progress = THREE.MathUtils.clamp((Date.now() - departed) / (eta - departed), 0, 1);
        mesh.position.lerpVectors(HOME_POSITION, target, progress);
        mesh.position.y += Math.sin(progress * Math.PI) * 1.5; // small arc, purely cosmetic
      } else {
        const angle = (i / Math.max(state.ships.length, 1)) * Math.PI * 2;
        mesh.position.set(Math.cos(angle) * IDLE_ORBIT_RADIUS, 0.5, Math.sin(angle) * IDLE_ORBIT_RADIUS);
      }
    });
  }

  private sync(): void {
    const state = store.getState();
    if (!state) return;

    const currentIds = new Set(state.ships.map((s) => s.id));
    for (const [id, mesh] of this.meshes) {
      if (!currentIds.has(id)) {
        this.group.remove(mesh);
        this.meshes.delete(id);
      }
    }

    for (const ship of state.ships) {
      if (this.meshes.has(ship.id)) continue;
      const geo = new THREE.ConeGeometry(0.35, 1, 6);
      const mat = new THREE.MeshStandardMaterial({
        color: SHIP_COLORS[ship.ship_code] ?? 0xffffff,
        flatShading: true,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData = { shipId: ship.id };
      this.group.add(mesh);
      this.meshes.set(ship.id, mesh);
    }
  }
}
