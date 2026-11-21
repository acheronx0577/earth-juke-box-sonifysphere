"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { CONTACT_COUNT, CONTACT_MEMBERS } from "@/data/contactData";
import {
  CHAMFER_FRACTION,
  DESK_REST_GAP,
  GRID_X,
  GRID_Y,
  PAGE_COUNT,
  PHONE_REST_GAP,
  pageGeometry,
  scrollForMember,
  viewFor,
  type DeckView,
} from "@/components/contact/deckMath";

export interface DeckApi {
  draw: (scroll: number, speed: number, gap: number, focus: number, swing?: number) => { x: number; y: number; member: number } | null;
  resize: (width: number, height: number, phone: boolean) => void;
  restGap: () => number;
  /** True when the point, in canvas CSS pixels, lands on a visible card. */
  hit: (x: number, y: number) => boolean;
  /** Screen travel of the focused card when the member index increases by one. */
  step: () => { x: number; y: number };
}

interface ContactDeckProps {
  onReady: (api: DeckApi) => void;
}

function smoothstep(start: number, end: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

function cardTexture(image: HTMLImageElement, phone: boolean): HTMLCanvasElement {
  const width = 1024;
  const height = Math.round((width * 3.658) / 4.492);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return canvas;
  const cut = width * CHAMFER_FRACTION;
  const trace = (inset: number) => {
    const join = cut + inset * (Math.SQRT2 - 1);
    const points: ReadonlyArray<readonly [number, number]> = [
      [join, inset],
      [width - join, inset],
      [width - inset, join],
      [width - inset, height - join],
      [width - join, height - inset],
      [join, height - inset],
      [inset, height - join],
      [inset, join],
    ];
    context.beginPath();
    points.forEach(([x, y], index) => (index === 0 ? context.moveTo(x, y) : context.lineTo(x, y)));
    context.closePath();
  };
  context.save();
  trace(0);
  context.clip();
  context.fillStyle = "#1c1c1b";
  context.fillRect(0, 0, width, height);
  const cover = Math.max(width / image.width, height / image.height);
  context.drawImage(
    image,
    (width - image.width * cover) / 2,
    (height - image.height * cover) / 2,
    image.width * cover,
    image.height * cover,
  );
  context.restore();
  const line = ((2.8 * width) / ((phone ? 190 : 375) * 1.6)) * 0.9;
  trace(line / 2);
  context.strokeStyle = "rgba(255,243,234,0.22)";
  context.lineWidth = line;
  context.stroke();
  return canvas;
}

function contains(xy: Float32Array, x: number, y: number): boolean {
  const columns = GRID_X + 1;
  const ring: number[] = [];
  for (let gx = 0; gx <= GRID_X; gx += 1) ring.push(gx);
  for (let gy = 1; gy <= GRID_Y; gy += 1) ring.push(gy * columns + GRID_X);
  for (let gx = GRID_X - 1; gx >= 0; gx -= 1) ring.push(GRID_Y * columns + gx);
  for (let gy = GRID_Y - 1; gy >= 1; gy -= 1) ring.push(gy * columns);
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const x1 = xy[ring[index] * 2];
    const y1 = xy[ring[index] * 2 + 1];
    const x0 = xy[ring[previous] * 2];
    const y0 = xy[ring[previous] * 2 + 1];
    const crosses = (y0 > y) !== (y1 > y) && x < ((x1 - x0) * (y - y0)) / (y1 - y0) + x0;
    if (crosses) inside = !inside;
  }
  return inside;
}

