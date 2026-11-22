import { beforeEach, describe, expect, it } from 'vitest';
import { getCatalogItem } from '../domain/catalog';
import { getRoomBounds, normalizeSupport, openingWorld, validateApartment, wallRoomIds } from '../domain/geometry';
import { apartmentFromRectangles } from '../domain/templates';
import type { Apartment, EditorStep, FurnitureInstance, FurnitureKind } from '../domain/types';
import { useEditor } from './editor';

const initial = useEditor.getState();
beforeEach(() => {
  useEditor.setState({ ...initial, history: [], future: [], quality: { ...initial.quality } }, true);
});
function fixture(): Apartment {
  return apartmentFromRectangles('test', 'Проверочная квартира', [
    { id: 'living', name: 'Комната A', type: 'living', x0: 0, x1: 420, z0: 0, z1: 330 },
    { id: 'hall', name: 'Коридор Б', type: 'hall', x0: 420, x1: 640, z0: 0, z1: 330 },
  ]);
}
function seed(step: EditorStep = 'interior', project = fixture()): Apartment {
  expect(validateApartment(project).valid).toBe(true);
  useEditor.setState({ project, step, activeRoomId: 'living' });
  return project;
}
function furniture(kind: FurnitureKind, patch: Partial<FurnitureInstance> = {}): FurnitureInstance {
  return { id: `${kind}-1`, catalogItemId: kind, roomId: 'living', xCm: 200, zCm: 100, yCm: 0,
    angleDeg: 0, color: getCatalogItem(kind).color, ...patch };
}
const sharedWall = (p: Apartment) => Object.values(p.walls).find(w => wallRoomIds(p, w.id).length === 2)!;

