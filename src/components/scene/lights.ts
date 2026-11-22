import type { Apartment, FurnitureInstance, Room } from '../../domain/types';
import { getCatalogItem } from '../../domain/catalog';
import { getRoomBounds } from '../../domain/geometry';

export interface RoomLightSource { id: string; position: [number, number, number]; intensity: number }
const LAMP_KINDS = new Set(['floor-lamp', 'table-lamp', 'sconce']);
export const MAX_ACTIVE_LIGHTS = 8;

function fixtureSource(f: FurnitureInstance): RoomLightSource {
  const item = getCatalogItem(f.catalogItemId);
  const ceiling = item.placement === 'ceiling';
  const bulbHeight = item.kind === 'floor-lamp' ? item.heightCm - 15 : item.kind === 'table-lamp' ? item.heightCm - 8 : item.kind === 'sconce' ? item.heightCm * 0.68 : item.heightCm * 0.25;
  return { id: f.id, position: [f.xCm / 100, (f.yCm + bulbHeight) / 100, f.zCm / 100], intensity: ceiling ? 22 : item.kind === 'table-lamp' ? 5 : 9 };
}

/** Reserve one source per visible lit room, then add up to three extra fixtures per room. */
export function roomLightSources(project: Apartment, rooms: Room[]): RoomLightSource[] {
  const primary: RoomLightSource[] = [], additional: RoomLightSource[] = [];
  for (const room of rooms) {
    if (!room.lightOn) continue;
    const furniture = project.furniture.filter(f => f.roomId === room.id);
    const ceiling = furniture.filter(f => getCatalogItem(f.catalogItemId).placement === 'ceiling');
    if (ceiling.length) primary.push(fixtureSource(ceiling[0]));
    else {
      const b = getRoomBounds(project, room.id);
      primary.push({ id: `ceiling-${room.id}`, position: [(b.xMin + b.xMax) / 200, project.ceilingHeightCm / 100 - 0.25, (b.zMin + b.zMax) / 200], intensity: 20 });
    }
    const extras = [...ceiling.slice(1), ...furniture.filter(f => LAMP_KINDS.has(getCatalogItem(f.catalogItemId).kind))];
    additional.push(...extras.slice(0, 3).map(fixtureSource));
  }
  return [...primary, ...additional].slice(0, MAX_ACTIVE_LIGHTS);
}
