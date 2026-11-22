import type { Intersection, Object3D } from 'three';

/** Three's Raycaster intentionally ignores Object3D.visible. The editor must not. */
export function visibleIntersections<T extends Intersection>(intersections: T[]): T[] {
  return intersections.filter(hit => {
    let object: Object3D | null = hit.object;
    while (object) {
      if (!object.visible) return false;
      object = object.parent;
    }
    return true;
  });
}
