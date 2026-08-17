import * as THREE from "three";
import { store } from "../state/gameState";

const KIND_COLORS: Record<string, number> = {
  asteroid: 0xa0a0a0,
  planet: 0x4cc9f0,
  derelict: 0xf72585,
};

const SCALE = 0.4;

export class Sites {
  readonly group = new THREE.Group();
  private markers = new Map<string, THREE.Mesh>();

  constructor() {
    store.subscribe(() => this.sync());
    this.sync();
  }

  update(dt: number): void {
    this.markers.forEach((mesh) => (mesh.rotation.y += dt * 0.4));
  }

  getMarker(siteId: string): THREE.Mesh | undefined {
    return this.markers.get(siteId);
  }

  private sync(): void {
    const catalog = store.getCatalog();
    if (!catalog || this.markers.size > 0) return; // sites are a fixed catalog, build once

    for (const site of catalog.sites) {
      const geo = new THREE.OctahedronGeometry(0.5 + site.difficulty * 0.15, 0);
      const mat = new THREE.MeshStandardMaterial({
        color: KIND_COLORS[site.kind] ?? 0xffffff,
        flatShading: true,
        emissive: 0x111111,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(site.position.x * SCALE, site.position.y * SCALE, site.position.z * SCALE);
      mesh.userData = { siteId: site.id, label: site.display_name };
      this.group.add(mesh);
      this.markers.set(site.id, mesh);
    }
  }
}
