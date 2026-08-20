import * as THREE from "three";
import { store } from "../state/gameState";
import { createShipModel } from "./ShipModels";
import { QuantumFx, jumpChoreography } from "./QuantumFx";
import { PLANET_SPIN_RATE, QUANTUM_GATE_POSITION } from "./HomeBase";
import type { JumpAnchor } from "./QuantumFx";
import type { Sites } from "./Site";

const SHIP_COLORS: Record<string, number> = {
  scout: 0x80ffdb,
  freighter: 0xffd166,
  heavy_cruiser: 0xef476f,
};

const ORBIT_RADIUS = 8;
const ORBIT_HEIGHT = 0.6;
/** How fast a ship swings onto a new heading, in "catch-up per second". */
const TURN_RATE = 3.2;

// Scratch vectors reused every frame — this runs per ship per frame, so
// allocating fresh Vector3s here would churn garbage continuously.
const _pos = new THREE.Vector3();
const _prev = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _orbit = new THREE.Vector3();
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const _aim = new THREE.Object3D();

// Used when the GLB model for a ship type isn't available (still loading, or
// failed to load) — keeps the game playable rather than showing nothing.
function buildFallbackShip(color: number): THREE.Object3D {
  const geo = new THREE.ConeGeometry(0.35, 1, 6);
  // Cones point +Y by default; tip it to +Z, which is the axis
  // Object3D.lookAt() aims at the target (and what ShipModels rotates the
  // imported models to), so both can be aimed with a plain lookAt().
  geo.rotateX(Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({
    color,
    flatShading: true,
    emissive: color,
    emissiveIntensity: 0.5,
    fog: false,
  });
  return new THREE.Mesh(geo, mat);
}

// A ship's orbital slot is derived from a hash of its id rather than its index
// in the fleet array. With an index, building or losing any ship reshuffled
// every other ship's parking spot — and a ship coming home from a mission
// would land in someone else's slot.
function slotPhase(shipId: string): number {
  let h = 0;
  for (let i = 0; i < shipId.length; i++) h = (h * 31 + shipId.charCodeAt(i)) | 0;
  return ((h >>> 0) % 3600) / 3600 * Math.PI * 2;
}

// Geostationary: the same angular rate as the planet, so a parked ship holds
// station over the same patch of surface instead of drifting past it.
function orbitPositionAt(shipId: string, elapsed: number, out: THREE.Vector3): THREE.Vector3 {
  const angle = slotPhase(shipId) + elapsed * PLANET_SPIN_RATE;
  return out.set(Math.cos(angle) * ORBIT_RADIUS, ORBIT_HEIGHT, Math.sin(angle) * ORBIT_RADIUS);
}

function orbitTangentAt(shipId: string, elapsed: number, out: THREE.Vector3): THREE.Vector3 {
  const angle = slotPhase(shipId) + elapsed * PLANET_SPIN_RATE;
  // Derivative of the orbit circle: the direction the ship is actually moving.
  return out.set(-Math.sin(angle), 0, Math.cos(angle));
}

function smoothstep(t: number): number {
  const x = THREE.MathUtils.clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

// Eases orientation toward a heading instead of snapping to it, so a ship
// visibly swings onto its outbound course, turns around at the site, and
// settles back into its orbit. The exponential form makes the rate
// frame-rate independent.
function aimTowards(object: THREE.Object3D, forward: THREE.Vector3, dt: number): void {
  if (forward.lengthSq() < 1e-8) return;
  _aim.position.copy(object.position);
  _aim.up.copy(object.up);
  _aim.lookAt(_pos.copy(object.position).add(forward));
  object.quaternion.slerp(_aim.quaternion, 1 - Math.exp(-TURN_RATE * dt));
}

export class Ships {
  readonly group = new THREE.Group();
  private objects = new Map<string, THREE.Object3D>();
  private fx = new Map<string, QuantumFx>();
  private elapsed = 0;

  constructor(private sites: Sites) {
    store.subscribe(() => this.sync());
    this.sync();
  }

  private isDeepSite(siteId: string): boolean {
    return store.getCatalog()?.sites.find((s) => s.id === siteId)?.kind === "deep_planet";
  }

  // One effect rig per ship currently making a quantum jump, created lazily and
  // torn down when the jump ends so idle ships cost nothing.
  private fxFor(shipId: string): QuantumFx {
    let existing = this.fx.get(shipId);
    if (!existing) {
      existing = new QuantumFx();
      this.group.add(existing.group);
      this.fx.set(shipId, existing);
    }
    return existing;
  }

  private releaseFx(shipId: string): void {
    const existing = this.fx.get(shipId);
    if (!existing) return;
    this.group.remove(existing.group);
    existing.dispose();
    this.fx.delete(shipId);
  }

  update(dt: number, camera: THREE.Camera): void {
    this.elapsed += dt;
    const state = store.getState();
    if (!state) return;

    for (const ship of state.ships) {
      const object = this.objects.get(ship.id);
      if (!object) continue;

      const travelling = ship.status === "en_route" && ship.departed_at && ship.eta_at && ship.current_site_id;
      if (!travelling) {
        this.releaseFx(ship.id);
        object.visible = true;
        object.position.copy(orbitPositionAt(ship.id, this.elapsed, _orbit));
        aimTowards(object, orbitTangentAt(ship.id, this.elapsed, _fwd), dt);
        continue;
      }

      const site = this.sites.getMarker(ship.current_site_id!)?.position;
      if (!site) continue;

      const departed = new Date(ship.departed_at!).getTime();
      const eta = new Date(ship.eta_at!).getTime();
      const progress = THREE.MathUtils.clamp((Date.now() - departed) / (eta - departed), 0, 1);

      // The ship's own slot, live — so a ship returning after several minutes
      // comes back to where its slot has rotated to, not where it left from.
      const home = orbitPositionAt(ship.id, this.elapsed, _orbit);
      _prev.copy(object.position);

      if (this.isDeepSite(ship.current_site_id!)) {
        const jump = jumpChoreography(progress);
        // The gate is a fixed point in space, so resolving anchors is a plain
        // lookup — no chasing a rotating parent's world matrix.
        const anchor = (a: JumpAnchor, out: THREE.Vector3): THREE.Vector3 =>
          a === "orbit" ? out.copy(home) : a === "gate" ? out.copy(QUANTUM_GATE_POSITION) : out.copy(site);

        const from = anchor(jump.from, _from);
        const to = anchor(jump.to, _to);
        object.position.lerpVectors(from, to, jump.travel);

        // A leg that starts and ends at the same anchor (charge, dwell) has no
        // direction of its own — keep facing outward along the jump axis so the
        // ship is lined up with the gate while it charges.
        if (from.distanceToSquared(to) > 1e-8) _fwd.copy(to).sub(from).normalize();
        else _fwd.copy(site).sub(QUANTUM_GATE_POSITION).normalize();

        object.visible = this.fxFor(ship.id).update(dt, jump.phase, jump.local, object.position, _fwd, camera);
        // Aim along the jump axis; while hidden mid-transit there's nothing to
        // orient, and skipping it avoids spinning during the invisible stretch.
        if (object.visible) aimTowards(object, _fwd, dt);
        continue;
      }

      // Local sites fly the whole round trip: out, hold, back.
      this.releaseFx(ship.id);
      object.visible = true;

      if (progress < 0.45) {
        const t = smoothstep(progress / 0.45);
        object.position.lerpVectors(home, site, t);
        object.position.y += Math.sin(t * Math.PI) * 1.5; // gentle arc, purely cosmetic
      } else if (progress < 0.55) {
        object.position.copy(site);
      } else {
        const t = smoothstep((progress - 0.55) / 0.45);
        object.position.lerpVectors(site, home, t);
        object.position.y += Math.sin(t * Math.PI) * 1.5;
      }

      // Heading follows actual motion, so the turn-around at the site happens
      // on its own rather than needing a special case. Falls back to the orbit
      // tangent while station-keeping, where the frame delta is ~zero.
      _fwd.copy(object.position).sub(_prev);
      if (_fwd.lengthSq() < 1e-10) orbitTangentAt(ship.id, this.elapsed, _fwd);
      aimTowards(object, _fwd, dt);
    }
  }

  private sync(): void {
    const state = store.getState();
    if (!state) return;

    const currentIds = new Set(state.ships.map((s) => s.id));
    for (const [id, object] of this.objects) {
      if (!currentIds.has(id)) {
        this.group.remove(object);
        this.objects.delete(id);
        this.releaseFx(id); // a destroyed ship must not leave its jump rig behind
      }
    }

    for (const ship of state.ships) {
      if (this.objects.has(ship.id)) continue;
      const color = SHIP_COLORS[ship.ship_code] ?? 0xffffff;
      const object = createShipModel(ship.ship_code) ?? buildFallbackShip(color);
      object.userData = { shipId: ship.id };
      // Start parked in its slot, already facing along the orbit, so a newly
      // built ship doesn't visibly snap into place on its first frame.
      object.position.copy(orbitPositionAt(ship.id, this.elapsed, _orbit));
      object.lookAt(_pos.copy(object.position).add(orbitTangentAt(ship.id, this.elapsed, _fwd)));

      // Tinted engine light per ship type — keeps the fleet colour-coded the
      // way the DOM panels are, even though the models themselves are grey.
      const engineGlow = new THREE.PointLight(color, 1.2, 5);
      engineGlow.position.set(0, 0, -0.6); // behind the ship: nose is +Z, so aft is -Z
      object.add(engineGlow);

      this.group.add(object);
      this.objects.set(ship.id, object);
    }
  }
}