function centroid(xy: Float32Array): { x: number; y: number } {
  let x = 0;
  let y = 0;
  const count = xy.length / 2 || 1;
  for (let index = 0; index < xy.length; index += 2) {
    x += xy[index];
    y += xy[index + 1];
  }
  return { x: x / count, y: y / count };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load ${src}`));
    image.src = src;
  });
}

export function ContactDeck({ onReady }: ContactDeckProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 10);
    camera.position.z = 2;
    const uvs = new Float32Array((GRID_X + 1) * (GRID_Y + 1) * 2);
    let cursor = 0;
    for (let gy = 0; gy <= GRID_Y; gy += 1) {
      for (let gx = 0; gx <= GRID_X; gx += 1) {
        uvs[cursor] = gx / GRID_X;
        uvs[cursor + 1] = gy / GRID_Y;
        cursor += 2;
      }
    }
    const indices: number[] = [];
    for (let gy = 0; gy < GRID_Y; gy += 1) {
      for (let gx = 0; gx < GRID_X; gx += 1) {
        const a = gy * (GRID_X + 1) + gx;
        const b = a + 1;
        const c = a + GRID_X + 1;
        const d = c + 1;
        indices.push(a, b, c, b, d, c);
      }
    }
    const index = new Uint16Array(indices);
    const meshes: THREE.Mesh[] = [];
    const materials: THREE.MeshBasicMaterial[] = [];
    for (let i = 0; i < PAGE_COUNT; i += 1) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array((GRID_X + 1) * (GRID_Y + 1) * 3), 3));
      geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(uvs), 2));
      geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(index), 1));
      const material = new THREE.MeshBasicMaterial({
        transparent: true,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.visible = false;
      mesh.frustumCulled = false;
      scene.add(mesh);
      meshes.push(mesh);
      materials.push(material);
    }

    let view: DeckView = { width: 1, height: 1, phone: false };
    let disposed = false;
    let images: HTMLImageElement[] = [];
    const textures: THREE.CanvasTexture[] = [];

    const rebuildTextures = (phone: boolean) => {
      if (images.length < CONTACT_COUNT) return;
      images.forEach((image, index) => {
        textures[index]?.dispose();
        const texture = new THREE.CanvasTexture(cardTexture(image, phone));
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.flipY = false;
        texture.premultiplyAlpha = false;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.needsUpdate = true;
        textures[index] = texture;
      });
    };

    const resize = (width: number, height: number, phone: boolean) => {
      const nextPhone = phone;
      if (images.length === CONTACT_COUNT && nextPhone !== view.phone) rebuildTextures(nextPhone);
      view = viewFor(Math.max(1, width), Math.max(1, height), nextPhone);
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      renderer.setPixelRatio(ratio);
      renderer.setSize(view.width, view.height, false);
    };

    let shapes: { xy: Float32Array; distance: number }[] = [];

    const draw = (scroll: number, speed: number, gap: number, focus: number, swing = 0) => {
      if (textures.length < CONTACT_COUNT) return null;
      const placed: { mesh: THREE.Mesh; depth: number; distance: number; member: number; xy: Float32Array }[] = [];
      shapes = [];
      for (let i = 0; i < PAGE_COUNT; i += 1) {
        const geometry = pageGeometry(i, scroll, speed, gap, focus, view, swing);
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (let k = 0; k < geometry.xy.length; k += 2) {
          minX = Math.min(minX, geometry.xy[k]);
          maxX = Math.max(maxX, geometry.xy[k]);
          minY = Math.min(minY, geometry.xy[k + 1]);
          maxY = Math.max(maxY, geometry.xy[k + 1]);
        }
        const mesh = meshes[i];
        const offscreen = maxX < 0 || minX > view.width || maxY < 0 || minY > view.height;
        if (offscreen) {
          mesh.visible = false;
          continue;
        }
        const attribute = mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
        const ndc = attribute.array as Float32Array;
        let vertex = 0;
        for (let k = 0; k < geometry.xy.length; k += 2) {
          ndc[vertex] = (geometry.xy[k] / view.width) * 2 - 1;
          ndc[vertex + 1] = 1 - (geometry.xy[k + 1] / view.height) * 2;
          ndc[vertex + 2] = 0;
          vertex += 3;
        }
        attribute.needsUpdate = true;
        const member = ((i % CONTACT_COUNT) + CONTACT_COUNT) % CONTACT_COUNT;
        const material = mesh.material as THREE.MeshBasicMaterial;
        material.map = textures[member];
        const shade = 1 - 0.34 * smoothstep(0.12, 0.9, geometry.distance) * Math.max(0, Math.min(1, focus));
        material.color.setScalar(shade);
        mesh.visible = true;
        shapes.push({ xy: geometry.xy, distance: geometry.distance });
        placed.push({ mesh, depth: geometry.depth, distance: geometry.distance, member, xy: geometry.xy });
      }
      placed.sort((a, b) => b.depth - a.depth);
      placed.forEach((page, order) => {
        page.mesh.renderOrder = order;
      });
      renderer.render(scene, camera);
      const center = placed.find((page) => page.distance < 0.3);
      if (!center) return null;
      const corner = GRID_Y * (GRID_X + 1) * 2;
      return { member: center.member, x: center.xy[corner] + 12, y: center.xy[corner + 1] - 30 };
    };

    const api: DeckApi = {
      draw,
      resize,
      restGap: () => (view.phone ? PHONE_REST_GAP : DESK_REST_GAP),
      hit: (x, y) => shapes.some((shape) => shape.distance < 1.4 && contains(shape.xy, x, y)),
      step: () => {
        const gap = view.phone ? PHONE_REST_GAP : DESK_REST_GAP;
        const at = (member: number) => centroid(pageGeometry(2, scrollForMember(member), 0, gap, 1, view).xy);
        const from = at(2);
        const to = at(3);
        return { x: to.x - from.x, y: to.y - from.y };
      },
    };

    void Promise.all(CONTACT_MEMBERS.map((member) => loadImage(member.image))).then((loaded) => {
      if (disposed) return;
      images = loaded;
      rebuildTextures(view.phone);
      onReadyRef.current(api);
    }).catch(() => {
      onReadyRef.current(api);
    });

    return () => {
      disposed = true;
      for (const texture of textures) texture.dispose();
      for (const mesh of meshes) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
      renderer.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" />;
}
