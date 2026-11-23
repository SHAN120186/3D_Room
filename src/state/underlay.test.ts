import { beforeEach, describe, expect, it } from 'vitest';
import { TEMPLATES } from '../domain/templates';
import { getRoomBounds } from '../domain/geometry';
import { useEditor } from './editor';
import { calibrateUnderlay, createUnderlay, fitUnderlay, imageToPlan, planToImage, rotateUnderlay, scaleUnderlayAbout, underlayBounds } from './underlay';
import type { Underlay } from './underlay';

const source = { url: 'blob:plan', name: 'plan.jpg', widthPx: 2000, heightPx: 1500 };
const placed = (patch: Partial<Underlay> = {}): Underlay => ({ ...createUnderlay(source), xCm: 100, zCm: -50, cmPerPx: 0.6, fitted: true, ...patch });
const close = (a: { xCm: number; zCm: number }, b: { xCm: number; zCm: number }) => { expect(a.xCm).toBeCloseTo(b.xCm, 6); expect(a.zCm).toBeCloseTo(b.zCm, 6); };

describe('photo underlay geometry', () => {
  it('maps pixels to plan centimetres and back for every quarter turn', () => {
    for (const rotation of [0, 90, 180, 270] as const) {
      const u = placed({ rotation });
      const p = imageToPlan(u, 431, 977), back = planToImage(u, p);
      expect(back.px).toBeCloseTo(431, 6); expect(back.py).toBeCloseTo(977, 6);
    }
    close(imageToPlan(placed({ rotation: 90 }), 100, 0), { xCm: 100, zCm: 10 });
  });

  it('first placement covers the apartment and is centred on it', () => {
    const project = TEMPLATES[4].apartment, u = fitUnderlay(createUnderlay(source), project), b = underlayBounds(u);
    const rooms = project.rooms.map(r => getRoomBounds(project, r.id, false));
    const xMin = Math.min(...rooms.map(r => r.xMin)), xMax = Math.max(...rooms.map(r => r.xMax)), zMin = Math.min(...rooms.map(r => r.zMin)), zMax = Math.max(...rooms.map(r => r.zMax));
    expect(u.fitted).toBe(true);
    expect(b.xMin).toBeLessThanOrEqual(xMin); expect(b.xMax).toBeGreaterThanOrEqual(xMax);
    expect(b.zMin).toBeLessThanOrEqual(zMin); expect(b.zMax).toBeGreaterThanOrEqual(zMax);
    expect((b.xMin + b.xMax) / 2).toBeCloseTo((xMin + xMax) / 2, 6);
    expect((b.zMin + b.zMax) / 2).toBeCloseTo((zMin + zMax) / 2, 6);
  });

  it('scaling keeps the anchor point and turning keeps the centre', () => {
    const u = placed(), anchor = { xCm: 340, zCm: 210 }, before = planToImage(u, anchor);
    const scaled = scaleUnderlayAbout(u, anchor, 1.7);
    close(imageToPlan(scaled, before.px, before.py), anchor);
    const centre = imageToPlan(u, source.widthPx / 2, source.heightPx / 2);
    let turned = u;
    for (let i = 0; i < 4; i++) { turned = rotateUnderlay(turned); close(imageToPlan(turned, source.widthPx / 2, source.heightPx / 2), centre); }
    expect(turned.rotation).toBe(0);
    close({ xCm: turned.xCm, zCm: turned.zCm }, { xCm: u.xCm, zCm: u.zCm });
  });

  it('two-point calibration makes the marked segment equal to the real length', () => {
    const u = placed(), a = { xCm: 120, zCm: 40 }, b = { xCm: 420, zCm: 440 }, pa = planToImage(u, a), pb = planToImage(u, b);
    const c = calibrateUnderlay(u, a, b, 650)!;
    const na = imageToPlan(c, pa.px, pa.py), nb = imageToPlan(c, pb.px, pb.py);
    close(na, a);
    expect(Math.hypot(nb.xCm - na.xCm, nb.zCm - na.zCm)).toBeCloseTo(650, 6);
    expect(calibrateUnderlay(u, a, a, 650)).toBeNull();
    expect(calibrateUnderlay(u, a, b, 0)).toBeNull();
    expect(calibrateUnderlay(u, a, b, Number.NaN)).toBeNull();
  });
});

describe('photo underlay in the editor', () => {
  beforeEach(() => useEditor.setState({ project: null, step: 'start', underlay: null, underlayTool: 'none', calibration: [], history: [], future: [], dirty: false, notice: null }));

  it('a photo attached on the start screen is placed when a scheme is chosen', () => {
    const editor = useEditor.getState();
    editor.attachUnderlay(source);
    expect(useEditor.getState().underlay?.fitted).toBe(false);
    expect(editor.chooseTemplate('2b')).toBe(true);
    expect(useEditor.getState().underlay?.fitted).toBe(true);
  });

  it('calibration changes only the photo, never the apartment or its history', () => {
    const editor = useEditor.getState();
    editor.chooseTemplate('2b');
    editor.attachUnderlay(source);
    const project = useEditor.getState().project;
    editor.setUnderlayTool('calibrate');
    editor.addCalibrationPoint({ xCm: 0, zCm: 0 });
    editor.addCalibrationPoint({ xCm: 300, zCm: 400 });
    expect(useEditor.getState().applyCalibration(1000)).toBe(true);
    const state = useEditor.getState();
    expect(state.project).toBe(project);
    expect(state.history).toHaveLength(0);
    expect(state.underlayTool).toBe('none');
    expect(state.calibration).toEqual([]);
  });

  it('a third mark starts a new measurement', () => {
    const editor = useEditor.getState();
    editor.chooseTemplate('1a');
    editor.attachUnderlay(source);
    editor.setUnderlayTool('calibrate');
    for (const x of [0, 100, 250]) useEditor.getState().addCalibrationPoint({ xCm: x, zCm: 0 });
    expect(useEditor.getState().calibration).toEqual([{ xCm: 250, zCm: 0 }]);
    expect(useEditor.getState().applyCalibration(500)).toBe(false);
  });
});
