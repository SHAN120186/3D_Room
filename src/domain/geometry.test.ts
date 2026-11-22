import { describe, expect, it } from 'vitest';
import { getCatalogItem } from './catalog';
import {
  boxCorners, cmToM, furnitureIntersect, getGrossArea, getNetArea, getRoomBounds,
  getWallSegment, normalizeSupport, openingWorld, parseCm, polygonsOverlap,
  proposeWallMove, squareCmToM2, validateApartment, validateFurniture, wallRoomIds,
} from './geometry';
import { apartmentFromRectangles, TEMPLATES } from './templates';
import type { Apartment, FurnitureInstance, FurnitureKind } from './types';

/** Clear dimensions are 400×300 and 200×300 cm, with one 10 cm partition. */
function twoRooms(): Apartment {
  return apartmentFromRectangles('test', 'Проверочная квартира', [
    { id: 'living', name: 'Комната A', type: 'living', x0: 0, x1: 420, z0: 0, z1: 330 },
    { id: 'hall', name: 'Коридор Б', type: 'hall', x0: 420, x1: 640, z0: 0, z1: 330 },
  ]);
}
function furniture(kind: FurnitureKind, patch: Partial<FurnitureInstance> = {}): FurnitureInstance {
  return { id: `${kind}-1`, catalogItemId: kind, roomId: 'living', xCm: 200, zCm: 100, yCm: 0,
    angleDeg: 0, color: getCatalogItem(kind).color, ...patch };
}
const sharedWall = (project: Apartment) => Object.values(project.walls).find(wall => wallRoomIds(project, wall.id).length === 2)!;

describe('template geometry and units', () => {
  const expectedAreas: Record<string, number> = { '1a': 36.8, '1b': 45.5, '1c': 46.7, '2a': 57.2, '2b': 69.2, '2c': 68.3, '3a': 79.8, '3b': 90.7, '3c': 87.4 };
  it('provides exactly three choices for each living-room count', () => {
    expect(TEMPLATES).toHaveLength(9);
    expect(new Set(TEMPLATES.map(t => t.id)).size).toBe(9);
    for (const count of [1, 2, 3]) expect(TEMPLATES.filter(t => t.livingRooms === count)).toHaveLength(3);
  });
  it.each(TEMPLATES)('$id is empty, connected and has its agreed composition and computed area', template => {
    const p = template.apartment;
    const validation = validateApartment(p);
    expect(validation.valid, validation.reason).toBe(true);
    expect(p.furniture).toEqual([]);
    expect(p.rooms.filter(r => r.type === 'living' || r.type === 'bedroom')).toHaveLength(template.livingRooms);
    expect(p.rooms.filter(r => r.type === 'hall')).toHaveLength(1);
    expect(p.rooms.filter(r => r.type === 'bathroom')).toHaveLength(1);
    expect(p.rooms.filter(r => r.type === 'kitchen')).toHaveLength(template.id.endsWith('a') ? 0 : 1);
    expect(p.rooms.filter(r => r.type === 'toilet')).toHaveLength(template.id.endsWith('c') ? 1 : 0);
    expect(Math.abs(getNetArea(p) - expectedAreas[template.id])).toBeLessThan(0.15);
    expect(getGrossArea(p)).toBeGreaterThan(getNetArea(p));

    // Check passage reachability from the data independently of validateApartment.
    const doors = p.openings.filter(o => o.kind === 'door');
    const neighbours = new Map(p.rooms.map(r => [r.id, new Set<string>()]));
    const reachable = new Set<string>();
    for (const door of doors) {
      const rooms = p.rooms.filter(r => r.boundary.some(edge => edge.wallId === door.wallId));
      if (rooms.length === 1) reachable.add(rooms[0].id);
      if (rooms.length === 2) {
        neighbours.get(rooms[0].id)!.add(rooms[1].id);
        neighbours.get(rooms[1].id)!.add(rooms[0].id);
      }
    }
    for (const id of reachable) for (const next of neighbours.get(id)!) reachable.add(next);
    expect(reachable.size).toBe(p.rooms.length);
  });
  it('stores a shared wall once and keeps net and gross areas distinct', () => {
    const p = twoRooms();
    expect(validateApartment(p)).toEqual({ valid: true });
    const shared = Object.values(p.walls).filter(w => wallRoomIds(p, w.id).length === 2);
    expect(shared).toHaveLength(1);
    expect(shared[0].thicknessCm).toBe(10);
    expect(p.rooms.every(r => r.boundary.some(b => b.wallId === shared[0].id))).toBe(true);
    expect(p.openings.filter(o => o.wallId === shared[0].id)).toHaveLength(1);
    expect(getRoomBounds(p, 'living')).toEqual({ xMin: 15, xMax: 415, zMin: 15, zMax: 315 });
    expect(getRoomBounds(p, 'hall')).toEqual({ xMin: 425, xMax: 625, zMin: 15, zMax: 315 });
    expect(getNetArea(p)).toBe(18);
    expect(getGrossArea(p)).toBeCloseTo(24.12, 8);
  });
  it('converts scale exactly once and accepts comma/point input as whole cm', () => {
    expect(cmToM(100)).toBe(1);
    expect(cmToM(420)).toBe(4.2);
    expect(squareCmToM2(120000)).toBe(12);
    expect(parseCm(' 420,6 ', 80, 1500)).toBe(421);
    expect(parseCm('420.4', 80, 1500)).toBe(420);
    for (const invalid of ['', 'NaN', 'Infinity', '12px', '1,2,3', '-1', '0', '79', '1501']) {
      expect(parseCm(invalid, 80, 1500), invalid).toBeNull();
    }
  });
});