describe('preview and atomic editor commands', () => {
  it('keeps placement previews out of the project and commits one final position once', () => {
    const original = seed();
    useEditor.getState().armPlacement('coffee-table');
    useEditor.getState().previewAt(202, 103);
    expect(useEditor.getState().draft?.xCm).toBe(200);
    expect(useEditor.getState().draft?.zCm).toBe(105);
    const id = useEditor.getState().draft!.id;
    useEditor.getState().previewAt(211.7, 109.2, true);
    expect(useEditor.getState().draft?.id).toBe(id);
    expect(useEditor.getState().draft?.xCm).toBe(211.7);
    expect(useEditor.getState().project).toBe(original);
    expect(original.furniture).toEqual([]);
    expect(useEditor.getState().history).toHaveLength(0);
    expect(useEditor.getState().commitDraft()).toBe(true);
    expect(useEditor.getState().project!.furniture).toHaveLength(1);
    expect(useEditor.getState().project!.furniture[0].xCm).toBe(211.7);
    expect(useEditor.getState().history).toHaveLength(1);
    expect(useEditor.getState().commitDraft()).toBe(false);
    expect(useEditor.getState().history).toHaveLength(1);
  });
  it('rejects invalid new placement and restores an existing object after invalid drop', () => {
    seed();
    useEditor.getState().armPlacement('coffee-table');
    useEditor.getState().previewAt(0, 0);
    expect(useEditor.getState().draftValidation.valid).toBe(false);
    expect(useEditor.getState().commitDraft()).toBe(false);
    expect(useEditor.getState().project!.furniture).toEqual([]);
    expect(useEditor.getState().history).toHaveLength(0);
    useEditor.getState().armPlacement('coffee-table');
    useEditor.getState().previewAt(200, 100);
    expect(useEditor.getState().commitDraft()).toBe(true);
    const before = structuredClone(useEditor.getState().project), history = useEditor.getState().history.length;
    useEditor.getState().beginDrag(before!.furniture[0].id);
    useEditor.getState().previewAt(0, 0);
    expect(useEditor.getState().commitDraft()).toBe(false);
    expect(useEditor.getState().project).toEqual(before);
    expect(useEditor.getState().history).toHaveLength(history);
    expect(useEditor.getState().draft).toBeNull();
    expect(useEditor.getState().notice).toContain('стен');
  });
  it('cancels the draft on a room change without mutating the apartment', () => {
    const original = seed();
    useEditor.getState().armPlacement('chair');
    useEditor.getState().previewAt(200, 100);
    useEditor.getState().setActiveRoom('hall');
    expect(useEditor.getState().draft).toBeNull();
    expect(useEditor.getState().placement).toBeNull();
    expect(useEditor.getState().project).toBe(original);
    expect(useEditor.getState().history).toHaveLength(0);
  });
  it('previews shared geometry without history and leaves the state atomic after refusal', () => {
    const original = seed('geometry'), wall = sharedWall(original);
    useEditor.getState().previewWall(wall.id, 30);
    expect(useEditor.getState().geometryPreview?.validation.valid).toBe(true);
    expect(useEditor.getState().history).toHaveLength(0);
    expect(useEditor.getState().project).toBe(original);
    useEditor.getState().cancelGeometry();
    useEditor.getState().previewWall(wall.id, 200);
    expect(useEditor.getState().geometryPreview?.validation.valid).toBe(false);
    useEditor.getState().commitGeometry();
    expect(useEditor.getState().project).toBe(original);
    expect(useEditor.getState().history).toHaveLength(0);
    expect(useEditor.getState().notice).toBeTruthy();
  });
  it('blocks a wall move because of furniture in the inactive room', () => {
    const p = fixture();
    p.furniture.push(furniture('wardrobe', { roomId: 'hall', xCm: 525, zCm: 70 }));
    seed('geometry', p);
    useEditor.getState().previewWall(sharedWall(p).id, 30);
    useEditor.getState().commitGeometry();
    expect(useEditor.getState().project).toBe(p);
    expect(useEditor.getState().notice).toContain('Коридор Б');
    expect(useEditor.getState().activeRoomId).toBe('living');
    expect(useEditor.getState().history).toHaveLength(0);
  });
  it('updates one shared opening and rejects an invalid later edit without losing it', () => {
    const p = seed('geometry'), wall = sharedWall(p), door = p.openings.find(o => o.wallId === wall.id)!;
    const oldPosition = openingWorld(p, door).center;
    useEditor.getState().updateOpening(door.id, { offsetCm: door.offsetCm + 10 });
    const changed = useEditor.getState().project!, newDoor = changed.openings.find(o => o.id === door.id)!;
    expect(changed.openings.filter(o => o.id === door.id)).toHaveLength(1);
    expect(openingWorld(changed, newDoor).center).toEqual({ xCm: oldPosition.xCm, zCm: oldPosition.zCm + 10 });
    expect(wallRoomIds(changed, newDoor.wallId).sort()).toEqual(['hall', 'living']);
    useEditor.getState().updateOpening(door.id, { widthCm: 500 });
    expect(useEditor.getState().project).toBe(changed);
    expect(useEditor.getState().history).toHaveLength(1);
  });
});

