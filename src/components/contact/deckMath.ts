/**
 * Orthographic card stack from the approved contact prototype.
 * Pages sit on one Z axis and an orthographic camera from the upper right
 * lays them on a single "/" diagonal. The centre page opens a gap, speed
 * bends the sheet, and the stack wraps.
 */

export const PAGE_COUNT = 30;
/** World-unit break on either side of the focused page. The rest of the stack stays one unit apart. */
export const DESK_REST_GAP = 10.4;
/** Phone pages are smaller in world units, so the same gap throws the neighbours off the deck band. */
export const PHONE_REST_GAP = 8.4;
/** Hero width, in CSS pixels, per pixel of deck height at scale 1. Measured from the projection. */
const PHONE_HERO_UNIT = 0.6022;
/** Focused page is this much larger than a stack page, and it eases in with scroll. */
export const HERO_BOOST = 0.42;
export const GRID_X = 14;
export const GRID_Y = 12;
export const CHAMFER_FRACTION = 15 / 240;

const MAX_Z = PAGE_COUNT * 1.01 * 0.5;
const FOCUS: readonly [number, number, number] = [0.06681, -0.36331, -0.51318];
const FRUSTUM = 10.8;

type Vec3 = [number, number, number];
type Mat3 = [Vec3, Vec3, Vec3];

export interface DeckView {
  readonly width: number;
  readonly height: number;
  readonly phone: boolean;
  readonly originX?: number;
  readonly originY?: number;
  /** Desktop hero scale. 1 is the full card; a lower value keeps it off the side columns. */
  readonly fit?: number;
}

export interface PageGeometry {
  readonly xy: Float32Array;
  readonly depth: number;
  readonly distance: number;
  readonly flat: number;
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function normalize(a: Vec3): Vec3 {
  const length = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / length, a[1] / length, a[2] / length];
}

function multiply(a: Mat3, b: Mat3): Mat3 {
  return a.map((row) =>
    [0, 1, 2].map((column) => row[0] * b[0][column] + row[1] * b[1][column] + row[2] * b[2][column]) as Vec3,
  ) as Mat3;
}

function apply(matrix: Mat3, vector: Vec3): Vec3 {
  return matrix.map((row) => row[0] * vector[0] + row[1] * vector[1] + row[2] * vector[2]) as Vec3;
}

function rotateX(angle: number): Mat3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [[1, 0, 0], [0, c, -s], [0, s, c]];
}

function rotateY(angle: number): Mat3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [[c, 0, s], [0, 1, 0], [-s, 0, c]];
}

function rotateZ(angle: number): Mat3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [[c, -s, 0], [s, c, 0], [0, 0, 1]];
}