describe('shared geometry and openings', () => {
  it('moves both neighbours and retains the opposite walls, thickness and net area', () => {
    const p = twoRooms(), original = structuredClone(p), wall = sharedWall(p);
    const proposal = proposeWallMove(p, wall.id, 30);
    expect(proposal.validation.valid, proposal.validation.reason).toBe(true);
    expect(p).toEqual(original);
    expect(getRoomBounds(proposal.project, 'living')).toEqual({ xMin: 15, xMax: 445, zMin: 15, zMax: 315 });
    expect(getRoomBounds(proposal.project, 'hall')).toEqual({ xMin: 455, xMax: 625, zMin: 15, zMax: 315 });
    expect(proposal.affected.map(r => r.roomId).sort()).toEqual(['hall', 'living']);
    expect(getNetArea(proposal.project)).toBe(18);
    expect(proposal.project.walls[wall.id].thicknessCm).toBe(10);
  });
  it('preserves an adjoining entrance world coordinate while adjusting its offset', () => {
    const p = twoRooms(), entrance = p.openings.find(o => o.id === 'entrance')!;
    entrance.offsetCm = 50; // Explicit fixture position, independent of the template's preferred offset.
    expect(entrance.offsetCm).toBe(50);
    const proposal = proposeWallMove(p, sharedWall(p).id, 30);
    const movedEntrance = proposal.project.openings.find(o => o.id === entrance.id)!;
    expect(movedEntrance.offsetCm).toBe(20);
    expect(openingWorld(proposal.project, movedEntrance)).toEqual(openingWorld(p, entrance));
  });
  it('rejects an overlarge move without mutating the input apartment', () => {
    const p = twoRooms(), original = structuredClone(p);
    const proposal = proposeWallMove(p, sharedWall(p).id, 200);
    expect(proposal.validation.valid).toBe(false);
    expect(proposal.validation.code).toBe('room-size');
    expect(p).toEqual(original);
  });
  it('detects furniture in the shrinking hidden neighbour', () => {
    const p = twoRooms();
    p.furniture.push(furniture('wardrobe', { roomId: 'hall', xCm: 525, zCm: 70 }));
    expect(validateApartment(p)).toEqual({ valid: true });
    const proposal = proposeWallMove(p, sharedWall(p).id, 30);
    expect(proposal.validation.valid).toBe(false);
    expect(proposal.validation.code).toBe('outside-room');
    expect(proposal.validation.reason).toContain('Коридор Б');
    expect(proposal.validation.conflicts).toContain('wardrobe-1');
    expect(p.vertices).not.toEqual(proposal.project.vertices);
    expect(getRoomBounds(p, 'hall').xMin).toBe(425);
  });
  it('rejects an opening outside its wall and overlapping openings', () => {
    const p = twoRooms(), bad = structuredClone(p);
    const window = bad.openings.find(o => o.kind === 'window')!;
    window.offsetCm = getWallSegment(bad, window.wallId).lengthCm - window.widthCm + 1;
    expect(validateApartment(bad).code).toBe('opening-outside');
    const overlap = structuredClone(p), originalWindow = overlap.openings.find(o => o.kind === 'window')!;
    overlap.openings.push({ ...originalWindow, id: 'overlapping-window', offsetCm: originalWindow.offsetCm + 1 });
    expect(validateApartment(overlap).code).toBe('opening-overlap');
  });
  it('rejects a disconnected room and duplicate shared wall', () => {
    const p = twoRooms(), missingDoor = structuredClone(p), common = sharedWall(p);
    missingDoor.openings = missingDoor.openings.filter(o => o.wallId !== common.id);
    expect(validateApartment(missingDoor).code).toBe('disconnected');
    const duplicate = structuredClone(p);
    duplicate.walls['duplicate-wall'] = { ...common, id: 'duplicate-wall' };
    expect(validateApartment(duplicate).code).toBe('duplicate-wall');
  });
});

