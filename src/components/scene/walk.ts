import type { Apartment } from '../../domain/types';
import { getCatalogItem } from '../../domain/catalog';
import { getRoomBounds, getWallSegment } from '../../domain/geometry';

export function canWalk(project: Apartment, x: number, z: number): boolean {
  const cx = x * 100, cz = z * 100, radius = 17;
  if (!project.rooms.some(room => { const b = getRoomBounds(project, room.id, false); return cx >= b.xMin && cx <= b.xMax && cz >= b.zMin && cz <= b.zMax; })) return false;
  for (const wall of Object.values(project.walls)) {
    const s = getWallSegment(project, wall.id), dx = s.end.xCm - s.start.xCm, dz = s.end.zCm - s.start.zCm;
    const along = ((cx - s.start.xCm) * dx + (cz - s.start.zCm) * dz) / s.lengthCm;
    const t = Math.max(0, Math.min(1, along / s.lengthCm));
    const distance = Math.hypot(cx - s.start.xCm - dx * t, cz - s.start.zCm - dz * t);
    if (distance >= wall.thicknessCm / 2 + radius) continue;
    const passage = project.openings.some(o => o.wallId === wall.id && o.kind === 'door' && along >= o.offsetCm + radius && along <= o.offsetCm + o.widthCm - radius);
    if (!passage) return false;
  }
  for (const f of project.furniture) {
    const item = getCatalogItem(f.catalogItemId); if (item.layer === 'rug') continue;
    const a = -f.angleDeg * Math.PI / 180, dx = cx - f.xCm, dz = cz - f.zCm;
    const localX = dx * Math.cos(a) - dz * Math.sin(a), localZ = dx * Math.sin(a) + dz * Math.cos(a);
    const boxes = item.colliders ?? [{ xCm: 0, zCm: 0, yCm: item.heightCm / 2, widthCm: item.widthCm, depthCm: item.depthCm, heightCm: item.heightCm }];
    for (const box of boxes) {
      if (f.yCm + box.yCm - box.heightCm / 2 >= 175 || f.yCm + box.yCm + box.heightCm / 2 <= 2) continue;
      const px = Math.max(box.xCm - box.widthCm / 2, Math.min(box.xCm + box.widthCm / 2, localX));
      const pz = Math.max(box.zCm - box.depthCm / 2, Math.min(box.zCm + box.depthCm / 2, localZ));
      if (Math.hypot(localX - px, localZ - pz) < radius) return false;
    }
  }
  return true;
}
