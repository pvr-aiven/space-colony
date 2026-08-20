import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

function buildStarfield(): THREE.Points {
  const count = 1200;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // Push stars out past the fog falloff so they read as fixed background,
    // not fogged-out geometry.
    const radius = 120 + Math.random() * 260;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(THREE.MathUtils.randFloatSpread(2));
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.cos(phi);
    positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ color: 0xbcd4ff, size: 1.1, sizeAttenuation: true, fog: false });
  return new THREE.Points(geo, mat);
}

function buildRetroGrid(): THREE.GridHelper {
  const grid = new THREE.GridHelper(140, 28, 0x2a4a6a, 0x152233);
  grid.position.y = -6;
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.35;
  return grid;
}

/** Arrow keys pan the view across the system; nothing else is bound. */
const PAN_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]);

/**
 * How fast the view pans, as a fraction of the camera's distance to its
 * target per second — so panning covers ground proportionally to how far out
 * you're zoomed instead of crawling in a galaxy view and overshooting up close.
 */
const PAN_RATE = 0.6;
/** Floor on the above, so panning still works when zoomed right in. */
const MIN_PAN_SPEED = 4;

/** Seconds the recenter glide takes. Short enough not to feel like a cutscene. */
const RECENTER_DURATION = 0.55;

/** Upper bound on a single frame's delta, in seconds (~10 fps worth). */
const MAX_FRAME_DELTA = 0.1;

const WORLD_UP = new THREE.Vector3(0, 1, 0);

// Reused every frame while a key is held, rather than allocating per frame.
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _move = new THREE.Vector3();

/**
 * Arrow keys must keep doing their normal job inside form controls — the fleet
 * panel's site dropdowns are selected with them, so stealing the event there
 * would make ships undispatchable.
 */
function isFormControl(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["SELECT", "INPUT", "TEXTAREA"].includes(target.tagName);
}

