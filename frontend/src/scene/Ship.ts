import * as THREE from "three";
import { store } from "../state/gameState";
import { createShipModel } from "./ShipModels";
import type { Sites } from "./Site";

const SHIP_COLORS: Record<string, number> = {
  scout: 0x80ffdb,
  freighter: 0xffd166,
  heavy_cruiser: 0xef476f,
};

const HOME_POSITION = new THREE.Vector3(0, 0, 0);
const IDLE_ORBIT_RADIUS = 8;

// Used when the GLB model for a ship type isn't available (still loading, or
// failed to load) — keeps the game playable rather than showing nothing.
function buildFallbackShip(color: number): THREE.Object3D {
  const geo = new THREE.ConeGeometry(0.35, 1, 6);
  // Cones point +Y by default; tip it to point -Z so it matches the imported
  // models' orientation and both can be aimed with a plain lookAt().
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({
    color,
    flatShading: true,
    emissive: color,
    emissiveIntensity: 0.5,
    fog: false,
  });
  return new THREE.Mesh(geo, mat);
}

export class Ships {
  readonly group = new THREE.Group();
  private objects = new Map<string, THREE.Object3D>();
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
      const object = this.objects.get(ship.id);
      if (!object) return;

      if (ship.status === "en_route" && ship.departed_at && ship.eta_at && ship.current_site_id) {
        const target = this.sites.getMarker(ship.current_site_id)?.position;
        if (!target) return;
        const departed = new Date(ship.departed_at).getTime();
        const eta = new Date(ship.eta_at).getTime();
        const progress = THREE.MathUtils.clamp((Date.now() - departed) / (eta - departed), 0, 1);

        const previous = object.position.clone();
        object.position.lerpVectors(HOME_POSITION, target, progress);
        object.position.y += Math.sin(progress * Math.PI) * 1.5; // small arc, purely cosmetic

        const heading = object.position.clone().sub(previous);
        if (heading.lengthSq() > 1e-6) {
          // Both the imported models and the fallback cone are nose-along -Z,
          // which is exactly what lookAt() aims — no correction needed.
          object.lookAt(object.position.clone().add(heading));
        }
      } else {
        const angle = (i / Math.max(state.ships.length, 1)) * Math.PI * 2 + this.elapsed * 0.15;
        object.position.set(
          Math.cos(angle) * IDLE_ORBIT_RADIUS,
          0.5 + Math.sin(this.elapsed + i) * 0.2,
          Math.sin(angle) * IDLE_ORBIT_RADIUS,
        );
        object.rotation.set(0, -angle, 0);
      }
    });
  }

  private sync(): void {
    const state = store.getState();
    if (!state) return;

    const currentIds = new Set(state.ships.map((s) => s.id));
    for (const [id, object] of this.objects) {
      if (!currentIds.has(id)) {
        this.group.remove(object);
        this.objects.delete(id);
      }
    }

    for (const ship of state.ships) {
      if (this.objects.has(ship.id)) continue;
      const color = SHIP_COLORS[ship.ship_code] ?? 0xffffff;
      const object = createShipModel(ship.ship_code) ?? buildFallbackShip(color);
      object.userData = { shipId: ship.id };

      // Tinted engine light per ship type — keeps the fleet colour-coded the
      // way the DOM panels are, even though the models themselves are grey.
      const engineGlow = new THREE.PointLight(color, 1.2, 5);
      engineGlow.position.set(0, 0, 0.6); // behind the ship: +Z is aft, nose is -Z
      object.add(engineGlow);

      this.group.add(object);
      this.objects.set(ship.id, object);
    }
  }
}
