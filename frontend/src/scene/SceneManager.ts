import * as THREE from "three";

// Owns renderer/camera/lighting/fog only — no game logic. The later
// low-poly/retro visual pass (fog tuning, dynamic lights, clouds) attaches
// here without touching gameplay code.
export class SceneManager {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;

  private clock = new THREE.Clock();
  private updateCallbacks: Array<(dt: number) => void> = [];

  constructor(container: HTMLElement) {
    this.scene.background = new THREE.Color(0x05060a);
    this.scene.fog = new THREE.FogExp2(0x05060a, 0.015);

    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 500);
    this.camera.position.set(0, 14, 26);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    const ambient = new THREE.AmbientLight(0x404060, 1.2);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xfff2d0, 1.4);
    sun.position.set(20, 30, 10);
    this.scene.add(sun);

    const rim = new THREE.PointLight(0x3fa9ff, 1.5, 60);
    rim.position.set(-15, 8, -10);
    this.scene.add(rim);

    window.addEventListener("resize", () => this.onResize());
  }

  onUpdate(cb: (dt: number) => void): void {
    this.updateCallbacks.push(cb);
  }

  start(): void {
    const tick = () => {
      const dt = this.clock.getDelta();
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
