import type { Apartment, Point } from '../domain/types';
import { getRoomBounds } from '../domain/geometry';

/**
 * Photo of the user's floor plan shown under the 2D plan as a tracing reference.
 * It never enters the apartment model or the undo history: walls are still moved by the user.
 * Image pixels map to plan centimetres as: plan = origin + R(rotation) · (cmPerPx · pixel).
 */
export type UnderlayRotation = 0 | 90 | 180 | 270;
export interface UnderlaySource { url: string; name: string; widthPx: number; heightPx: number }
export interface Underlay extends UnderlaySource {
  xCm: number; zCm: number; cmPerPx: number; rotation: UnderlayRotation;
  opacity: number; invert: boolean; visible: boolean;
  /** False until the photo has been placed over a project. */
  fitted: boolean;
}
export type UnderlayTool = 'none' | 'move' | 'calibrate';

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/avif'];
export const MAX_IMAGE_BYTES = 40 * 1024 * 1024;

export function createUnderlay(source: UnderlaySource): Underlay {
  return { ...source, xCm: 0, zCm: 0, cmPerPx: 1, rotation: 0, opacity: 0.6, invert: true, visible: true, fitted: false };
}

const rotateVector = (x: number, z: number, rotation: UnderlayRotation): Point => {
  const r = rotation * Math.PI / 180, c = Math.round(Math.cos(r)), s = Math.round(Math.sin(r));
  return { xCm: x * c - z * s, zCm: x * s + z * c };
};

export function imageToPlan(u: Underlay, px: number, py: number): Point {
  const v = rotateVector(px * u.cmPerPx, py * u.cmPerPx, u.rotation);
  return { xCm: u.xCm + v.xCm, zCm: u.zCm + v.zCm };
}

export function planToImage(u: Underlay, p: Point): { px: number; py: number } {
  const back = ((360 - u.rotation) % 360) as UnderlayRotation;
  const v = rotateVector(p.xCm - u.xCm, p.zCm - u.zCm, back);
  return { px: v.xCm / u.cmPerPx, py: v.zCm / u.cmPerPx };
}

/** Rectangle covered by the photo in plan centimetres. */
export function underlayBounds(u: Underlay) {
  const corners = [imageToPlan(u, 0, 0), imageToPlan(u, u.widthPx, 0), imageToPlan(u, u.widthPx, u.heightPx), imageToPlan(u, 0, u.heightPx)];
  return { xMin: Math.min(...corners.map(c => c.xCm)), xMax: Math.max(...corners.map(c => c.xCm)), zMin: Math.min(...corners.map(c => c.zCm)), zMax: Math.max(...corners.map(c => c.zCm)) };
}

/**
 * First guess before calibration: a plan photo usually has margins around the walls,
 * so the photo is made about a fifth larger than the apartment and centred on it.
 */
export function fitUnderlay(u: Underlay, project: Apartment): Underlay {
  const bounds = project.rooms.map(r => getRoomBounds(project, r.id, false));
  const xMin = Math.min(...bounds.map(b => b.xMin)), xMax = Math.max(...bounds.map(b => b.xMax));
  const zMin = Math.min(...bounds.map(b => b.zMin)), zMax = Math.max(...bounds.map(b => b.zMax));
  const turned = u.rotation === 90 || u.rotation === 270;
  const w = turned ? u.heightPx : u.widthPx, h = turned ? u.widthPx : u.heightPx;
  const cmPerPx = Math.max((xMax - xMin) / w, (zMax - zMin) / h) * 1.2;
  const placed = { ...u, cmPerPx, xCm: 0, zCm: 0, fitted: true };
  const b = underlayBounds(placed);
  return { ...placed, xCm: (xMin + xMax) / 2 - (b.xMin + b.xMax) / 2, zCm: (zMin + zMax) / 2 - (b.zMin + b.zMax) / 2 };
}

/** Scale the photo about a plan point that must stay where it is. */
export function scaleUnderlayAbout(u: Underlay, anchor: Point, factor: number): Underlay {
  return { ...u, cmPerPx: u.cmPerPx * factor, xCm: anchor.xCm + factor * (u.xCm - anchor.xCm), zCm: anchor.zCm + factor * (u.zCm - anchor.zCm) };
}

/** Turn the photo by 90° clockwise around its centre. */
export function rotateUnderlay(u: Underlay): Underlay {
  const centre = imageToPlan(u, u.widthPx / 2, u.heightPx / 2);
  const rotation = ((u.rotation + 90) % 360) as UnderlayRotation;
  const offset = rotateVector(u.widthPx / 2 * u.cmPerPx, u.heightPx / 2 * u.cmPerPx, rotation);
  return { ...u, rotation, xCm: centre.xCm - offset.xCm, zCm: centre.zCm - offset.zCm };
}

/** Make the measured segment between two plan points equal to the real length; the first point stays fixed. */
export function calibrateUnderlay(u: Underlay, a: Point, b: Point, realCm: number): Underlay | null {
  const measured = Math.hypot(b.xCm - a.xCm, b.zCm - a.zCm);
  if (!(measured > 1) || !(realCm > 0) || !Number.isFinite(realCm)) return null;
  return scaleUnderlayAbout(u, a, realCm / measured);
}

/** Read a picked or dropped file into an object URL with its pixel size. */
export async function readPlanImage(file: File): Promise<UnderlaySource> {
  const heic = /\.(heic|heif)$/i.test(file.name) || /heic|heif/i.test(file.type);
  if (heic) throw new Error('Формат HEIC браузер не открывает. Сохраните фото как JPG или сделайте скриншот.');
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) throw new Error('PDF не поддерживается. Загрузите фото или скриншот плана в JPG или PNG.');
  if (file.type && !ACCEPTED_IMAGE_TYPES.includes(file.type)) throw new Error('Нужен файл изображения: JPG, PNG или WebP.');
  if (file.size > MAX_IMAGE_BYTES) throw new Error('Файл больше 40 МБ. Уменьшите фото или сделайте скриншот.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('empty');
    return { url, name: file.name || 'План', widthPx: image.naturalWidth, heightPx: image.naturalHeight };
  } catch {
    URL.revokeObjectURL(url);
    throw new Error('Не удалось открыть изображение. Подойдут JPG, PNG или WebP.');
  }
}
