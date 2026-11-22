import { create } from 'zustand';
import type { Apartment, EditorStep, FloorFinish, FurnitureInstance, GeometryPreview, Opening, QualityStatus, Selection, Validation, WallFinish } from '../domain/types';
import { getCatalogItem } from '../domain/catalog';
import { TEMPLATES } from '../domain/templates';
import { normalizeSupport, proposeWallMove, rotatePoint, validateApartment, VALID } from '../domain/geometry';

const newQuality = (): QualityStatus => ({ running: false, samples: 0, seconds: 0, error: null, complete: false });
export interface EditorStore {
  project: Apartment | null; step: EditorStep; livingRooms: 1 | 2 | 3; requestedArea: string;
  activeRoomId: string; selection: Selection; viewMode: 'split' | '2d' | '3d'; planOverview: boolean;
  timeOfDay: number; walking: boolean; quality: QualityStatus; webglAvailable: boolean | null;
  placement: string | null; draft: FurnitureInstance | null; draftValidation: Validation; placementAngle: number;
  geometryPreview: GeometryPreview | null; notice: string | null;
  history: Apartment[]; future: Apartment[]; dirty: boolean;
  setStep: (step: EditorStep) => void; setLivingRooms: (n: 1 | 2 | 3) => void; setArea: (value: string) => void;
  chooseTemplate: (id: string, force?: boolean) => boolean;
  setActiveRoom: (id: string) => void; select: (selection: Selection) => void;
  setView: (view: 'split' | '2d' | '3d') => void; toggleOverview: () => void; setTime: (time: number) => void;
  setWalking: (enabled: boolean) => void; setQuality: (enabled: boolean) => void; updateQuality: (partial: Partial<QualityStatus>) => void; setWebglAvailable: (available: boolean | null) => void;
  armPlacement: (id: string) => void; beginDrag: (id: string) => void; previewAt: (xCm: number, zCm: number, alt?: boolean) => void;
  setDraft: (draft: FurnitureInstance) => void; commitDraft: () => boolean; cancelDraft: () => void;
  moveSelected: (dx: number, dz: number) => void; rotateSelected: (delta: number) => void; deleteSelected: () => void;
  previewWall: (wallId: string, deltaCm: number) => void; previewOpening: (id: string, patch: Partial<Opening>) => void; commitGeometry: () => void; cancelGeometry: () => void;
  updateOpening: (id: string, patch: Partial<Opening>) => void; setCeiling: (heightCm: number) => void;
  setWallFinish: (wallId: string, roomId: string, finish: WallFinish) => void; setFloor: (roomId: string, finish: FloorFinish) => void;
  toggleRoomLight: (roomId: string) => void; undo: () => void; redo: () => void; setNotice: (notice: string | null) => void;
  applyProject: (project: Apartment) => Validation;
}

