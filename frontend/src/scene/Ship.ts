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
  private elapsed = 0;

  constructor(private sites: Sites) {
    store.subscribe(() => this.sync());
    this.sync();
  }

  update(dt: number): void {
    this.elapsed += dt;
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

        const previous = mesh.position.clone();
        mesh.position.lerpVectors(HOME_POSITION, target, progress);
        mesh.position.y += Math.sin(progress * Math.PI) * 1.5; // small arc, purely cosmetic

        const heading = mesh.position.clone().sub(previous);
        if (heading.lengthSq() > 1e-6) {
          mesh.lookAt(mesh.position.clone().add(heading));
          mesh.rotateX(Math.PI / 2); // cone points +Y by default, travel direction is along its length
        }
      } else {
        const angle = (i / Math.max(state.ships.length, 1)) * Math.PI * 2 + this.elapsed * 0.15;
        mesh.position.set(Math.cos(angle) * IDLE_ORBIT_RADIUS, 0.5 + Math.sin(this.elapsed + i) * 0.2, Math.sin(angle) * IDLE_ORBIT_RADIUS);
        mesh.rotation.set(0, -angle, 0);
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
      const color = SHIP_COLORS[ship.ship_code] ?? 0xffffff;
      const geo = new THREE.ConeGeometry(0.35, 1, 6);
      const mat = new THREE.MeshStandardMaterial({
        color,
        flatShading: true,
        emissive: color,
        emissiveIntensity: 0.5,
        fog: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData = { shipId: ship.id };

      const engineGlow = new THREE.PointLight(color, 0.7, 4);
      engineGlow.position.set(0, -0.5, 0);
      mesh.add(engineGlow);

      this.group.add(mesh);
      this.meshes.set(ship.id, mesh);
    }
  }
}
