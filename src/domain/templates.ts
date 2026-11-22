import type { Apartment, BoundaryEdge, LayoutTemplate, Point, Room, RoomType, Vertex, Wall } from './types';
import { getNetArea, getRoomBounds, getWallSegment, wallRoomIds } from './geometry';

interface RoomRectangle { id: string; name: string; type: RoomType; x0: number; x1: number; z0: number; z1: number }
const roundCoordinate = (n: number) => Math.round(n * 1e6) / 1e6;

/** Construct shared vertices and split each wall at every junction, never per-room copies. */
export function apartmentFromRectangles(id: string, name: string, rectangles: RoomRectangle[]): Apartment {
  const vertices: Record<string, Vertex> = {}, walls: Record<string, Wall> = {}, vertexByPoint = new Map<string, string>(), wallByEnds = new Map<string, string>();
  const vertexId = (xCm: number, zCm: number) => {
    const key = `${roundCoordinate(xCm)},${roundCoordinate(zCm)}`;
    let result = vertexByPoint.get(key);
    if (!result) { result = `v${vertexByPoint.size + 1}`; vertexByPoint.set(key, result); vertices[result] = { id: result, xCm: roundCoordinate(xCm), zCm: roundCoordinate(zCm) }; }
    return result;
  };
  for (const r of rectangles) for (const [x, z] of [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]]) vertexId(x, z);
  const rooms: Room[] = rectangles.map(r => {
    const corners: Point[] = [{ xCm: r.x0, zCm: r.z0 }, { xCm: r.x1, zCm: r.z0 }, { xCm: r.x1, zCm: r.z1 }, { xCm: r.x0, zCm: r.z1 }];
    const boundary: BoundaryEdge[] = [];
    for (let side = 0; side < 4; side++) {
      const a = corners[side], b = corners[(side + 1) % 4], horizontal = side % 2 === 0;
      const points = Object.values(vertices).filter(p => horizontal ? Math.abs(p.zCm - a.zCm) < 0.001 && p.xCm >= Math.min(a.xCm, b.xCm) - 0.001 && p.xCm <= Math.max(a.xCm, b.xCm) + 0.001 : Math.abs(p.xCm - a.xCm) < 0.001 && p.zCm >= Math.min(a.zCm, b.zCm) - 0.001 && p.zCm <= Math.max(a.zCm, b.zCm) + 0.001).sort((p, q) => horizontal ? (p.xCm - q.xCm) * (b.xCm > a.xCm ? 1 : -1) : (p.zCm - q.zCm) * (b.zCm > a.zCm ? 1 : -1));
      for (let i = 1; i < points.length; i++) {
        const p = points[i - 1], q = points[i], start = horizontal ? (p.xCm < q.xCm ? p : q) : (p.zCm < q.zCm ? p : q), end = start === p ? q : p;
        const key = [start.id, end.id].sort().join(':');
        let wallId = wallByEnds.get(key);
        if (!wallId) { wallId = `w${wallByEnds.size + 1}`; wallByEnds.set(key, wallId); walls[wallId] = { id: wallId, startId: start.id, endId: end.id, thicknessCm: 30 }; }
        boundary.push({ wallId, forward: p.id === start.id });
      }
    }
    return { id: r.id, name: r.name, type: r.type, boundary, floor: { kind: r.type === 'bathroom' || r.type === 'toilet' ? 'linoleum' : 'laminate', color: r.type === 'bathroom' || r.type === 'toilet' ? '#a9aaa5' : '#c4ae8c' }, lightOn: true };
  });
  const apartment: Apartment = { id: `apartment-${id}`, templateId: id, name, ceilingHeightCm: 270, vertices, walls, rooms, openings: [], furniture: [], wallFinishes: {} };
  for (const wall of Object.values(walls)) { wall.thicknessCm = wallRoomIds(apartment, wall.id).length === 2 ? 10 : 30; for (const roomId of wallRoomIds(apartment, wall.id)) apartment.wallFinishes[`${wall.id}:${roomId}`] = { kind: 'paint', color: '#e4dfd5' }; }
  const hall = rooms.find(r => r.type === 'hall')!;
  const connected = new Set<string>();
  for (const wall of Object.values(walls)) {
    const ids = wallRoomIds(apartment, wall.id), segment = getWallSegment(apartment, wall.id);
    if (ids.length === 2 && ids.includes(hall.id)) {
      const otherId = ids.find(v => v !== hall.id)!, other = rooms.find(r => r.id === otherId)!;
      if (connected.has(otherId)) continue;
      const sanitary = other.type === 'bathroom' || other.type === 'toilet', widthCm = sanitary ? 70 : 80;
      if (segment.lengthCm < widthCm + 20) continue;
      apartment.openings.push({ id: `door-${otherId}`, kind: 'door', wallId: wall.id, offsetCm: Math.round((segment.lengthCm - widthCm) / 2), widthCm, heightCm: 210, sillCm: 0, hinge: 'start', swingRoomId: sanitary ? hall.id : otherId });
      connected.add(otherId);
    }
  }
  const hallBounds = getRoomBounds(apartment, hall.id, false);
  const entryWall = hall.boundary.map(b => getWallSegment(apartment, b.wallId)).find(s => s.horizontal && Math.abs(s.start.zCm - hallBounds.zMax) < 0.001 && wallRoomIds(apartment, Object.values(walls).find(w => w.startId === s.start.id && w.endId === s.end.id)!.id).length === 1);
  if (entryWall) {
    const wall = Object.values(walls).find(w => w.startId === entryWall.start.id && w.endId === entryWall.end.id)!;
    apartment.openings.push({ id: 'entrance', kind: 'door', wallId: wall.id, offsetCm: Math.round(Math.max(20, Math.min(entryWall.lengthCm - 110, entryWall.lengthCm * 0.23))), widthCm: 90, heightCm: 210, sillCm: 0, hinge: 'start', swingRoomId: hall.id });
  }
  for (const room of rooms.filter(r => ['living', 'bedroom', 'kitchen'].includes(r.type))) {
    const axis = getRoomBounds(apartment, room.id, false);
    const wall = room.boundary.map(e => walls[e.wallId]).find(w => { const s = getWallSegment(apartment, w.id); return s.horizontal && Math.abs(s.start.zCm - axis.zMin) < 0.001 && wallRoomIds(apartment, w.id).length === 1; });
    if (wall) { const length = getWallSegment(apartment, wall.id).lengthCm, widthCm = Math.min(160, Math.floor(length * 0.5)); apartment.openings.push({ id: `window-${room.id}`, kind: 'window', wallId: wall.id, offsetCm: Math.round((length - widthCm) / 2), widthCm, heightCm: 135, sillCm: 85, hinge: 'start', swingRoomId: null }); }
  }
  return apartment;
}

