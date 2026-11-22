import { expect, it } from 'vitest';
import { TEMPLATES } from '../../domain/templates';
import { roomLightSources, MAX_ACTIVE_LIGHTS } from './lights';

it('a chandelier moves the main light to the actual fixture and lamps add bounded local sources', () => {
  const p = structuredClone(TEMPLATES[0].apartment), room = p.rooms[0];
  p.furniture.push({ id: 'chandelier-instance', catalogItemId: 'chandelier', roomId: room.id, xCm: 155, zCm: 250, yCm: 205, angleDeg: 0, color: '#bca679' });
  p.furniture.push({ id: 'floor-lamp-instance', catalogItemId: 'floor-lamp', roomId: room.id, xCm: 210, zCm: 265, yCm: 0, angleDeg: 0, color: '#c6bdac' });
  const sources = roomLightSources(p, [room]);
  expect(sources.some(s => s.id === `ceiling-${room.id}`)).toBe(false);
  expect(sources.find(s => s.id === 'chandelier-instance')?.position).toEqual([1.55, 2.2125, 2.5]);
  expect(sources.find(s => s.id === 'floor-lamp-instance')?.position).toEqual([2.1, 1.45, 2.65]);
  expect(sources.every(s => s.intensity > 0)).toBe(true);
  room.lightOn = false;
  expect(roomLightSources(p, [room])).toEqual([]);
});

it('enforces four sources per room and eight in a walkthrough while keeping room main lights', () => {
  const p = structuredClone(TEMPLATES[8].apartment);
  for (const room of p.rooms) for (let i = 0; i < 6; i++) p.furniture.push({ id: `${room.id}-lamp${i}`, catalogItemId: 'floor-lamp', roomId: room.id, xCm: 200 + i * 50, zCm: 200, yCm: 0, angleDeg: 0, color: '#c6bdac' });
  expect(roomLightSources(p, [p.rooms[0]])).toHaveLength(4);
  const sources = roomLightSources(p, p.rooms);
  expect(sources).toHaveLength(MAX_ACTIVE_LIGHTS);
  for (const room of p.rooms) expect(sources.some(s => s.id === `ceiling-${room.id}`)).toBe(true);
});