function smoothstep(t: number): number {
  const x = THREE.MathUtils.clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

// Owns renderer/camera/lighting/fog only — no game logic. This is the sole
// attach point for the low-poly/retro-arcade visual direction: starfield,
// grid, fog, and lighting tuning all live here, kept out of gameplay code.
export class SceneManager {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;
  readonly composer: EffectComposer;
  readonly bloomPass: UnrealBloomPass;

  private clock = new THREE.Clock();
  private updateCallbacks: Array<(dt: number) => void> = [];
  private starfield: THREE.Points;
  /** Keys currently held, so panning is continuous rather than per-keypress. */
  private held = new Set<string>();
  private recenterAnim: {
    fromTarget: THREE.Vector3;
    fromPosition: THREE.Vector3;
    toTarget: THREE.Vector3;
    toPosition: THREE.Vector3;
    elapsed: number;
  } | null = null;

  constructor(container: HTMLElement) {
    this.scene.background = new THREE.Color(0x05060f);
    this.scene.fog = new THREE.FogExp2(0x0a0e1c, 0.012);

    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 500);
    this.camera.position.set(0, 14, 26);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // ACES tone mapping + a touch of extra exposure gives the flat-shaded
    // low-poly look more contrast/punch without needing post-processing passes.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.4;
    container.appendChild(this.renderer.domElement);

    const ambient = new THREE.AmbientLight(0x3f5588, 1.9);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffd9a0, 2.6);
    sun.position.set(20, 30, 10);
    this.scene.add(sun);

    const rim = new THREE.PointLight(0x3fa9ff, 2.6, 90);
    rim.position.set(-15, 8, -10);
    this.scene.add(rim);

    this.starfield = buildStarfield();
    this.scene.add(this.starfield);
    this.scene.add(buildRetroGrid());

    // Lets a large screen zoom into the action instead of the fixed framing
    // looking small in the middle of the window. Rotation is capped short of
    // the poles to keep the scene's "top-down-ish" read intact; zoom range
    // will widen once a full galaxy view with multiple bases exists.
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 160;
    this.controls.maxPolarAngle = Math.PI * 0.85;
    this.controls.update();

    // Bloom is what makes the emissive/additive material work throughout the
    // scene actually read as light rather than flat bright colour — and it's
    // what sells the quantum jump flash. Threshold is high enough that only
    // genuinely bright things (the sun, beacons, jump effects) glow, so the
    // planets and hulls don't turn into mush.
    //
    // RenderPass draws into a linear render target, where WebGLRenderer skips
    // tone mapping; OutputPass then applies the renderer's toneMapping and
    // colour-space conversion once at the end. Keeping renderer.toneMapping
    // set and adding OutputPass is therefore correct, not double-applied.
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.55, // strength
      0.45, // radius
      0.78, // luminance threshold — high enough that hulls and planets don't
      //       bloom, leaving headroom for the jump flash to actually stand out
    );
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());

    window.addEventListener("resize", () => this.onResize());
    this.bindKeyboardPan();
    // Dragging or zooming is the user taking over — abandon any glide in
    // progress rather than fighting them for the camera.
    this.controls.addEventListener("start", () => {
      this.recenterAnim = null;
    });
  }

  private bindKeyboardPan(): void {
    window.addEventListener("keydown", (event) => {
      if (!PAN_KEYS.has(event.key)) return;
      // Leave OS/browser shortcuts (and macOS word-jumps) alone.
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isFormControl(event.target)) return;
      event.preventDefault(); // otherwise the page itself scrolls
      this.held.add(event.key);
      this.recenterAnim = null;
    });
    window.addEventListener("keyup", (event) => this.held.delete(event.key));
    // Without this a key held while the window loses focus never gets its
    // keyup, and the view pans forever on its own.
    window.addEventListener("blur", () => this.held.clear());
  }

  /**
   * Glides the view back onto the home planet at the origin, keeping the
   * current zoom and viewing angle — the camera offset from the target is
   * preserved, so this recenters without also undoing how the user framed
   * the scene.
   */
  recenterOnHome(): void {
    const toTarget = new THREE.Vector3(0, 0, 0);
    const offset = this.camera.position.clone().sub(this.controls.target);
    this.recenterAnim = {
      fromTarget: this.controls.target.clone(),
      fromPosition: this.camera.position.clone(),
      toTarget,
      toPosition: toTarget.clone().add(offset),
      elapsed: 0,
    };
  }

  private applyKeyboardPan(dt: number): void {
    if (this.held.size === 0) return;

    // Pan across the ground plane rather than the screen plane: "forward"
    // should mean further into the system, not up into the sky, which is what
    // panning along the camera's own up axis would do.
    this.camera.getWorldDirection(_forward);
    _forward.y = 0;
    // Looking straight down leaves no usable heading — fall back to -Z.
    if (_forward.lengthSq() < 1e-8) _forward.set(0, 0, -1);
    _forward.normalize();
    _right.crossVectors(_forward, WORLD_UP).normalize();

    _move.set(0, 0, 0);
    if (this.held.has("ArrowUp")) _move.add(_forward);
    if (this.held.has("ArrowDown")) _move.sub(_forward);
    if (this.held.has("ArrowRight")) _move.add(_right);
    if (this.held.has("ArrowLeft")) _move.sub(_right);
    if (_move.lengthSq() < 1e-8) return; // opposite keys held: cancel out

    const distance = this.camera.position.distanceTo(this.controls.target);
    _move.normalize().multiplyScalar(Math.max(distance * PAN_RATE, MIN_PAN_SPEED) * dt);

    // Move target and camera together so panning translates the view without
    // altering the orbit angle or distance.
    this.controls.target.add(_move);
    this.camera.position.add(_move);
  }

  private applyRecenter(dt: number): void {
    const anim = this.recenterAnim;
    if (!anim) return;
    anim.elapsed += dt;
    const t = smoothstep(anim.elapsed / RECENTER_DURATION);
    this.controls.target.lerpVectors(anim.fromTarget, anim.toTarget, t);
    this.camera.position.lerpVectors(anim.fromPosition, anim.toPosition, t);
    if (anim.elapsed >= RECENTER_DURATION) this.recenterAnim = null;
  }

  onUpdate(cb: (dt: number) => void): void {
    this.updateCallbacks.push(cb);
  }

  start(): void {
    const tick = () => {
      // Clamped: getDelta() reports the whole gap after the loop has been
      // stalled (a backgrounded tab, a sleeping machine, a long GC pause), and
      // feeding that straight through teleports everything driven by dt in a
      // single frame — a held arrow key was measured jumping 177 units after a
      // 10-second stall. Every dt consumer gets the same clamped value, so
      // geostationary ships stay in step with the planet's spin.
      const dt = Math.min(this.clock.getDelta(), MAX_FRAME_DELTA);
      this.starfield.rotation.y += dt * 0.002;
      // Both move the camera and the orbit target, so they run before
      // controls.update() applies damping and recomputes the view matrix.
      this.applyKeyboardPan(dt);
      this.applyRecenter(dt);
      this.controls.update();
      for (const cb of this.updateCallbacks) cb(dt);
      this.composer.render();
      requestAnimationFrame(tick);
    };
    tick();
  }

  private onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    // The composer owns its own render targets, so it needs resizing too or
    // the scene renders at the old resolution and gets stretched.
    this.composer.setSize(window.innerWidth, window.innerHeight);
    this.bloomPass.setSize(window.innerWidth, window.innerHeight);
  }
}