/** A supported lamp follows its table in the same atomic command and is also collision-checked. */
export function withFurniture(project: Apartment, draft: FurnitureInstance): Apartment {
  const next = structuredClone(project), old = project.furniture.find(f => f.id === draft.id);
  next.furniture = next.furniture.filter(f => f.id !== draft.id);
  next.furniture.push({ ...draft });
  if (old) for (const child of next.furniture.filter(f => f.supportId === old.id)) {
    const offset = rotatePoint({ xCm: child.xCm - old.xCm, zCm: child.zCm - old.zCm }, draft.angleDeg - old.angleDeg);
    child.xCm = draft.xCm + offset.xCm; child.zCm = draft.zCm + offset.zCm;
    child.angleDeg += draft.angleDeg - old.angleDeg; child.yCm += draft.yCm - old.yCm;
  }
  return next;
}
export const useEditor = create<EditorStore>((set, get) => ({
  project: null, step: 'start', livingRooms: 2, requestedArea: '68', activeRoomId: '', selection: null,
  viewMode: 'split', planOverview: false, timeOfDay: 14, walking: false, quality: newQuality(), webglAvailable: null,
  placement: null, draft: null, draftValidation: VALID, placementAngle: 0, geometryPreview: null, notice: null,
  history: [], future: [], dirty: false,
  setStep: step => set({ step, placement: null, draft: null, draftValidation: VALID, walking: false, quality: newQuality(), geometryPreview: null, notice: null }),
  setLivingRooms: livingRooms => set({ livingRooms }),
  setArea: requestedArea => set({ requestedArea }),
  chooseTemplate: (id, force = false) => {
    const state = get(), template = TEMPLATES.find(t => t.id === id);
    if (!template) { set({ notice: 'Схема не найдена. Выберите другой вариант.' }); return false; }
    if (state.project?.templateId === id) { state.setStep('geometry'); return true; }
    if (state.project && state.dirty && !force) return false;
    const project = structuredClone(template.apartment), validation = validateApartment(project);
    if (!validation.valid) { set({ notice: validation.reason }); return false; }
    set({ project, activeRoomId: project.rooms[0].id, step: 'geometry', selection: null, placement: null, draft: null, draftValidation: VALID, geometryPreview: null, history: [], future: [], dirty: false, quality: newQuality(), walking: false, notice: null });
    return true;
  },
  setActiveRoom: id => { if (id !== get().activeRoomId && get().project?.rooms.some(r => r.id === id)) set({ activeRoomId: id, selection: null, placement: null, draft: null, draftValidation: VALID, quality: newQuality(), geometryPreview: null, notice: null }); },
  select: selection => set({ selection, draft: null, placement: null, draftValidation: VALID, geometryPreview: null, notice: null }),
  setView: viewMode => set({ viewMode, draft: null, placement: null, draftValidation: VALID, walking: false, quality: newQuality() }),
  toggleOverview: () => set(s => ({ planOverview: !s.planOverview, draft: null, placement: null, draftValidation: VALID })),
  setTime: value => set({ timeOfDay: Math.max(0, Math.min(24, Number.isFinite(value) ? value : 14)), quality: newQuality() }),
  setWalking: walking => { if (walking && get().webglAvailable === false) { set({ notice: 'Прогулка требует WebGL. Откройте проект в браузере с поддержкой 3D.' }); return; } set({ walking, placement: null, draft: null, selection: null, viewMode: walking ? '3d' : get().viewMode, quality: newQuality(), notice: null }); },
  setQuality: enabled => { if (enabled && get().webglAvailable === false) { set({ notice: 'Качественный снимок требует WebGL. 2D-план остаётся доступен.' }); return; } set({ quality: { ...newQuality(), running: enabled }, walking: false, placement: null, draft: null, selection: null, notice: null }); },
  setWebglAvailable: available => set({ webglAvailable: available, ...(available === false ? { quality: newQuality(), walking: false } : {}) }),
  updateQuality: partial => set(s => ({ quality: { ...s.quality, ...partial } })),
  setNotice: notice => set({ notice }),
  applyProject: project => {
    const state = get(), validation = validateApartment(project);
    if (!validation.valid) { set({ notice: validation.reason }); return validation; }
    if (state.project && JSON.stringify(state.project) === JSON.stringify(project)) { set({ geometryPreview: null, notice: null }); return VALID; }
    set({ project, history: state.project ? [...state.history, state.project].slice(-80) : [], future: [], dirty: true, quality: newQuality(), geometryPreview: null, notice: null });
    return VALID;
  },
  armPlacement: id => {
    if (!get().project || get().step !== 'interior') return;
    try { getCatalogItem(id); } catch { set({ notice: 'Предмет не найден в каталоге' }); return; }
    set({ placement: id, placementAngle: 0, selection: null, draft: null, draftValidation: VALID, walking: false, quality: newQuality(), notice: null });
  },
  beginDrag: id => {
    const instance = get().project?.furniture.find(f => f.id === id);
    if (!instance || get().step !== 'interior') return;
    set({ draft: { ...instance }, placement: null, selection: { kind: 'furniture', id }, draftValidation: VALID, quality: newQuality(), notice: null });
  },
  previewAt: (xCm, zCm, alt = false) => {
    const s = get();
    if (!s.project || (!s.placement && !s.draft)) return;
    if (!Number.isFinite(xCm) || !Number.isFinite(zCm)) return;
    let instance = s.draft;
    if (!instance && s.placement) {
      const item = getCatalogItem(s.placement);
      instance = { id: `item-${crypto.randomUUID()}`, catalogItemId: item.id, roomId: s.activeRoomId, xCm, zCm, yCm: 0, angleDeg: s.placementAngle, color: item.color };
    }
    if (!instance) return;
    s.setDraft({ ...instance, xCm: alt ? xCm : Math.round(xCm / 5) * 5, zCm: alt ? zCm : Math.round(zCm / 5) * 5 });
  },
  setDraft: input => {
    const project = get().project;
    if (!project) return;
    try {
      const draft = normalizeSupport(project, { ...input, angleDeg: ((input.angleDeg % 360) + 360) % 360 });
      const validation = validateApartment(withFurniture(project, draft));
      set({ draft, draftValidation: validation, notice: null, quality: newQuality() });
    } catch (error) { set({ draft: input, draftValidation: { valid: false, code: 'placement', reason: error instanceof Error ? error.message : 'Не удалось определить положение предмета' } }); }
  },
  commitDraft: () => {
    const s = get();
    if (!s.project || !s.draft) return false;
    const candidate = withFurniture(s.project, s.draft), validation = validateApartment(candidate);
    if (!validation.valid) { set({ draft: null, placement: null, draftValidation: VALID, notice: validation.reason }); return false; }
    const id = s.draft.id, result = s.applyProject(candidate);
    if (!result.valid) return false;
    set({ draft: null, placement: null, draftValidation: VALID, selection: { kind: 'furniture', id }, notice: null });
    return true;
  },
  cancelDraft: () => set({ draft: null, placement: null, draftValidation: VALID, notice: null }),
  moveSelected: (dx, dz) => {
    const s = get(); if (!s.project || s.selection?.kind !== 'furniture' || s.step !== 'interior') return;
    const item = s.project.furniture.find(f => f.id === s.selection!.id); if (!item) return;
    s.setDraft({ ...item, xCm: item.xCm + dx, zCm: item.zCm + dz }); get().commitDraft();
  },
  rotateSelected: delta => {
    const s = get();
    if (s.step !== 'interior') return;
    if (s.draft) {
      if (getCatalogItem(s.draft.catalogItemId).placement === 'wall') return;
      s.setDraft({ ...s.draft, angleDeg: s.draft.angleDeg + delta }); return;
    }
    if (s.placement) { set({ placementAngle: s.placementAngle + delta }); return; }
    if (!s.project || s.selection?.kind !== 'furniture') return;
    const item = s.project.furniture.find(f => f.id === s.selection!.id);
    if (!item || getCatalogItem(item.catalogItemId).placement === 'wall') return;
    s.setDraft({ ...item, angleDeg: item.angleDeg + delta }); get().commitDraft();
  },
  deleteSelected: () => {
    const s = get(); if (!s.project || s.selection?.kind !== 'furniture' || s.step !== 'interior') return;
    const next = structuredClone(s.project), id = s.selection.id;
    next.furniture = next.furniture.filter(f => f.id !== id && f.supportId !== id);
    if (s.applyProject(next).valid) set({ selection: null, draft: null, placement: null });
  },
  previewWall: (id, delta) => { const project = get().project; if (project && get().step === 'geometry') set({ geometryPreview: proposeWallMove(project, id, delta), notice: null }); },
  previewOpening: (id, patch) => {
    const s = get(); if (!s.project || s.step !== 'geometry') return;
    const project = structuredClone(s.project), opening = project.openings.find(o => o.id === id);
    if (!opening) return;
    if (patch.offsetCm !== undefined) opening.offsetCm = patch.offsetCm;
    if (patch.widthCm !== undefined) opening.widthCm = patch.widthCm;
    if (patch.heightCm !== undefined) opening.heightCm = patch.heightCm;
    if (patch.sillCm !== undefined && opening.kind === 'window') opening.sillCm = patch.sillCm;
    if (patch.hinge !== undefined) opening.hinge = patch.hinge;
    if (patch.swingRoomId !== undefined) opening.swingRoomId = patch.swingRoomId;
    set({ geometryPreview: { project, validation: validateApartment(project), affected: [] }, notice: null });
  },
  commitGeometry: () => { const s = get(); if (!s.geometryPreview) return; if (!s.geometryPreview.validation.valid) { set({ notice: s.geometryPreview.validation.reason }); return; } s.applyProject(s.geometryPreview.project); },
  cancelGeometry: () => set({ geometryPreview: null, notice: null }),
  updateOpening: (id, patch) => {
    const s = get(); if (!s.project || s.step !== 'geometry') return;
    const next = structuredClone(s.project), opening = next.openings.find(o => o.id === id);
    if (!opening) return;
    // Wall identity and opening kind are fixed by the template; editing moves only along this wall.
    const { offsetCm, widthCm, heightCm, sillCm, hinge, swingRoomId } = patch;
    if (offsetCm !== undefined) opening.offsetCm = offsetCm;
    if (widthCm !== undefined) opening.widthCm = widthCm;
    if (heightCm !== undefined) opening.heightCm = heightCm;
    if (sillCm !== undefined && opening.kind === 'window') opening.sillCm = sillCm;
    if (hinge !== undefined) opening.hinge = hinge;
    if (swingRoomId !== undefined) opening.swingRoomId = swingRoomId;
    s.applyProject(next);
  },
  setCeiling: value => {
    const s = get(); if (!s.project || s.step !== 'geometry') return;
    const next = structuredClone(s.project), delta = value - next.ceilingHeightCm;
    next.ceilingHeightCm = value;
    for (const item of next.furniture) if (getCatalogItem(item.catalogItemId).placement === 'ceiling') item.yCm += delta;
    s.applyProject(next);
  },
  setWallFinish: (wallId, roomId, finish) => {
    const s = get(); if (!s.project || !s.project.rooms.find(r => r.id === roomId)?.boundary.some(b => b.wallId === wallId)) return;
    const next = structuredClone(s.project); next.wallFinishes[`${wallId}:${roomId}`] = { ...finish }; s.applyProject(next);
  },
  setFloor: (roomId, finish) => { const s = get(); if (!s.project) return; const next = structuredClone(s.project), room = next.rooms.find(r => r.id === roomId); if (room) { room.floor = { ...finish }; s.applyProject(next); } },
  toggleRoomLight: roomId => { const s = get(); if (!s.project) return; const next = structuredClone(s.project), room = next.rooms.find(r => r.id === roomId); if (room) { room.lightOn = !room.lightOn; s.applyProject(next); } },
  undo: () => {
    const s = get(), previous = s.history.at(-1); if (!s.project || !previous) return;
    set({ project: previous, history: s.history.slice(0, -1), future: [s.project, ...s.future].slice(0, 80), selection: null, draft: null, placement: null, draftValidation: VALID, geometryPreview: null, quality: newQuality(), notice: null });
  },
  redo: () => {
    const s = get(), next = s.future[0]; if (!s.project || !next) return;
    set({ project: next, history: [...s.history, s.project].slice(-80), future: s.future.slice(1), selection: null, draft: null, placement: null, draftValidation: VALID, geometryPreview: null, quality: newQuality(), notice: null });
  },
}));

