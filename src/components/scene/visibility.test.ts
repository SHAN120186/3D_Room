import { expect, it } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { visibleIntersections } from './visibility';

it('excludes a cutaway wall and its child frames even though Three raycasts them', () => {
  const wall = new Group(), nestedFrame = new Group();
  const geometry = new BoxGeometry(1, 1, 1), material = new MeshBasicMaterial();
  const frame = new Mesh(geometry, material); nestedFrame.add(frame); wall.add(nestedFrame);
  wall.updateMatrixWorld(true);
  const ray = new Raycaster(new Vector3(0, 0, 3), new Vector3(0, 0, -1));
  wall.visible = false;
  const hiddenHits = ray.intersectObject(wall, true);
  expect(hiddenHits.length).toBeGreaterThan(0);
  expect(visibleIntersections(hiddenHits)).toEqual([]);
  wall.visible = true;
  expect(visibleIntersections(ray.intersectObject(wall, true)).length).toBeGreaterThan(0);
  geometry.dispose(); material.dispose();
});
