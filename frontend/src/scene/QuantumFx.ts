import * as THREE from "three";

// Custom shaders rather than tweened standard materials: the streaking warp
// tube in particular can't be done with a stock material, and driving
// everything off a single uTime/uIntensity pair keeps the phase logic in one
// place. All three effects are additive with depthWrite off so they layer over
// the scene and feed the bloom pass instead of occluding anything.

const CHARGE_VERT = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(cameraPosition - worldPos.xyz);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const CHARGE_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform vec3  uColor;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    // Fresnel so the shell reads as a containment field rather than a solid
    // ball — brightest at the silhouette edge.
    float fres = pow(1.0 - max(dot(vNormal, vViewDir), 0.0), 2.5);
    float pulse = 0.6 + 0.4 * sin(uTime * 16.0);
    float alpha = fres * pulse * uIntensity;
    gl_FragColor = vec4(uColor * (0.5 + fres * 1.1), alpha);
  }
`;

const TUNNEL_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const TUNNEL_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform vec3  uColor;
  varying vec2 vUv;

  float hash(float n) { return fract(sin(n) * 43758.5453123); }

  void main() {
    // Split the tube circumference into lanes, each scrolling at its own speed
    // and offset, so the streaks look like distinct passing light trails rather
    // than one uniform moving band.
    float lane   = floor(vUv.x * 28.0);
    float speed  = 3.0 + hash(lane) * 7.0;
    float offset = hash(lane + 17.0);

    float s = fract(vUv.y * 2.0 - uTime * speed + offset);
    float streak = smoothstep(0.0, 0.12, s) * (1.0 - smoothstep(0.12, 0.55, s));

    // Feather both ends so the cylinder never shows a hard rim.
    float endFade = smoothstep(0.0, 0.3, vUv.y) * (1.0 - smoothstep(0.7, 1.0, vUv.y));

    gl_FragColor = vec4(uColor * 0.85, streak * endFade * uIntensity);
  }
`;

const FLASH_VERT = TUNNEL_VERT;

const FLASH_FRAG = /* glsl */ `
  uniform float uIntensity;
  uniform vec3  uColor;
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float a = pow(1.0 - smoothstep(0.0, 1.0, d), 2.0) * uIntensity;
    // Overdriven colour so the bloom threshold actually catches it.
    gl_FragColor = vec4(uColor * 1.6, a);
  }
`;

function additiveShader(vert: string, frag: string, color: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 0 },
      uColor: { value: new THREE.Color(color) },
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
}

export type JumpPhase = "charge" | "launch" | "transit" | "arrive" | "dwell";

export interface JumpState {
  phase: JumpPhase;
  /** 0..1 within the current phase. */
  local: number;
  /** true on the home -> site leg, false on the way back. */
  outbound: boolean;
  /** 0..1 from this leg's origin to its destination. */
  travel: number;
}

// Maps raw expedition progress onto a full round trip: charge at base, jump
// out, hold at the site, jump back, arrive home. Deliberately non-linear — the
// ship lingers to charge, is absent across the middle of each leg, and
// reappears near the far end.
//
// The expedition resolves when the ship gets *home* rather than when it reaches
// the site, which is why the whole round trip fits inside the one ETA.
export function jumpChoreography(progress: number): JumpState {
  // --- outbound leg ---
  if (progress < 0.1) return { phase: "charge", local: progress / 0.1, outbound: true, travel: 0 };
  if (progress < 0.16) {
    const local = (progress - 0.1) / 0.06;
    // Ease-in so the launch visibly accelerates out of the charge.
    return { phase: "launch", local, outbound: true, travel: 0.15 * local * local };
  }
  if (progress < 0.42) return { phase: "transit", local: (progress - 0.16) / 0.26, outbound: true, travel: 0.15 };
  if (progress < 0.5) {
    // Ramp all the way to 1 rather than stopping at 0.9: the next phase sits at
    // the destination, so leaving a gap made the ship pop the last stretch.
    const local = (progress - 0.42) / 0.08;
    return { phase: "arrive", local, outbound: true, travel: 0.9 + 0.1 * local };
  }

  // --- holding at the site ---
  if (progress < 0.56) return { phase: "dwell", local: (progress - 0.5) / 0.06, outbound: true, travel: 1 };

  // --- return leg, same shape with the endpoints swapped ---
  if (progress < 0.62) {
    const local = (progress - 0.56) / 0.06;
    return { phase: "launch", local, outbound: false, travel: 0.15 * local * local };
  }
  if (progress < 0.88) return { phase: "transit", local: (progress - 0.62) / 0.26, outbound: false, travel: 0.15 };
  // Finishes at exactly 1, i.e. the ship's live orbital slot, so the handover to
  // the idle orbit when the backend flips the status is seamless.
  const local = (progress - 0.88) / 0.12;
  return { phase: "arrive", local, outbound: false, travel: 0.9 + 0.1 * local };
}

