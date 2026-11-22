import { describe, expect, it } from 'vitest';
import { TEMPLATES } from '../../domain/templates';
import { getRoomBounds, getWallSegment, openingWorld, wallRoomIds } from '../../domain/geometry';
import { canWalk } from './walk';
import type { FurnitureInstance } from '../../domain/types';

describe('Walkthrough collision geometry', () => {
  for (const template of TEMPLATES) it(`${template.id}: every empty room and internal doorway admits a person`, () => {
    const project = template.apartment;
    for (const room of project.rooms) {
      const b = getRoomBounds(project, room.id);
      expect(canWalk(project, (b.xMin + b.xMax) / 200, (b.zMin + b.zMax) / 200), room.name).toBe(true);
    }
    for (const opening of project.openings.filter(o => o.kind === 'door' && wallRoomIds(project, o.wallId).length === 2)) {
      const p = openingWorld(project, opening).center;
      const wall = getWallSegment(project, opening.wallId);
      for (const distance of [-30, -15, 0, 15, 30]) {
        const x = p.xCm + (wall.horizontal ? 0 : distance), z = p.zCm + (wall.horizontal ? distance : 0);
        expect(canWalk(project, x / 100, z / 100), `${opening.id}, ${distance} cm`).toBe(true);
      }
    }
  });

  it('blocks exterior space, windows, and shoulder contact with a wall', () => {
    const project = TEMPLATES[0].apartment;
    expect(canWalk(project, -1, -1)).toBe(false);
    const window = project.openings.find(o => o.kind === 'window')!;
    const center = openingWorld(project, window).center;
    expect(canWalk(project, center.xCm / 100, center.zCm / 100)).toBe(false);
    const b = getRoomBounds(project, project.rooms[0].id);
    expect(canWalk(project, (b.xMin + 16) / 100, (b.zMin + b.zMax) / 200)).toBe(false);
  });

  it('blocks furniture at body height while allowing rugs and overhead fixtures', () => {
    const project = structuredClone(TEMPLATES[0].apartment), room = project.rooms[0], b = getRoomBounds(project, room.id);
    const f: FurnitureInstance = { id: 'walking-test', catalogItemId: 'coffee-table', roomId: room.id, xCm: (b.xMin + b.xMax) / 2, zCm: (b.zMin + b.zMax) / 2, yCm: 0, angleDeg: 35, color: '#a78056' };
    project.furniture = [f];
    expect(canWalk(project, f.xCm / 100, f.zCm / 100)).toBe(false);
    project.furniture = [{ ...f, catalogItemId: 'rug' }];
    expect(canWalk(project, f.xCm / 100, f.zCm / 100)).toBe(true);
    project.furniture = [{ ...f, catalogItemId: 'pendant', yCm: 252 }];
    expect(canWalk(project, f.xCm / 100, f.zCm / 100)).toBe(true);
  });
});
