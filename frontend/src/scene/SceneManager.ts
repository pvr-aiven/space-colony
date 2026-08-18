import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

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

// Owns renderer/camera/lighting/fog only — no game logic. This is the sole
// attach point for the low-poly/retro-arcade visual direction: starfield,
// grid, fog, and lighting tuning all live here, kept out of gameplay code.
export class SceneManager {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;

  private clock = new THREE.Clock();
  private updateCallbacks: Array<(dt: number) => void> = [];
  private starfield: THREE.Points;

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

    window.addEventListener("resize", () => this.onResize());
  }

  onUpdate(cb: (dt: number) => void): void {
    this.updateCallbacks.push(cb);
  }

  start(): void {
    const tick = () => {
      const dt = this.clock.getDelta();
      this.starfield.rotation.y += dt * 0.002;
      this.controls.update();
      for (const cb of this.updateCallbacks) cb(dt);
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(tick);
    };
    tick();
  }

  private onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
