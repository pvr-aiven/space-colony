import * as THREE from "three";
import { asteroidTexture, gasGiantTexture, moonTexture, planetTexture, sunTexture } from "./textures";

const SUN_POSITION = new THREE.Vector3(90, 22, -55);

interface OrbitingPlanet {
  mesh: THREE.Mesh;
  orbitRadius: number;
  orbitSpeed: number;
  angle: number;
  heightOffset: number;
}

interface PlanetSpec {
  radius: number;
  orbitRadius: number;
  speed: number;
  map: THREE.Texture;
  emissive: number;
}

// Purely decorative backdrop — a central sun (also a real light source) and
// a handful of background planets on slow orbits around it. Deliberately
// separate from the home base + explorable sites layer: this is scenery,
// not a second gameplay area, so it has no store/state dependency at all.
export class SolarSystem {
  readonly group = new THREE.Group();
  private sun: THREE.Mesh;
  private corona: THREE.Mesh;
  private planets: OrbitingPlanet[] = [];
  private elapsed = 0;

  constructor() {
    const sunGeo = new THREE.IcosahedronGeometry(7, 2);
    const sunMat = new THREE.MeshBasicMaterial({ map: sunTexture(), fog: false });
    this.sun = new THREE.Mesh(sunGeo, sunMat);
    this.sun.position.copy(SUN_POSITION);
    this.group.add(this.sun);

    const coronaGeo = new THREE.IcosahedronGeometry(9.5, 1);
    const coronaMat = new THREE.MeshBasicMaterial({
      color: 0xffe9a8,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.corona = new THREE.Mesh(coronaGeo, coronaMat);
    this.corona.position.copy(SUN_POSITION);
    this.group.add(this.corona);

    // A real light, not just a bright mesh. decay: 1 (softer than the
    // physically-correct inverse-square) keeps it reaching the home base
    // despite the sun sitting ~110 units out.
    const sunLight = new THREE.PointLight(0xfff2c0, 30, 600, 1);
    sunLight.position.copy(SUN_POSITION);
    this.group.add(sunLight);

    const specs: PlanetSpec[] = [
      { radius: 3.2, orbitRadius: 22, speed: 0.05, map: planetTexture("#b5651d", "#7a3f10"), emissive: 0x5a2c08 },
      { radius: 4.4, orbitRadius: 33, speed: 0.035, map: moonTexture("#4a5a72"), emissive: 0x1c2436 },
      { radius: 6.2, orbitRadius: 48, speed: 0.02, map: gasGiantTexture("#d8a86a", "#8a5a2e"), emissive: 0x503818 },
      { radius: 2.6, orbitRadius: 60, speed: 0.015, map: moonTexture("#8ea9c1"), emissive: 0x2c3c4c },
      { radius: 1.8, orbitRadius: 14, speed: 0.09, map: asteroidTexture("#9a8a76"), emissive: 0x3c342a },
    ];

    for (const spec of specs) {
      const geo = new THREE.SphereGeometry(spec.radius, 24, 16);
      // fog: false — these are meant to read as fixed cosmic backdrop, not
      // fade into atmospheric haze the way nearby explorable sites do.
      const mat = new THREE.MeshStandardMaterial({
        map: spec.map,
        roughness: 0.85,
        emissive: spec.emissive,
        emissiveIntensity: 0.5,
        fog: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      this.group.add(mesh);
      this.planets.push({
        mesh,
        orbitRadius: spec.orbitRadius,
        orbitSpeed: spec.speed,
        angle: Math.random() * Math.PI * 2,
        heightOffset: (Math.random() - 0.5) * 8,
      });
    }
  }

  update(dt: number): void {
    this.elapsed += dt;
    this.sun.rotation.y += dt * 0.02;
    this.corona.rotation.y -= dt * 0.015;
    this.corona.scale.setScalar(1 + Math.sin(this.elapsed * 0.6) * 0.03);

    for (const p of this.planets) {
      p.angle += dt * p.orbitSpeed;
      p.mesh.position.set(
        SUN_POSITION.x + Math.cos(p.angle) * p.orbitRadius,
        SUN_POSITION.y * 0.25 + p.heightOffset,
        SUN_POSITION.z + Math.sin(p.angle) * p.orbitRadius,
      );
      p.mesh.rotation.y += dt * 0.15;
    }
  }
}
