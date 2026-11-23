import type { Apartment, BoundaryEdge, LayoutTemplate, Point, Room, RoomChoice, RoomType, Vertex, Wall } from './types';
import { getNetArea, getRoomBounds, getWallSegment, wallRoomIds } from './geometry';

interface RoomRectangle { id: string; name: string; type: RoomType; x0: number; x1: number; z0: number; z1: number }
const roundCoordinate = (n: number) => Math.round(n * 1e6) / 1e6;

/** Construct shared vertices and split each wall at every junction, never per-room copies. */
export function apartmentFromRectangles(id: string, name: string, rectangles: RoomRectangle[], options: { doors?: [string, string][]; entry?: Point } = {}): Apartment {
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
  // The hall is the hub; an open studio has none, so its living room takes that role.
  const hub = rooms.find(r => r.type === 'hall') ?? rooms.find(r => r.type === 'living')!;
  const isSanitary = (room: Room) => room.type === 'bathroom' || room.type === 'toilet';
  const connected = new Set<string>();
  for (const wall of Object.values(walls)) {
    const ids = wallRoomIds(apartment, wall.id), segment = getWallSegment(apartment, wall.id);
    if (ids.length === 2 && ids.includes(hub.id)) {
      const otherId = ids.find(v => v !== hub.id)!, other = rooms.find(r => r.id === otherId)!;
      if (connected.has(otherId)) continue;
      const sanitary = isSanitary(other), widthCm = sanitary ? 70 : 80;
      if (segment.lengthCm < widthCm + 20) continue;
      apartment.openings.push({ id: `door-${otherId}`, kind: 'door', wallId: wall.id, offsetCm: Math.round((segment.lengthCm - widthCm) / 2), widthCm, heightCm: 210, sillCm: 0, hinge: 'start', swingRoomId: sanitary ? hub.id : otherId });
      connected.add(otherId);
    }
  }
  for (const [aId, bId] of options.doors ?? []) {
    const a = rooms.find(r => r.id === aId)!, b = rooms.find(r => r.id === bId)!, sanitary = isSanitary(a) || isSanitary(b), widthCm = sanitary ? 70 : 80;
    const wall = Object.values(walls).find(w => { const ids = wallRoomIds(apartment, w.id); return ids.length === 2 && ids.includes(aId) && ids.includes(bId) && getWallSegment(apartment, w.id).lengthCm >= widthCm + 20; });
    if (!wall) throw new Error(`Нет общей стены для двери между «${a.name}» и «${b.name}»`);
    const length = getWallSegment(apartment, wall.id).lengthCm;
    apartment.openings.push({ id: `door-${aId}-${bId}`, kind: 'door', wallId: wall.id, offsetCm: Math.round((length - widthCm) / 2), widthCm, heightCm: 210, sillCm: 0, hinge: 'start', swingRoomId: sanitary ? (isSanitary(a) ? bId : aId) : bId });
  }
  const hubBounds = getRoomBounds(apartment, hub.id, false);
  const hubExternal = hub.boundary.map(edge => edge.wallId).filter(id => wallRoomIds(apartment, id).length === 1);
  const midpoint = (id: string) => { const s = getWallSegment(apartment, id); return { xCm: (s.start.xCm + s.end.xCm) / 2, zCm: (s.start.zCm + s.end.zCm) / 2 }; };
  const hint = options.entry;
  const entryId = (hint ? [...hubExternal].filter(id => getWallSegment(apartment, id).lengthCm >= 130).sort((a, b) => Math.hypot(midpoint(a).xCm - hint.xCm, midpoint(a).zCm - hint.zCm) - Math.hypot(midpoint(b).xCm - hint.xCm, midpoint(b).zCm - hint.zCm))[0] : undefined)
    ?? hubExternal.find(id => { const s = getWallSegment(apartment, id); return s.horizontal && Math.abs(s.start.zCm - hubBounds.zMax) < 0.001; })
    ?? [...hubExternal].sort((a, b) => getWallSegment(apartment, b).lengthCm - getWallSegment(apartment, a).lengthCm).find(id => getWallSegment(apartment, id).lengthCm >= 130);
  if (entryId) {
    const entryWall = getWallSegment(apartment, entryId);
    apartment.openings.push({ id: 'entrance', kind: 'door', wallId: entryId, offsetCm: Math.round(Math.max(20, Math.min(entryWall.lengthCm - 110, entryWall.lengthCm * 0.23))), widthCm: 90, heightCm: 210, sillCm: 0, hinge: 'start', swingRoomId: hub.id });
  }
  for (const room of rooms.filter(r => ['living', 'bedroom', 'kitchen'].includes(r.type))) {
    const axis = getRoomBounds(apartment, room.id, false);
    const external = room.boundary.map(e => walls[e.wallId]).filter(w => wallRoomIds(apartment, w.id).length === 1 && !apartment.openings.some(o => o.wallId === w.id) && getWallSegment(apartment, w.id).lengthCm >= 100);
    const along = (z: number) => external.find(w => { const s = getWallSegment(apartment, w.id); return s.horizontal && Math.abs(s.start.zCm - z) < 0.001; });
    // Prefer the street side at the top of the plan, then the opposite facade, then the longest free side.
    const wall = along(axis.zMin) ?? along(axis.zMax) ?? [...external].sort((a, b) => getWallSegment(apartment, b.id).lengthCm - getWallSegment(apartment, a.id).lengthCm)[0];
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
  return { id, name: `${livingRooms}${letter}`, livingRooms, choices: livingRooms === 1 && combined ? [0, 1] : [livingRooms], kitchen: combined ? 'Кухня-гостиная' : 'Отдельная кухня', bathroom: separateBath ? 'Раздельный санузел' : 'Совмещённый санузел', description: combined ? 'Общее пространство для кухни и гостиной' : separateBath ? 'Изолированные комнаты, ванная и туалет' : 'Изолированные комнаты и отдельная кухня', apartment };
}
interface CustomLayout { id: string; name: string; title: string; livingRooms: 1 | 2 | 3 | 4; choices: RoomChoice[]; kitchen: string; bathroom: string; description: string; rooms: RoomRectangle[]; doors?: [string, string][]; entry?: Point }
/** Layouts drawn directly in whole centimetres (axis of walls); areas are always computed from the geometry. */
function customTemplate(layout: CustomLayout): LayoutTemplate {
  const apartment = apartmentFromRectangles(layout.id, `${layout.name} · ${layout.title}`, layout.rooms, { doors: layout.doors, entry: layout.entry });
  return { id: layout.id, name: layout.name, livingRooms: layout.livingRooms, choices: layout.choices, kitchen: layout.kitchen, bathroom: layout.bathroom, description: layout.description, apartment };
}
const room = (id: string, name: string, type: RoomType, x0: number, x1: number, z0: number, z1: number): RoomRectangle => ({ id, name, type, x0, x1, z0, z1 });

const EXTRA_LAYOUTS: CustomLayout[] = [
  { id: '1d', name: '1Г', title: 'Открытая студия', livingRooms: 1, choices: [0], kitchen: 'Кухня в общей комнате', bathroom: 'Совмещённый санузел', description: 'Без прихожей: вход сразу в общую комнату',
    rooms: [room('studio', 'Студия', 'living', 0, 640, 0, 480), room('bathroom', 'Санузел', 'bathroom', 420, 640, 480, 700)] },
  { id: '2d', name: '2Г', title: 'Г-образная', livingRooms: 2, choices: [2], kitchen: 'Отдельная кухня', bathroom: 'Совмещённый санузел', description: 'Г-образный контур, спальня в отдельном крыле',
    rooms: [room('living', 'Гостиная', 'living', 0, 480, 0, 430), room('kitchen', 'Кухня', 'kitchen', 480, 820, 0, 430), room('bathroom', 'Санузел', 'bathroom', 0, 240, 430, 650), room('hall', 'Прихожая', 'hall', 240, 820, 430, 610), room('bedroom', 'Спальня', 'bedroom', 240, 820, 610, 980)] },
  { id: '3d', name: '3Г', title: 'Коридорная', livingRooms: 3, choices: [3], kitchen: 'Отдельная кухня', bathroom: 'Совмещённый санузел', description: 'Комнаты по обе стороны коридора',
    rooms: [room('living', 'Гостиная', 'living', 0, 500, 0, 440), room('kitchen', 'Кухня', 'kitchen', 500, 860, 0, 440), room('hall', 'Коридор', 'hall', 0, 860, 440, 580), room('bedroom', 'Спальня', 'bedroom', 0, 380, 580, 960), room('bathroom', 'Санузел', 'bathroom', 380, 560, 580, 820), room('nursery', 'Детская', 'bedroom', 560, 860, 580, 960)] },
  { id: '4a', name: '4А', title: 'Кухня-гостиная', livingRooms: 4, choices: [4], kitchen: 'Кухня-гостиная', bathroom: 'Раздельный санузел', description: 'Кухня-гостиная и три изолированные комнаты',
    entry: { xCm: 0, zCm: 530 },
    rooms: [room('living', 'Кухня-гостиная', 'living', 0, 620, 0, 460), room('bedroom', 'Спальня', 'bedroom', 620, 1000, 0, 460), room('hall', 'Коридор', 'hall', 0, 1000, 460, 600), room('nursery', 'Детская', 'bedroom', 0, 360, 600, 960), room('study', 'Кабинет', 'bedroom', 360, 660, 600, 960), room('bathroom', 'Ванная', 'bathroom', 660, 860, 600, 820), room('toilet', 'Туалет', 'toilet', 860, 1000, 600, 760)] },
  { id: '4b', name: '4Б', title: 'Отдельная кухня', livingRooms: 4, choices: [4], kitchen: 'Отдельная кухня', bathroom: 'Совмещённый санузел', description: 'Четыре изолированные комнаты и отдельная кухня',
    rooms: [room('living', 'Гостиная', 'living', 0, 520, 0, 460), room('bedroom', 'Спальня', 'bedroom', 520, 880, 0, 460), room('kitchen', 'Кухня', 'kitchen', 880, 1200, 0, 460), room('hall', 'Прихожая', 'hall', 0, 1200, 460, 600), room('nursery', 'Детская', 'bedroom', 0, 380, 600, 960), room('study', 'Кабинет', 'bedroom', 380, 700, 600, 960), room('bathroom', 'Санузел', 'bathroom', 700, 920, 600, 840)] },
];

/** The first nine keep their original order and geometry; extra layouts follow. */
export const TEMPLATES: LayoutTemplate[] = [makeTemplate(1, 'a', 36.8), makeTemplate(1, 'b', 45.5), makeTemplate(1, 'c', 46.7), makeTemplate(2, 'a', 57.2), makeTemplate(2, 'b', 69.2), makeTemplate(2, 'c', 68.3), makeTemplate(3, 'a', 79.8), makeTemplate(3, 'b', 90.7), makeTemplate(3, 'c', 87.4), ...EXTRA_LAYOUTS.map(customTemplate)];
export const templatesForChoice = (choice: RoomChoice) => TEMPLATES.filter(t => t.choices.includes(choice));
