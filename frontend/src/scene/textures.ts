import * as THREE from "three";

// Procedural canvas textures — no external asset files or CDN fetches, so
// the game stays fully self-contained. Each generator returns a ready
// CanvasTexture; callers cache/reuse per mesh type rather than per instance.

function canvas(size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  return { canvas: c, ctx };
}

function toTexture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function blotches(
  ctx: CanvasRenderingContext2D,
  size: number,
  count: number,
  colorFn: () => string,
  radiusRange: [number, number],
): void {
  for (let i = 0; i < count; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = radiusRange[0] + Math.random() * (radiusRange[1] - radiusRange[0]);
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    const color = colorFn();
    grad.addColorStop(0, color);
    grad.addColorStop(1, "transparent");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function planetTexture(baseColor: string, landColor: string): THREE.CanvasTexture {
  const size = 256;
  const { canvas: c, ctx } = canvas(size);
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, size, size);
  blotches(ctx, size, 22, () => landColor, [12, 34]);
  blotches(ctx, size, 14, () => "rgba(255,255,255,0.18)", [8, 20]); // wispy cloud streaks
  blotches(ctx, size, 10, () => "rgba(0,0,0,0.15)", [10, 26]); // shadowed terrain depth
  return toTexture(c);
}

export function moonTexture(baseColor: string): THREE.CanvasTexture {
  const size = 256;
  const { canvas: c, ctx } = canvas(size);
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, size, size);
  // Craters: bright rim + dark interior, classic cratered-moon look.
  for (let i = 0; i < 16; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 6 + Math.random() * 18;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.85, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = Math.max(1, r * 0.15);
    ctx.stroke();
  }
  return toTexture(c);
}

export function asteroidTexture(baseColor: string): THREE.CanvasTexture {
  const size = 256;
  const { canvas: c, ctx } = canvas(size);
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, size, size);
  blotches(ctx, size, 40, () => "rgba(0,0,0,0.25)", [4, 14]);
  blotches(ctx, size, 20, () => "rgba(255,255,255,0.08)", [3, 9]);
  return toTexture(c);
}

export function derelictPanelTexture(baseColor: string): THREE.CanvasTexture {
  const size = 256;
  const { canvas: c, ctx } = canvas(size);
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, size, size);

  // Panel seams — an irregular grid of dark lines, like welded hull plating.
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 2;
  const cols = 6;
  const rows = 6;
  for (let i = 1; i < cols; i++) {
    const x = (i / cols) * size + (Math.random() - 0.5) * 6;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size);
    ctx.stroke();
  }
  for (let i = 1; i < rows; i++) {
    const y = (i / rows) * size + (Math.random() - 0.5) * 6;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }

  blotches(ctx, size, 18, () => "rgba(120,60,20,0.3)", [6, 16]); // rust patches
  blotches(ctx, size, 10, () => "rgba(0,0,0,0.3)", [8, 20]); // scorch/damage marks

  // A few lit window squares.
  for (let i = 0; i < 6; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const w = 6 + Math.random() * 6;
    ctx.fillStyle = "rgba(255, 220, 150, 0.7)";
    ctx.fillRect(x, y, w, w * 0.6);
  }

  return toTexture(c);
}

export function gasGiantTexture(baseColor: string, bandColor: string): THREE.CanvasTexture {
  const size = 256;
  const { canvas: c, ctx } = canvas(size);
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, size, size);

  // Horizontal bands of varying thickness/opacity, like Jupiter's belts.
  let y = 0;
  while (y < size) {
    const h = 8 + Math.random() * 26;
    ctx.fillStyle = bandColor;
    ctx.globalAlpha = 0.25 + Math.random() * 0.35;
    ctx.fillRect(0, y, size, h);
    y += h + Math.random() * 6;
  }
  ctx.globalAlpha = 1;

  blotches(ctx, size, 6, () => "rgba(255,255,255,0.15)", [10, 24]); // storm swirls
  return toTexture(c);
}

export function sunTexture(): THREE.CanvasTexture {
  const size = 256;
  const { canvas: c, ctx } = canvas(size);
  const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size * 0.5);
  grad.addColorStop(0, "#fffbe0");
  grad.addColorStop(0.6, "#ffe066");
  grad.addColorStop(1, "#ff9d1f");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  blotches(ctx, size, 30, () => "rgba(255,255,255,0.2)", [4, 12]); // flare texture
  return toTexture(c);
}

// Displaces each vertex along its normal by a random amount, then recomputes
// normals — turns a regular icosahedron into a craggy rock silhouette.
export function makeCraggyGeometry(radius: number, detail: number, jitter: number): THREE.IcosahedronGeometry {
  const geo = new THREE.IcosahedronGeometry(radius, detail);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const offset = 1 + (Math.random() - 0.5) * jitter;
    v.multiplyScalar(offset);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}