function smooth(start: number, end: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

interface Scale {
  readonly depth: number;
  readonly height: number;
  readonly pivotX: number;
  readonly curve: number;
  readonly scale: number;
  readonly originX: number;
  readonly originY: number;
}

/** Phone hero width as a share of the viewport. The deck band stays where it is. */
const PHONE_HERO_WIDTH = 0.72;

function scaleFor(view: DeckView): Scale {
  if (!view.phone) {
    return {
      depth: 4.492,
      height: 3.658,
      pivotX: 4.3,
      curve: 2.25,
      scale: view.fit ?? 1,
      originX: view.originX ?? 0,
      originY: view.originY ?? 0,
    };
  }
  const byWidth = view.width * PHONE_HERO_WIDTH;
  const byHeight = view.height * (0.9 * PHONE_HERO_WIDTH / 0.82) * 1.253;
  const target = Math.min(byWidth, byHeight);
  return {
    depth: 4.492,
    height: 3.658,
    pivotX: 4.3,
    curve: 1.15,
    scale: target / (PHONE_HERO_UNIT * Math.max(view.height, 1)),
    originX: view.originX ?? 0,
    originY: view.originY ?? 0,
  };
}

const MESH = multiply(multiply(rotateX(-0.0215), rotateY(2.2884)), rotateZ(0.2884));
const EYE: Vec3 = [20, 12.1, 16.6];
const LOOK: Vec3 = [-7, -2.1, 1.3];
const FORWARD = normalize(sub(LOOK, EYE));
const RIGHT = normalize(cross(FORWARD, [0, 1, 0]));
const UP = cross(RIGHT, FORWARD);

function project(point: Vec3, view: DeckView, scale: Scale): [number, number, number] {
  const q = sub(point, EYE);
  const aspect = view.width / Math.max(view.height, 1);
  const x = ((dot(q, RIGHT) / (FRUSTUM * aspect / 2)) * 0.5 + 0.5) * view.width * scale.scale + scale.originX;
  const y = (0.5 - (dot(q, UP) / (FRUSTUM / 2)) * 0.5) * view.height * scale.scale + scale.originY;
  return [x, y, dot(q, FORWARD)];
}

export function pageGeometry(
  index: number,
  scroll: number,
  speed: number,
  gap: number,
  focusAmount: number,
  view: DeckView,
  swing = 0,
): PageGeometry {
  const scale = scaleFor(view);
  const base = -(index - (PAGE_COUNT - 1) * 0.5);
  const wrapped = ((base - scroll + MAX_Z) % (2 * MAX_Z) + 2 * MAX_Z) % (2 * MAX_Z) - MAX_Z;
  const distance = Math.abs(wrapped);
  const fit = view.fit ?? 1;
  // Pixel offset grows with the hero. Pull the world gap back so a neighbour still peeks in.
  const usedGap = view.phone ? gap * 0.8 : gap * (0.9 / Math.max(fit, 0.55));
  const balance = wrapped >= 0 ? 1 : view.phone ? 0.74 : 0.82;
  const opened = wrapped + (wrapped < 0 ? -1 : 1) * smooth(0.08, 0.92, distance) * usedGap * balance;
  const hero = 1 + HERO_BOOST * (1 - smooth(0.02, 0.88, distance)) * focusAmount;
  const facing = smooth(0, 1, 1 - smooth(0, 0.8, distance)) * focusAmount;
  const focus = multiply(
    multiply(rotateZ(FOCUS[2] * facing), rotateY(-FOCUS[1] * facing)),
    rotateX(-FOCUS[0] * facing),
  );
  const bend = Math.max(-2, Math.min(2, speed * 2)) * scale.curve;
  const xy = new Float32Array((GRID_X + 1) * (GRID_Y + 1) * 2);
  let cursor = 0;
  let depthSum = 0;
  const position: Vec3 = [scale.pivotX, 2.1, 5.1];
  // Pull the focused page toward the eye. The projection is orthographic, so this
  // changes depth (it paints in front) and not the page's place on screen.
  const lift = (hero - 1) * 28;
  for (let gy = 0; gy <= GRID_Y; gy += 1) {
    const unitY = scale.height / 2 - (scale.height * gy) / GRID_Y;
    const localY = unitY * hero;
    const along = opened - Math.sin(((unitY + scale.height / 2) / scale.height) * 2) * 0.4 * bend;
    for (let gx = 0; gx <= GRID_X; gx += 1) {
      const localX = scale.depth / 2 - (scale.depth * gx) / GRID_X;
      const centerZ = -scale.depth / 2 - 1;
      let vector: Vec3 = [along - scale.depth / 2, localY, centerZ - localX * hero];
      vector = apply(focus, vector);
      vector = [vector[0] + scale.depth / 2, vector[1], vector[2]];
      const world = apply(MESH, vector);
      const projected = project(
        [
          world[0] + position[0] - FORWARD[0] * lift,
          world[1] + position[1] - FORWARD[1] * lift,
          world[2] + position[2] - FORWARD[2] * lift,
        ],
        view,
        scale,
      );
      xy[cursor] = projected[0];
      xy[cursor + 1] = projected[1];
      cursor += 2;
      depthSum += projected[2];
    }
  }
  const samples = (GRID_X + 1) * (GRID_Y + 1);
  if (swing !== 0) {
    let originX = 0;
    let originY = 0;
    for (let point = 0; point < xy.length; point += 2) {
      originX += xy[point];
      originY += xy[point + 1];
    }
    originX /= samples;
    originY /= samples;
    const cosine = Math.cos(swing);
    const sine = Math.sin(swing);
    for (let point = 0; point < xy.length; point += 2) {
      const localX = xy[point] - originX;
      const localY = xy[point + 1] - originY;
      xy[point] = originX + localX * cosine - localY * sine;
      xy[point + 1] = originY + localX * sine + localY * cosine;
    }
  }
  const boost: number = HERO_BOOST;
  const focusWeight = boost === 0 ? 0 : (hero - 1) / boost;
  return { xy, depth: depthSum / samples - focusWeight * 30, distance, flat: wrapped };
}

export function scrollForMember(member: number): number {
  return (PAGE_COUNT - 1) * 0.5 - member;
}

function boundsOf(index: number, view: DeckView): { minX: number; maxX: number; minY: number; maxY: number } {
  const page = pageGeometry(index, scrollForMember(2), 0, PHONE_REST_GAP, 1, view);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < page.xy.length; i += 2) {
    minX = Math.min(minX, page.xy[i]);
    maxX = Math.max(maxX, page.xy[i]);
    minY = Math.min(minY, page.xy[i + 1]);
    maxY = Math.max(maxY, page.xy[i + 1]);
  }
  return { minX, maxX, minY, maxY };
}