export class QuantumFx {
  readonly group = new THREE.Group();

  private charge: THREE.Mesh;
  private chargeMat: THREE.ShaderMaterial;
  private tunnel: THREE.Mesh;
  private tunnelMat: THREE.ShaderMaterial;
  private flash: THREE.Mesh;
  private flashMat: THREE.ShaderMaterial;
  private elapsed = 0;

  private static readonly TUBE_LENGTH = 10;
  private static readonly UP = new THREE.Vector3(0, 1, 0);

  constructor(color = 0x7bdfff) {
    this.chargeMat = additiveShader(CHARGE_VERT, CHARGE_FRAG, color);
    this.charge = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), this.chargeMat);
    this.group.add(this.charge);

    this.tunnelMat = additiveShader(TUNNEL_VERT, TUNNEL_FRAG, color);
    // Open-ended cylinder: the ship flies down the middle of it.
    this.tunnel = new THREE.Mesh(
      new THREE.CylinderGeometry(1.0, 1.0, QuantumFx.TUBE_LENGTH, 28, 1, true),
      this.tunnelMat,
    );
    this.group.add(this.tunnel);

    this.flashMat = additiveShader(FLASH_VERT, FLASH_FRAG, 0xd8f4ff);
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), this.flashMat);
    this.group.add(this.flash);
  }

  dispose(): void {
    [this.charge, this.tunnel, this.flash].forEach((m) => m.geometry.dispose());
    [this.chargeMat, this.tunnelMat, this.flashMat].forEach((m) => m.dispose());
  }

  // Returns whether the ship itself should be drawn this frame — during the
  // middle of a jump it's "in transit" and deliberately absent.
  update(
    dt: number,
    phase: JumpPhase,
    local: number,
    shipPos: THREE.Vector3,
    jumpDir: THREE.Vector3,
    camera: THREE.Camera,
  ): boolean {
    this.elapsed += dt;
    for (const mat of [this.chargeMat, this.tunnelMat]) mat.uniforms.uTime.value = this.elapsed;

    // Billboard the flash so it always faces the viewer.
    this.flash.quaternion.copy(camera.quaternion);

    const tunnelQuat = new THREE.Quaternion().setFromUnitVectors(QuantumFx.UP, jumpDir);
    this.tunnel.quaternion.copy(tunnelQuat);

    let chargeI = 0;
    let tunnelI = 0;
    let flashI = 0;
    let shipVisible = true;

    switch (phase) {
      case "charge": {
        this.charge.position.copy(shipPos);
        this.charge.scale.setScalar(0.5 + local * 1.3);
        chargeI = local * 0.55;
        break;
      }
      case "launch": {
        this.charge.position.copy(shipPos);
        this.charge.scale.setScalar(1.8 - local * 1.2);
        chargeI = (1 - local) * 0.55;
        // Tube trails behind the ship, centred half a length back.
        this.tunnel.position.copy(shipPos).addScaledVector(jumpDir, -QuantumFx.TUBE_LENGTH * 0.35);
        tunnelI = Math.sin(local * Math.PI) * 0.85;
        this.flash.position.copy(shipPos);
        // Flash peaks right at the vanish point.
        flashI = Math.pow(local, 3) * 1.15;
        shipVisible = local < 0.85;
        break;
      }
      case "transit": {
        shipVisible = false;
        // A faint tube lingering at the departure point sells "something just
        // tore through here" without keeping the full effect on screen.
        tunnelI = Math.max(0, 0.10 - local * 0.10);
        this.tunnel.position.copy(shipPos).addScaledVector(jumpDir, -QuantumFx.TUBE_LENGTH * 0.35);
        break;
      }
      case "arrive": {
        this.flash.position.copy(shipPos);
        flashI = Math.sin(local * Math.PI) * 1.05;
        this.tunnel.position.copy(shipPos).addScaledVector(jumpDir, -QuantumFx.TUBE_LENGTH * 0.3);
        tunnelI = Math.sin(local * Math.PI) * 0.6;
        shipVisible = local > 0.2;
        break;
      }
      case "dwell": {
        // Holding at the site between the two jumps: no effects, the ship just
        // sits there so the round trip has a visible middle.
        break;
      }
    }

    this.chargeMat.uniforms.uIntensity.value = chargeI;
    this.tunnelMat.uniforms.uIntensity.value = tunnelI;
    this.flashMat.uniforms.uIntensity.value = flashI;

    this.charge.visible = chargeI > 0.001;
    this.tunnel.visible = tunnelI > 0.001;
    this.flash.visible = flashI > 0.001;

    return shipVisible;
  }
}