function makeTemplate(livingRooms: 1 | 2 | 3, variant: 'a' | 'b' | 'c', targetArea: number): LayoutTemplate {
  const id = `${livingRooms}${variant}`, letter = { a: 'А', b: 'Б', c: 'В' }[variant], combined = variant === 'a', separateBath = variant === 'c';
  const top: { name: string; type: RoomType; width: number }[] = [{ name: combined ? 'Кухня-гостиная' : 'Гостиная', type: 'living', width: combined ? 540 : 450 }];
  for (let i = 1; i < livingRooms; i++) top.push({ name: i === 1 ? 'Спальня' : 'Детская', type: 'bedroom', width: i === 1 ? 360 : 340 });
  if (!combined) top.push({ name: 'Кухня', type: 'kitchen', width: 370 });
  const total = top.reduce((sum, r) => sum + r.width, 0), mainDepth = livingRooms === 1 && combined ? 470 : 420, lowerDepth = separateBath ? 280 : 230, serviceWidth = separateBath ? 240 : 220;
  const create = (scale: number, whole = false) => {
    const f = (v: number) => whole ? Math.round(v * scale) : roundCoordinate(v * scale), rects: RoomRectangle[] = [];
    let x = 0;
    top.forEach((r, i) => { rects.push({ id: `room-${i + 1}`, name: r.name, type: r.type, x0: f(x), x1: f(x + r.width), z0: 0, z1: f(mainDepth) }); x += r.width; });
    rects.push({ id: 'hall', name: 'Прихожая', type: 'hall', x0: 0, x1: f(total - serviceWidth), z0: f(mainDepth), z1: f(mainDepth + lowerDepth) });
    rects.push({ id: 'bathroom', name: separateBath ? 'Ванная' : 'Санузел', type: 'bathroom', x0: f(total - serviceWidth), x1: f(total), z0: f(mainDepth), z1: f(mainDepth + (separateBath ? 165 : lowerDepth)) });
    if (separateBath) rects.push({ id: 'toilet', name: 'Туалет', type: 'toilet', x0: f(total - serviceWidth), x1: f(total), z0: f(mainDepth + 165), z1: f(mainDepth + lowerDepth) });
    return apartmentFromRectangles(id, `${livingRooms}${letter} · ${combined ? (livingRooms === 1 ? 'Студия' : 'Кухня-гостиная') : separateBath ? 'Раздельный санузел' : 'Отдельная кухня'}`, rects);
  };
  // The previous geometry was not supplied. Reconstruct and fit the agreed enlarged net-area references;
  // leave wall thickness, ceiling and openings unscaled. Final vertices use whole centimetres.
  let lo = 0.5, hi = 1.7;
  for (let i = 0; i < 28; i++) { const middle = (lo + hi) / 2; if (getNetArea(create(middle)) < targetArea) lo = middle; else hi = middle; }
  const apartment = create((lo + hi) / 2, true);
  return { id, name: `${livingRooms}${letter}`, livingRooms, kitchen: combined ? 'Кухня-гостиная' : 'Отдельная кухня', bathroom: separateBath ? 'Раздельный санузел' : 'Совмещённый санузел', description: combined ? 'Общее пространство для кухни и гостиной' : separateBath ? 'Изолированные комнаты, ванная и туалет' : 'Изолированные комнаты и отдельная кухня', apartment };
}
export const TEMPLATES: LayoutTemplate[] = [makeTemplate(1, 'a', 36.8), makeTemplate(1, 'b', 45.5), makeTemplate(1, 'c', 46.7), makeTemplate(2, 'a', 57.2), makeTemplate(2, 'b', 69.2), makeTemplate(2, 'c', 68.3), makeTemplate(3, 'a', 79.8), makeTemplate(3, 'b', 90.7), makeTemplate(3, 'c', 87.4)];