/** Centre the phone hero in the deck band. The band itself starts below the header. */
export function phoneView(width: number, height: number): DeckView {
  const bare: DeckView = { width, height, phone: true, originX: 0, originY: 0 };
  const page = boundsOf(2, bare);
  return {
    width,
    height,
    phone: true,
    originX: width * 0.5 - (page.minX + page.maxX) / 2,
    originY: height * 0.5 - (page.minY + page.maxY) / 2,
  };
}

function placeDesk(width: number, height: number, fit: number): DeckView {
  const bare: DeckView = { width, height, phone: false, originX: 0, originY: 0, fit };
  const page = boundsOf(2, bare);
  return {
    width,
    height,
    phone: false,
    fit,
    originX: width * 0.5 - (page.minX + page.maxX) / 2,
    originY: height * 0.5 - (page.minY + page.maxY) / 2,
  };
}

function clampNum(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * The hero stays between the left odometer and the team list.
 * The odometer block is 274px at every desktop width (200px digits plus /06).
 */
function deskLimits(width: number, height: number) {
  const rail = clampNum(width * 0.07, 72, 112);
  const listWidth = clampNum(width * 0.25, 220, 360);
  // 32px at 1366, back to 40px by 1440 so the approved wider desktops stay put.
  const gutter = clampNum(32 + ((width - 1366) * 8) / 74, 32, 40);
  return {
    left: rail + 274 + gutter,
    right: width - rail - listWidth - gutter,
    top: height * 0.16,
    bottom: height * 0.84,
  };
}

/** Largest centred hero that keeps a gap to both columns and stays on the screen. */
export function deskView(width: number, height: number): DeckView {
  const limits = deskLimits(width, height);
  let low = 0.55;
  let high = 1.85;
  let best = placeDesk(width, height, low);
  for (let step = 0; step < 16; step += 1) {
    const fit = (low + high) / 2;
    const view = placeDesk(width, height, fit);
    const box = boundsOf(2, view);
    const fits = box.minX >= limits.left && box.maxX <= limits.right && box.minY >= limits.top && box.maxY <= limits.bottom;
    if (fits) {
      low = fit;
      best = view;
    } else high = fit;
  }
  return best;
}

export function viewFor(width: number, height: number, phone: boolean): DeckView {
  if (phone) return phoneView(width, height);
  return deskView(width, height);
}