describe('materials, history and context', () => {
  it('changes one side of a shared wall without modifying the other side', () => {
    const p = seed(), wall = sharedWall(p), neighbourBefore = structuredClone(p.wallFinishes[`${wall.id}:hall`]);
    useEditor.getState().setWallFinish(wall.id, 'living', { kind: 'wallpaper', color: '#a1af9d' });
    expect(useEditor.getState().project!.wallFinishes[`${wall.id}:living`]).toEqual({ kind: 'wallpaper', color: '#a1af9d' });
    expect(useEditor.getState().project!.wallFinishes[`${wall.id}:hall`]).toEqual(neighbourBefore);
    useEditor.getState().undo();
    expect(useEditor.getState().project).toEqual(p);
    useEditor.getState().redo();
    expect(useEditor.getState().project!.wallFinishes[`${wall.id}:living`].kind).toBe('wallpaper');
  });
  it('undoes and redoes geometry, furniture, floor and wall finish as whole commands', () => {
    const original = seed('geometry'), wall = sharedWall(original);
    useEditor.getState().previewWall(wall.id, 30);
    useEditor.getState().commitGeometry();
    expect(getRoomBounds(useEditor.getState().project!, 'living').xMax).toBe(445);
    useEditor.getState().setStep('interior');
    useEditor.getState().armPlacement('coffee-table');
    useEditor.getState().previewAt(200, 100);
    expect(useEditor.getState().commitDraft()).toBe(true);
    useEditor.getState().setFloor('living', { kind: 'carpet', color: '#777e81' });
    useEditor.getState().setWallFinish(wall.id, 'living', { kind: 'paint', color: '#9fadb2' });
    const final = structuredClone(useEditor.getState().project);
    expect(useEditor.getState().history).toHaveLength(4);
    useEditor.getState().setTime(23);
    for (let i = 0; i < 4; i++) useEditor.getState().undo();
    expect(useEditor.getState().project).toEqual(original);
    expect(useEditor.getState().future).toHaveLength(4);
    expect(useEditor.getState().timeOfDay).toBe(23);
    for (let i = 0; i < 4; i++) useEditor.getState().redo();
    expect(useEditor.getState().project).toEqual(final);
    expect(useEditor.getState().future).toHaveLength(0);
  });
  it('keeps time, room selection and cancelled previews out of history', () => {
    const p = seed();
    useEditor.getState().setTime(6);
    useEditor.getState().armPlacement('chair');
    useEditor.getState().previewAt(200, 100);
    useEditor.getState().cancelDraft();
    useEditor.getState().setActiveRoom('hall');
    useEditor.getState().setActiveRoom('living');
    expect(useEditor.getState().project).toBe(p);
    expect(useEditor.getState().history).toHaveLength(0);
    expect(useEditor.getState().dirty).toBe(false);
  });
  it('continues the same template and requires confirmation before replacing edited work', () => {
    useEditor.getState().setLivingRooms(1);
    useEditor.getState().setArea('44,5');
    expect(useEditor.getState().chooseTemplate('1a')).toBe(true);
    const roomId = useEditor.getState().activeRoomId;
    useEditor.getState().setFloor(roomId, { kind: 'carpet', color: '#777e81' });
    const edited = useEditor.getState().project;
    expect(useEditor.getState().chooseTemplate('1a')).toBe(true);
    expect(useEditor.getState().project).toBe(edited);
    expect(useEditor.getState().history).toHaveLength(1);
    expect(useEditor.getState().chooseTemplate('2a')).toBe(false);
    expect(useEditor.getState().project).toBe(edited);
    expect(useEditor.getState().chooseTemplate('2a', true)).toBe(true);
    expect(useEditor.getState().project!.templateId).toBe('2a');
    expect(useEditor.getState().project!.furniture).toEqual([]);
    expect(useEditor.getState().history).toEqual([]);
    expect(useEditor.getState().future).toEqual([]);
    expect(useEditor.getState().dirty).toBe(false);
    expect(useEditor.getState().requestedArea).toBe('44,5');
  });
  it('preserves selected furniture on a click in the already active room', () => {
    seed();
    useEditor.getState().armPlacement('chair');
    useEditor.getState().previewAt(200, 100);
    expect(useEditor.getState().commitDraft()).toBe(true);
    const selected = useEditor.getState().selection;
    useEditor.getState().setActiveRoom('living');
    expect(useEditor.getState().selection).toEqual(selected);
  });
  it('moves a table and its supported lamp together in one undoable command', () => {
    const p = fixture(), table = furniture('dining-table', { xCm: 210, zCm: 100 });
    p.furniture.push(table);
    const lamp = normalizeSupport(p, furniture('table-lamp', { xCm: 245, zCm: 90 }));
    p.furniture.push(lamp);
    seed('interior', p);
    useEditor.getState().beginDrag(table.id);
    useEditor.getState().setDraft({ ...table, xCm: 240, zCm: 140, angleDeg: 90 });
    expect(useEditor.getState().draftValidation.valid, useEditor.getState().draftValidation.reason).toBe(true);
    expect(useEditor.getState().commitDraft()).toBe(true);
    const after = useEditor.getState().project!, movedLamp = after.furniture.find(f => f.id === lamp.id)!;
    expect(after.furniture).toHaveLength(2);
    expect(movedLamp.xCm).toBeCloseTo(250, 8);
    expect(movedLamp.zCm).toBeCloseTo(175, 8);
    expect(movedLamp.angleDeg).toBe(90);
    expect(movedLamp.supportId).toBe(table.id);
    expect(useEditor.getState().history).toHaveLength(1);
    useEditor.getState().undo();
    expect(useEditor.getState().project).toEqual(p);
  });
});