describe('full footprints, precise collisions and door zones', () => {
  it('accepts touching and penetration below tolerance, but rejects a 0.02 cm intrusion', () => {
    const fixed = boxCorners(0, 0, 100, 100, 0);
    expect(polygonsOverlap(fixed, boxCorners(100, 0, 100, 100, 0))).toBe(false);
    expect(polygonsOverlap(fixed, boxCorners(99.995, 0, 100, 100, 0))).toBe(false);
    expect(polygonsOverlap(fixed, boxCorners(99.98, 0, 100, 100, 0))).toBe(true);
    const p = twoRooms(), touching = furniture('coffee-table', { xCm: 70 });
    expect(validateFurniture(p, touching).valid).toBe(true);
    expect(validateFurniture(p, { ...touching, xCm: 69.995 }).valid).toBe(true);
    expect(validateFurniture(p, { ...touching, xCm: 69.98 }).code).toBe('outside-room');
  });
  it('rejects a rotated corner outside the room even with its centre inside', () => {
    const p = twoRooms(), instance = furniture('coffee-table', { xCm: 75, zCm: 100 });
    expect(validateFurniture(p, instance).valid).toBe(true);
    expect(validateFurniture(p, { ...instance, angleDeg: 45 }).code).toBe('outside-room');
  });
  it('permits a chair beneath a tabletop, but catches backrest and leg intersections', () => {
    const table = furniture('dining-table', { xCm: 0, zCm: 0 });
    expect(furnitureIntersect(table, furniture('chair', { xCm: 0, zCm: -50 }))).toBe(false);
    expect(furnitureIntersect(table, furniture('chair', { xCm: 0, zCm: -20 }))).toBe(true);
    expect(furnitureIntersect(table, furniture('chair', { xCm: 52, zCm: -56 }))).toBe(true);
  });
  it('separates height ranges and permits rugs under furniture but not another rug', () => {
    const dresser = furniture('dresser'), shelf = furniture('shelf', { yCm: 145 });
    expect(furnitureIntersect(dresser, shelf)).toBe(false);
    const rug = furniture('rug');
    expect(furnitureIntersect(rug, dresser)).toBe(false);
    expect(furnitureIntersect(rug, { ...rug, id: 'rug-2' })).toBe(true);
  });
  it('protects the threshold on the non-swing side without extending it beyond 30 cm', () => {
    const p = twoRooms();
    expect(validateFurniture(p, furniture('floor-lamp', { roomId: 'hall', xCm: 460, zCm: 165 })).code).toBe('door-clearance');
    expect(validateFurniture(p, furniture('floor-lamp', { roomId: 'hall', xCm: 480, zCm: 165 })).valid).toBe(true);
  });
  it('checks the real quarter-circle sector, not its bounding square or item centre', () => {
    const p = twoRooms();
    // Hinge (420,125), radius80. Closest corner at offsets (60,60) is outside the circle.
    const outsideArc = furniture('floor-lamp', { xCm: 340, zCm: 205 });
    expect(validateFurniture(p, outsideArc).valid).toBe(true);
    // Centre is outside radius80, but nearest corner at (50,50) penetrates the sector.
    const cornerInside = furniture('floor-lamp', { xCm: 350, zCm: 195 });
    expect(Math.hypot(420 - cornerInside.xCm, cornerInside.zCm - 125)).toBeGreaterThan(80);
    expect(validateFurniture(p, cornerInside).code).toBe('door-swing');
  });
  it('allows a rug in the door zone while still requiring it to fit the room', () => {
    const p = twoRooms(), rug = furniture('rug', { xCm: 315, zCm: 165 });
    expect(validateFurniture(p, rug).valid).toBe(true);
    expect(validateFurniture(p, { ...rug, xCm: 316 }).code).toBe('outside-room');
  });
});