export function installKeyboardShortcuts(): () => void {
  const handler = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
    const state = useEditor.getState(); if (!state.project) return;
    if ((event.ctrlKey || event.metaKey) && event.code === 'KeyZ') { event.preventDefault(); event.shiftKey ? state.redo() : state.undo(); return; }
    if ((event.ctrlKey || event.metaKey) && event.code === 'KeyY') { event.preventDefault(); state.redo(); return; }
    if (event.code === 'Escape') { event.preventDefault(); state.cancelDraft(); state.cancelGeometry(); if (state.quality.running || state.quality.complete) state.setQuality(false); if (state.walking) state.setWalking(false); return; }
    if (state.step !== 'interior' || state.walking || event.ctrlKey || event.metaKey) return;
    if (event.code === 'KeyR') { event.preventDefault(); state.rotateSelected(event.shiftKey ? -15 : 15); return; }
    if ((event.code === 'Delete' || event.code === 'Backspace') && state.selection?.kind === 'furniture') { event.preventDefault(); state.deleteSelected(); return; }
    if (state.selection?.kind === 'furniture' && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.code)) {
      event.preventDefault(); const distance = event.shiftKey ? 10 : 1;
      state.moveSelected(event.code === 'ArrowLeft' ? -distance : event.code === 'ArrowRight' ? distance : 0, event.code === 'ArrowUp' ? -distance : event.code === 'ArrowDown' ? distance : 0);
    }
  };
  const blur = () => { useEditor.getState().cancelDraft(); };
  window.addEventListener('keydown', handler); window.addEventListener('blur', blur);
  return () => { window.removeEventListener('keydown', handler); window.removeEventListener('blur', blur); };
}
