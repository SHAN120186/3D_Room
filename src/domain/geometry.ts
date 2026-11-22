import type { Apartment, CatalogItem, Collider, FurnitureInstance, GeometryPreview, Opening, Point, Rect, Validation } from './types';
import { getCatalogItem, TABLETOP_SUPPORT_KINDS } from './catalog';

export const EPS = 0.01;
export const VALID: Validation = { valid: true };
const fail = (code: string, reason: string, conflicts: string[] = []): Validation => ({ valid: false, code, reason, conflicts });
export const cmToM = (cm: number) => cm / 100;
export const squareCmToM2 = (cm2: number) => cm2 / 10000;
export function parseCm(value: string | number, min: number, max: number): number | null {
  const raw = String(value).trim().replace(',', '.');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)) return null;
  const result = Math.round(Number(raw));
  return Number.isFinite(result) && result >= min && result <= max ? result : null;
}
export function getWallSegment(project: Apartment, wallId: string) {
  const wall = project.walls[wallId];
  if (!wall) throw new Error(`Стена ${wallId} не найдена`);
  const start = project.vertices[wall.startId];
  const end = project.vertices[wall.endId];
  if (!start || !end) throw new Error('У стены отсутствует вершина');
  return { start, end, lengthCm: Math.hypot(end.xCm - start.xCm, end.zCm - start.zCm), horizontal: Math.abs(end.zCm - start.zCm) <= EPS };
}
export function wallRoomIds(project: Apartment, wallId: string): string[] {
  return project.rooms.filter(room => room.boundary.some(edge => edge.wallId === wallId)).map(room => room.id);
}
export function getRoomBounds(project: Apartment, roomId: string, inner = true): Rect {
  const room = project.rooms.find(r => r.id === roomId);
  if (!room) throw new Error('Комната не найдена');
  const points = room.boundary.flatMap(edge => { const s = getWallSegment(project, edge.wallId); return [s.start, s.end]; });
  const axis: Rect = { xMin: Math.min(...points.map(p => p.xCm)), xMax: Math.max(...points.map(p => p.xCm)), zMin: Math.min(...points.map(p => p.zCm)), zMax: Math.max(...points.map(p => p.zCm)) };
  if (!inner) return axis;
  let left = 0, right = 0, top = 0, bottom = 0;
  for (const edge of room.boundary) {
    const s = getWallSegment(project, edge.wallId), half = project.walls[edge.wallId].thicknessCm / 2;
    if (s.horizontal) { if (Math.abs(s.start.zCm - axis.zMin) < EPS) top = Math.max(top, half); else bottom = Math.max(bottom, half); }
    else { if (Math.abs(s.start.xCm - axis.xMin) < EPS) left = Math.max(left, half); else right = Math.max(right, half); }
  }
  return { xMin: axis.xMin + left, xMax: axis.xMax - right, zMin: axis.zMin + top, zMax: axis.zMax - bottom };
}
export const getRoomArea = (project: Apartment, roomId: string): number => { const b = getRoomBounds(project, roomId); return (b.xMax - b.xMin) * (b.zMax - b.zMin) / 10000; };
export const getNetArea = (project: Apartment): number => project.rooms.reduce((sum, room) => sum + getRoomArea(project, room.id), 0);
export function getGrossArea(project: Apartment): number {
  const rectangles: Rect[] = project.rooms.map(room => getRoomBounds(project, room.id, false));
  for (const wall of Object.values(project.walls)) {
    const { start, end } = getWallSegment(project, wall.id), half = wall.thicknessCm / 2;
    rectangles.push({ xMin: Math.min(start.xCm, end.xCm) - half, xMax: Math.max(start.xCm, end.xCm) + half, zMin: Math.min(start.zCm, end.zCm) - half, zMax: Math.max(start.zCm, end.zCm) + half });
  }
  const xs = [...new Set(rectangles.flatMap(r => [r.xMin, r.xMax]))].sort((a, b) => a - b);
  let area = 0;
  for (let i = 1; i < xs.length; i++) {
    const x = (xs[i - 1] + xs[i]) / 2;
    const spans = rectangles.filter(r => x > r.xMin && x < r.xMax).map(r => [r.zMin, r.zMax]).sort((a, b) => a[0] - b[0]);
    let length = 0, start = 0, end = 0, first = true;
    for (const span of spans) { if (first) { [start, end] = span; first = false; } else if (span[0] <= end) end = Math.max(end, span[1]); else { length += end - start; [start, end] = span; } }
    if (!first) length += end - start;
    area += (xs[i] - xs[i - 1]) * length;
  }
  return area / 10000;
}
export function openingWorld(project: Apartment, opening: Opening) {
  const { start, end, lengthCm } = getWallSegment(project, opening.wallId);
  const dx = (end.xCm - start.xCm) / lengthCm, dz = (end.zCm - start.zCm) / lengthCm;
  const a = { xCm: start.xCm + dx * opening.offsetCm, zCm: start.zCm + dz * opening.offsetCm };
  const b = { xCm: a.xCm + dx * opening.widthCm, zCm: a.zCm + dz * opening.widthCm };
  return { start: a, end: b, center: { xCm: (a.xCm + b.xCm) / 2, zCm: (a.zCm + b.zCm) / 2 } };
}
export function rotatePoint(point: Point, angleDeg: number): Point {
  const a = angleDeg * Math.PI / 180;
  return { xCm: point.xCm * Math.cos(a) - point.zCm * Math.sin(a), zCm: point.xCm * Math.sin(a) + point.zCm * Math.cos(a) };
}
export function boxCorners(x: number, z: number, width: number, depth: number, angle: number): Point[] {
  return [[-width / 2, -depth / 2], [width / 2, -depth / 2], [width / 2, depth / 2], [-width / 2, depth / 2]].map(([px, pz]) => { const q = rotatePoint({ xCm: px, zCm: pz }, angle); return { xCm: x + q.xCm, zCm: z + q.zCm }; });
}
export function polygonsOverlap(a: Point[], b: Point[], epsilon = EPS): boolean {
  for (const polygon of [a, b]) for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i], q = polygon[(i + 1) % polygon.length], dx = q.xCm - p.xCm, dz = q.zCm - p.zCm, len = Math.hypot(dx, dz);
    if (len <= EPS) continue;
    const axisX = -dz / len, axisZ = dx / len;
    const ap = a.map(v => v.xCm * axisX + v.zCm * axisZ), bp = b.map(v => v.xCm * axisX + v.zCm * axisZ);
    if (Math.min(Math.max(...ap), Math.max(...bp)) - Math.max(Math.min(...ap), Math.min(...bp)) <= epsilon) return false;
  }
  return true;
}
export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.zCm > point.zCm) !== (b.zCm > point.zCm) && point.xCm < (b.xCm - a.xCm) * (point.zCm - a.zCm) / (b.zCm - a.zCm) + a.xCm) inside = !inside;
  }
  return inside;
}
function clipPositive(polygon: Point[], key: 'xCm' | 'zCm'): Point[] {
  const result: Point[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length], aIn = a[key] >= 0, bIn = b[key] >= 0;
    if (aIn) result.push(a);
    if (aIn !== bIn) { const t = a[key] / (a[key] - b[key]); result.push({ xCm: a.xCm + (b.xCm - a.xCm) * t, zCm: a.zCm + (b.zCm - a.zCm) * t }); }
  }
  return result;
}
function sectorOverlap(polygon: Point[], hinge: Point, u: Point, n: Point, radius: number): boolean {
  let clipped = polygon.map(p => { const x = p.xCm - hinge.xCm, z = p.zCm - hinge.zCm; return { xCm: x * u.xCm + z * u.zCm, zCm: x * n.xCm + z * n.zCm }; });
  clipped = clipPositive(clipPositive(clipped, 'xCm'), 'zCm');
  if (clipped.length < 3) return false;
  const signedArea = clipped.reduce((s, p, i) => { const q = clipped[(i + 1) % clipped.length]; return s + p.xCm * q.zCm - q.xCm * p.zCm; }, 0);
  if (Math.abs(signedArea) < EPS * EPS) return false;
  let closest = pointInPolygon({ xCm: 0, zCm: 0 }, clipped) ? 0 : Infinity;
  for (let i = 0; i < clipped.length; i++) {
    const a = clipped[i], b = clipped[(i + 1) % clipped.length], dx = b.xCm - a.xCm, dz = b.zCm - a.zCm, l2 = dx * dx + dz * dz;
    const t = l2 ? Math.max(0, Math.min(1, -(a.xCm * dx + a.zCm * dz) / l2)) : 0;
    closest = Math.min(closest, Math.hypot(a.xCm + t * dx, a.zCm + t * dz));
  }
  return closest < radius - EPS;
}
export function furnitureCorners(instance: FurnitureInstance, item = getCatalogItem(instance.catalogItemId)) { return boxCorners(instance.xCm, instance.zCm, item.widthCm, item.depthCm, instance.angleDeg); }
function collisionBoxes(instance: FurnitureInstance, item: CatalogItem) {
  const boxes: Collider[] = item.colliders ?? [{ xCm: 0, zCm: 0, yCm: item.heightCm / 2, widthCm: item.widthCm, depthCm: item.depthCm, heightCm: item.heightCm }];
  return boxes.map(c => { const offset = rotatePoint(c, instance.angleDeg); return { polygon: boxCorners(instance.xCm + offset.xCm, instance.zCm + offset.zCm, c.widthCm, c.depthCm, instance.angleDeg), minY: instance.yCm + c.yCm - c.heightCm / 2, maxY: instance.yCm + c.yCm + c.heightCm / 2 }; });
}
export function furnitureIntersect(a: FurnitureInstance, b: FurnitureInstance): boolean {
  const ia = getCatalogItem(a.catalogItemId), ib = getCatalogItem(b.catalogItemId);
  if ((ia.layer === 'rug') !== (ib.layer === 'rug')) return false;
  return collisionBoxes(a, ia).some(ca => collisionBoxes(b, ib).some(cb => Math.min(ca.maxY, cb.maxY) - Math.max(ca.minY, cb.minY) > EPS && polygonsOverlap(ca.polygon, cb.polygon)));
}
const TABLETOPS = TABLETOP_SUPPORT_KINDS;
export function normalizeSupport(project: Apartment, instance: FurnitureInstance): FurnitureInstance {
  const item = getCatalogItem(instance.catalogItemId), next = { ...instance };
  const bounds = getRoomBounds(project, next.roomId);
  delete next.wallId; delete next.supportId;
  if (item.placement === 'floor') next.yCm = 0;
  if (item.placement === 'ceiling') next.yCm = project.ceilingHeightCm - item.heightCm;
  if (item.placement === 'wall') {
    const room = project.rooms.find(r => r.id === next.roomId)!;
    const choices = room.boundary.map(edge => {
      const segment = getWallSegment(project, edge.wallId);
      if (segment.horizontal) {
        const isTop = Math.abs(segment.start.zCm - getRoomBounds(project, next.roomId, false).zMin) < EPS;
        const z = isTop ? bounds.zMin + item.depthCm / 2 : bounds.zMax - item.depthCm / 2;
        const x = Math.max(Math.min(segment.start.xCm, segment.end.xCm) + item.widthCm / 2, Math.min(Math.max(segment.start.xCm, segment.end.xCm) - item.widthCm / 2, next.xCm));
        return { xCm: x, zCm: z, angleDeg: isTop ? 0 : 180, wallId: edge.wallId, distance: Math.hypot(x - next.xCm, z - next.zCm) };
      }
      const isLeft = Math.abs(segment.start.xCm - getRoomBounds(project, next.roomId, false).xMin) < EPS;
      const x = isLeft ? bounds.xMin + item.depthCm / 2 : bounds.xMax - item.depthCm / 2;
      const z = Math.max(Math.min(segment.start.zCm, segment.end.zCm) + item.widthCm / 2, Math.min(Math.max(segment.start.zCm, segment.end.zCm) - item.widthCm / 2, next.zCm));
      return { xCm: x, zCm: z, angleDeg: isLeft ? 270 : 90, wallId: edge.wallId, distance: Math.hypot(x - next.xCm, z - next.zCm) };
    }).sort((a, b) => a.distance - b.distance);
    const chosen = choices[0];
    next.xCm = chosen.xCm; next.zCm = chosen.zCm; next.angleDeg = chosen.angleDeg; next.wallId = chosen.wallId; next.yCm = item.mountHeightCm ?? 135;
  }
  if (item.placement === 'tabletop') {
    const support = project.furniture.find(f => f.id !== next.id && f.roomId === next.roomId && TABLETOPS.has(getCatalogItem(f.catalogItemId).kind) && pointInPolygon(next, furnitureCorners(f)));
    next.supportId = support?.id;
    next.yCm = support ? support.yCm + getCatalogItem(support.catalogItemId).heightCm : 0;
  }
  return next;
}
export function validateFurniture(project: Apartment, instance: FurnitureInstance): Validation {
  let item: CatalogItem;
  try { item = getCatalogItem(instance.catalogItemId); } catch { return fail('unknown-item', 'Предмет отсутствует в каталоге', [instance.id]); }
  const room = project.rooms.find(r => r.id === instance.roomId);
  if (!room) return fail('room', 'Комната предмета не найдена', [instance.id]);
  if (![instance.xCm, instance.yCm, instance.zCm, instance.angleDeg].every(Number.isFinite)) return fail('number', 'Координаты предмета должны быть конечными числами', [instance.id]);
  const bounds = getRoomBounds(project, instance.roomId), footprint = furnitureCorners(instance, item);
  if (footprint.some(p => p.xCm < bounds.xMin - EPS || p.xCm > bounds.xMax + EPS || p.zCm < bounds.zMin - EPS || p.zCm > bounds.zMax + EPS)) return fail('outside-room', `«${item.name}» выходит за стену в комнате «${room.name}»`, [instance.id, room.id]);
  if (instance.yCm < -EPS || instance.yCm + item.heightCm > project.ceilingHeightCm + EPS) return fail('height', `«${item.name}» не помещается по высоте`, [instance.id]);
  if (item.placement === 'floor' && Math.abs(instance.yCm) > EPS) return fail('support', 'Этот предмет должен стоять на полу', [instance.id]);
  if (item.placement === 'ceiling' && Math.abs(instance.yCm + item.heightCm - project.ceilingHeightCm) > EPS) return fail('support', 'Светильник должен крепиться к потолку', [instance.id]);
  if (item.placement === 'wall') {
    if (!instance.wallId || !wallRoomIds(project, instance.wallId).includes(room.id)) return fail('support', 'Выберите стену для настенного предмета', [instance.id]);
    const normal = normalizeSupport(project, instance);
    if (Math.hypot(normal.xCm - instance.xCm, normal.zCm - instance.zCm) > EPS || Math.abs(normal.angleDeg - instance.angleDeg) > EPS) return fail('support', 'Задняя сторона предмета должна примыкать к стене', [instance.id]);
    const wall = getWallSegment(project, instance.wallId);
    for (const opening of project.openings.filter(o => o.wallId === instance.wallId)) {
      const o = openingWorld(project, opening);
      const min = wall.horizontal ? Math.min(...footprint.map(p => p.xCm)) : Math.min(...footprint.map(p => p.zCm));
      const max = wall.horizontal ? Math.max(...footprint.map(p => p.xCm)) : Math.max(...footprint.map(p => p.zCm));
      const omin = wall.horizontal ? Math.min(o.start.xCm, o.end.xCm) : Math.min(o.start.zCm, o.end.zCm);
      if (Math.min(max, omin + opening.widthCm) - Math.max(min, omin) > EPS && Math.min(instance.yCm + item.heightCm, opening.sillCm + opening.heightCm) - Math.max(instance.yCm, opening.sillCm) > EPS) return fail('opening', `«${item.name}» перекрывает ${opening.kind === 'door' ? 'дверь' : 'окно'}`, [instance.id, opening.id]);
    }
  }
  if (item.placement === 'tabletop') {
    const support = project.furniture.find(f => f.id === instance.supportId && f.roomId === room.id);
    if (!support || !TABLETOPS.has(getCatalogItem(support.catalogItemId).kind)) return fail('support', 'Поставьте настольную лампу на стол или тумбу', [instance.id]);
    const supportItem = getCatalogItem(support.catalogItemId), local = footprint.map(p => rotatePoint({ xCm: p.xCm - support.xCm, zCm: p.zCm - support.zCm }, -support.angleDeg));
    if (local.some(p => Math.abs(p.xCm) > supportItem.widthCm / 2 + EPS || Math.abs(p.zCm) > supportItem.depthCm / 2 + EPS) || Math.abs(instance.yCm - support.yCm - supportItem.heightCm) > EPS) return fail('support', 'Лампа должна полностью помещаться на столешнице', [instance.id, support.id]);
  }
  if (item.layer !== 'rug') for (const door of project.openings.filter(o => o.kind === 'door' && wallRoomIds(project, o.wallId).includes(room.id))) {
    if (instance.yCm >= door.heightCm - EPS) continue;
    const { center, start, end } = openingWorld(project, door), wall = getWallSegment(project, door.wallId), half = project.walls[door.wallId].thicknessCm / 2;
    const threshold = boxCorners(center.xCm, center.zCm, door.widthCm, 60 + half * 2, wall.horizontal ? 0 : 90);
    if (polygonsOverlap(footprint, threshold)) return fail('door-clearance', `«${item.name}» перекрывает проход у двери (30 см)`, [instance.id, door.id]);
    if (door.swingRoomId === room.id) {
      const hinge = door.hinge === 'start' ? start : end, other = door.hinge === 'start' ? end : start;
      const u = { xCm: (other.xCm - hinge.xCm) / door.widthCm, zCm: (other.zCm - hinge.zCm) / door.widthCm };
      const middle = { xCm: (bounds.xMin + bounds.xMax) / 2, zCm: (bounds.zMin + bounds.zMax) / 2 };
      const n = wall.horizontal ? { xCm: 0, zCm: middle.zCm > center.zCm ? 1 : -1 } : { xCm: middle.xCm > center.xCm ? 1 : -1, zCm: 0 };
      if (sectorOverlap(footprint, hinge, u, n, door.widthCm)) return fail('door-swing', `«${item.name}» мешает открыванию двери`, [instance.id, door.id]);
    }
  }
  for (const other of project.furniture) {
    if (other.id === instance.id || other.roomId !== room.id) continue;
    if (furnitureIntersect(instance, other)) return fail('collision', `«${item.name}» пересекается с предметом «${getCatalogItem(other.catalogItemId).name}»`, [instance.id, other.id]);
  }
  return VALID;
}
export function validateApartment(project: Apartment): Validation {
  try {
    if (!Number.isFinite(project.ceilingHeightCm) || project.ceilingHeightCm < 220 || project.ceilingHeightCm > 400) return fail('ceiling', 'Высота потолка должна быть от 220 до 400 см');
    const coordinates = new Set<string>(), wallKeys = new Set<string>();
    for (const vertex of Object.values(project.vertices)) {
      if (![vertex.xCm, vertex.zCm].every(Number.isFinite)) return fail('vertex', 'Координаты вершины должны быть конечными числами', [vertex.id]);
      const key = `${vertex.xCm.toFixed(4)},${vertex.zCm.toFixed(4)}`;
      if (coordinates.has(key)) return fail('duplicate-vertex', 'Одна вершина квартиры продублирована', [vertex.id]);
      coordinates.add(key);
    }
    for (const wall of Object.values(project.walls)) {
      const segment = getWallSegment(project, wall.id);
      if (segment.lengthCm <= EPS || !Number.isFinite(wall.thicknessCm) || wall.thicknessCm <= 0) return fail('wall', 'У стены должна быть положительная длина и толщина', [wall.id]);
      if (Math.abs(segment.end.xCm - segment.start.xCm) > EPS && Math.abs(segment.end.zCm - segment.start.zCm) > EPS) return fail('diagonal', 'Комнаты должны оставаться прямоугольными', [wall.id]);
      const key = [wall.startId, wall.endId].sort().join(':');
      if (wallKeys.has(key)) return fail('duplicate-wall', 'Общая стена не должна дублироваться', [wall.id]);
      wallKeys.add(key);
      const roomIds = wallRoomIds(project, wall.id);
      if (roomIds.length < 1 || roomIds.length > 2) return fail('adjacency', 'У стены неверная связь с комнатами', [wall.id]);
    }
    if (project.rooms.length === 0 || new Set(project.rooms.map(r => r.id)).size !== project.rooms.length) return fail('rooms', 'У квартиры должны быть комнаты с уникальными идентификаторами');
    for (const room of project.rooms) {
      if (room.boundary.length < 4) return fail('contour', `Не замкнут контур комнаты «${room.name}»`, [room.id]);
      const b = getRoomBounds(project, room.id), axis = getRoomBounds(project, room.id, false);
      const width = b.xMax - b.xMin, depth = b.zMax - b.zMin;
      if (width < 80 - EPS || depth < 80 - EPS || width > 1500 + EPS || depth > 1500 + EPS) return fail('room-size', `Размеры комнаты «${room.name}» должны быть от 80 до 1500 см`, [room.id]);
      let signedArea = 0;
      for (let i = 0; i < room.boundary.length; i++) {
        const edge = room.boundary[i], nextEdge = room.boundary[(i + 1) % room.boundary.length];
        const wall = project.walls[edge.wallId], nextWall = project.walls[nextEdge.wallId];
        const a = project.vertices[edge.forward ? wall.startId : wall.endId], endId = edge.forward ? wall.endId : wall.startId, c = project.vertices[endId];
        if (endId !== (nextEdge.forward ? nextWall.startId : nextWall.endId)) return fail('contour', `Не замкнут контур комнаты «${room.name}»`, [room.id]);
        if (!((Math.abs(a.xCm - axis.xMin) < EPS && Math.abs(c.xCm - axis.xMin) < EPS) || (Math.abs(a.xCm - axis.xMax) < EPS && Math.abs(c.xCm - axis.xMax) < EPS) || (Math.abs(a.zCm - axis.zMin) < EPS && Math.abs(c.zCm - axis.zMin) < EPS) || (Math.abs(a.zCm - axis.zMax) < EPS && Math.abs(c.zCm - axis.zMax) < EPS))) return fail('rectangle', `Комната «${room.name}» должна остаться прямоугольной`, [room.id]);
        signedArea += a.xCm * c.zCm - c.xCm * a.zCm;
      }
      if (Math.abs(Math.abs(signedArea) / 2 - (axis.xMax - axis.xMin) * (axis.zMax - axis.zMin)) > EPS) return fail('rectangle', `Контур комнаты «${room.name}» пересекает сам себя`, [room.id]);
    }
    for (let i = 0; i < project.rooms.length; i++) for (let j = i + 1; j < project.rooms.length; j++) {
      const a = getRoomBounds(project, project.rooms[i].id, false), b = getRoomBounds(project, project.rooms[j].id, false);
      if (Math.min(a.xMax, b.xMax) - Math.max(a.xMin, b.xMin) > EPS && Math.min(a.zMax, b.zMax) - Math.max(a.zMin, b.zMin) > EPS) return fail('room-overlap', 'Комнаты пересекаются после изменения стены', [project.rooms[i].id, project.rooms[j].id]);
    }
    for (const opening of project.openings) {
      const wall = getWallSegment(project, opening.wallId), ids = wallRoomIds(project, opening.wallId);
      if (![opening.offsetCm, opening.widthCm, opening.heightCm, opening.sillCm].every(Number.isFinite)) return fail('opening-number', 'Размеры проёма должны быть конечными числами', [opening.id]);
      if (opening.offsetCm < -EPS || opening.offsetCm + opening.widthCm > wall.lengthCm + EPS) return fail('opening-outside', `${opening.kind === 'door' ? 'Дверь' : 'Окно'} выходит за край стены`, [opening.id]);
      const isDoor = opening.kind === 'door';
      if (opening.widthCm < (isDoor ? 60 : 40) || opening.widthCm > (isDoor ? 200 : 300) || opening.heightCm < (isDoor ? 190 : 40) || opening.heightCm > 260) return fail('opening-size', isDoor ? 'Дверь: ширина 60–200 см, высота 190–260 см' : 'Окно: ширина 40–300 см, высота 40–260 см', [opening.id]);
      if (opening.sillCm < 0 || opening.sillCm > 150 || (isDoor && opening.sillCm !== 0) || opening.sillCm + opening.heightCm > project.ceilingHeightCm + EPS) return fail('opening-height', 'Проём выходит за потолок или имеет неверную высоту подоконника', [opening.id]);
      if (!isDoor && ids.length !== 1) return fail('inner-window', 'Окно должно находиться на внешней стене', [opening.id]);
      if (isDoor && opening.swingRoomId !== null && !ids.includes(opening.swingRoomId)) return fail('door-side', 'Сторона открывания не связана с дверью', [opening.id]);
      for (const other of project.openings) if (other.id !== opening.id && other.wallId === opening.wallId && Math.min(other.offsetCm + other.widthCm, opening.offsetCm + opening.widthCm) - Math.max(other.offsetCm, opening.offsetCm) > EPS && Math.min(other.sillCm + other.heightCm, opening.sillCm + opening.heightCm) - Math.max(other.sillCm, opening.sillCm) > EPS) return fail('opening-overlap', 'Окна и двери не должны пересекаться', [opening.id, other.id]);
    }
    const entrances = project.openings.filter(o => o.kind === 'door' && wallRoomIds(project, o.wallId).length === 1);
    if (!entrances.length) return fail('entrance', 'В квартире отсутствует входная дверь');
    const reached = new Set(entrances.flatMap(o => wallRoomIds(project, o.wallId)));
    let changing = true;
    while (changing) { changing = false; for (const door of project.openings.filter(o => o.kind === 'door')) { const ids = wallRoomIds(project, door.wallId); if (ids.some(id => reached.has(id))) for (const id of ids) if (!reached.has(id)) { reached.add(id); changing = true; } } }
    const isolated = project.rooms.find(r => !reached.has(r.id));
    if (isolated) return fail('disconnected', `В комнату «${isolated.name}» нет прохода`, [isolated.id]);
    if (new Set(project.furniture.map(f => f.id)).size !== project.furniture.length) return fail('duplicate-item', 'Предметы должны иметь уникальные идентификаторы');
    for (const furniture of project.furniture) { const result = validateFurniture(project, furniture); if (!result.valid) return result; }
    return VALID;
  } catch (error) { return fail('structure', error instanceof Error ? error.message : 'Повреждена структура квартиры'); }
}
export function proposeWallMove(project: Apartment, wallId: string, deltaCm: number): GeometryPreview {
  const candidate = structuredClone(project), affected: GeometryPreview['affected'] = [];
  if (!Number.isFinite(deltaCm)) return { project: candidate, validation: fail('number', 'Введите конечное число сантиметров'), affected };
  const selected = getWallSegment(project, wallId), horizontal = selected.horizontal, coordinate = horizontal ? selected.start.zCm : selected.start.xCm;
  const collinear = Object.values(project.walls).filter(w => { const s = getWallSegment(project, w.id); return s.horizontal === horizontal && Math.abs((horizontal ? s.start.zCm : s.start.xCm) - coordinate) < EPS; });
  const vertices = new Set([project.walls[wallId].startId, project.walls[wallId].endId]);
  let changing = true;
  while (changing) { changing = false; for (const wall of collinear) if (vertices.has(wall.startId) || vertices.has(wall.endId)) { if (!vertices.has(wall.startId) || !vertices.has(wall.endId)) changing = true; vertices.add(wall.startId); vertices.add(wall.endId); } }
  for (const id of vertices) { if (horizontal) candidate.vertices[id].zCm += deltaCm; else candidate.vertices[id].xCm += deltaCm; }
  for (const opening of candidate.openings) {
    const old = getWallSegment(project, opening.wallId), updated = getWallSegment(candidate, opening.wallId);
    if (old.horizontal !== horizontal) opening.offsetCm += old.horizontal ? old.start.xCm - updated.start.xCm : old.start.zCm - updated.start.zCm;
  }
  for (const room of candidate.rooms) {
    const before = getRoomBounds(project, room.id), after = getRoomBounds(candidate, room.id);
    if (Object.keys(before).some(k => before[k as keyof Rect] !== after[k as keyof Rect])) affected.push({ roomId: room.id, name: room.name, widthCm: after.xMax - after.xMin, depthCm: after.zMax - after.zMin, areaM2: getRoomArea(candidate, room.id) });
  }
  return { project: candidate, validation: validateApartment(candidate), affected };
}