describe('floor, wall, ceiling and tabletop support', () => {
  it('sets the wall angle and mounting height, and blocks a shelf across a window', () => {
    const p = twoRooms();
    const shelf = normalizeSupport(p, furniture('shelf', { xCm: 200, zCm: 305 }));
    expect(shelf.yCm).toBe(145);
    expect(shelf.angleDeg).toBe(180);
    expect(shelf.zCm).toBe(303);
    expect(validateFurniture(p, shelf).valid).toBe(true);
    const atWindow = normalizeSupport(p, furniture('shelf', { xCm: 200, zCm: 25 }));
    expect(validateFurniture(p, atWindow).code).toBe('opening');
    expect(validateFurniture(p, { ...shelf, zCm: shelf.zCm - 1 }).code).toBe('support');
  });
  it('requires floor objects on the floor and ceiling lights flush to the ceiling', () => {
    const p = twoRooms(), pendant = normalizeSupport(p, furniture('pendant'));
    expect(pendant.yCm).toBe(252);
    expect(validateFurniture(p, pendant).valid).toBe(true);
    expect(validateFurniture(p, { ...pendant, yCm: 0 }).code).toBe('support');
    expect(validateFurniture(p, furniture('chair', { yCm: 1 })).code).toBe('support');
  });
  it('places the full lamp footprint on an allowed tabletop and rejects unsupported/overhanging lamps', () => {
    const p = twoRooms(), table = furniture('dining-table', { xCm: 200, zCm: 160 });
    p.furniture = [table];
    const lamp = normalizeSupport(p, furniture('table-lamp', { xCm: 200, zCm: 160 }));
    expect(lamp.yCm).toBe(75);
    expect(lamp.supportId).toBe(table.id);
    expect(validateFurniture(p, lamp).valid).toBe(true);
    const overhang = normalizeSupport(p, { ...lamp, xCm: 270 });
    expect(overhang.supportId).toBe(table.id);
    expect(validateFurniture(p, overhang).code).toBe('support');
    const empty = twoRooms(), unsupported = normalizeSupport(empty, lamp);
    expect(validateFurniture(empty, unsupported).code).toBe('support');
  });
  it('does not silently treat the TV console as an approved lamp support', () => {
    const p = twoRooms();
    p.furniture.push(furniture('tv-console'));
    const lamp = normalizeSupport(p, furniture('table-lamp'));
    expect(lamp.supportId).toBeUndefined();
    expect(validateFurniture(p, lamp).code).toBe('support');
  });
});
