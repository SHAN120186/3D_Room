import { Component, Suspense, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { Canvas, events as createPointerEvents, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, useTexture } from '@react-three/drei';
import {
  ACESFilmicToneMapping, BoxGeometry, CanvasTexture, Color, DataTexture, DoubleSide,
  EquirectangularReflectionMapping, Euler, Group, LinearFilter, Plane, RectAreaLight,
  RepeatWrapping, RGBAFormat, SRGBColorSpace, Vector3,
} from 'three';
import type { WebGLPathTracer } from 'three-gpu-pathtracer';
import type { OrbitControls as OrbitControlType } from 'three-stdlib';
import { useEditor } from '../state/editor';
import { getCatalogItem } from '../domain/catalog';
import { getRoomBounds, getWallSegment, openingWorld, wallRoomIds } from '../domain/geometry';
import type { Apartment, FloorFinish, FurnitureInstance, Opening, Room, WallFinish } from '../domain/types';
import FurnitureModel from './FurnitureModel';
import { canWalk } from './scene/walk';
import { visibleIntersections } from './scene/visibility';
import { roomLightSources } from './scene/lights';

const QUALITY_SAMPLES = 96;
const FLOOR_PLANE = new Plane(new Vector3(0, 1, 0), 0);
const WORLD_UP = new Vector3(0, 1, 0);
const WALL_DEFAULT: WallFinish = { kind: 'paint', color: '#e7e5dc' };
const noRaycast = () => {};

function hash(n: number) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

function floorTexture(finish: FloorFinish, width: number, depth: number): CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512;
  const ctx = canvas.getContext('2d')!; const base = new Color(finish.color);
  ctx.fillStyle = finish.color; ctx.fillRect(0, 0, 512, 512);
  if (finish.kind === 'laminate') {
    for (let row = 0; row < 4; row++) {
      ctx.fillStyle = `#${base.clone().offsetHSL(0, 0, (hash(row + 2) - 0.5) * 0.09).getHexString()}`;
      ctx.fillRect(0, row * 128, 512, 128);
      for (let grain = 0; grain < 95; grain++) {
        const y = row * 128 + hash(grain + row * 100) * 128;
        ctx.strokeStyle = `rgba(57,39,23,${0.025 + hash(grain * 2 + row) * 0.06})`;
        ctx.lineWidth = 0.5 + hash(grain * 3) * 1.2; ctx.beginPath(); ctx.moveTo(0, y);
        ctx.bezierCurveTo(180, y + hash(grain) * 8, 350, y - hash(grain + 4) * 7, 512, y); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(50,37,25,0.22)'; ctx.fillRect(0, row * 128, 512, 1.2);
      const joint = [0, 256, 128, 384][row]; ctx.fillRect(joint, row * 128, 1.2, 128);
    }
  } else {
    const count = finish.kind === 'carpet' ? 25000 : 9000;
    for (let i = 0; i < count; i++) {
      const shade = hash(i * 7) > 0.5 ? '255,255,255' : '35,35,31';
      ctx.fillStyle = `rgba(${shade},${finish.kind === 'carpet' ? 0.1 : 0.055})`;
      ctx.fillRect(hash(i) * 512, hash(i + 1) * 512, finish.kind === 'carpet' ? 1 : 2, finish.kind === 'carpet' ? 3 : 2);
    }
  }
  const texture = new CanvasTexture(canvas); texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace; texture.anisotropy = 4;
  texture.repeat.set(width / 1.2, depth / (finish.kind === 'laminate' ? 0.76 : 1.2));
  return texture;
}

function RoomFloor({ project, room, onMove, onDown, onUp }: { project: Apartment; room: Room; onMove: (e: ThreeEvent<PointerEvent>) => void; onDown: (e: ThreeEvent<PointerEvent>) => void; onUp: (e: ThreeEvent<PointerEvent>) => void }) {
  const bounds = getRoomBounds(project, room.id); const axes = getRoomBounds(project, room.id, false);
  const w = (bounds.xMax - bounds.xMin) / 100, d = (bounds.zMax - bounds.zMin) / 100;
  const texture = useMemo(() => floorTexture(room.floor, w, d), [room.floor.kind, room.floor.color, w, d]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <group>
    <mesh position={[(axes.xMin + axes.xMax) / 200, -0.08, (axes.zMin + axes.zMax) / 200]} receiveShadow>
      <boxGeometry args={[(axes.xMax - axes.xMin) / 100, 0.16, (axes.zMax - axes.zMin) / 100]} />
      <meshStandardMaterial color="#b5aa97" roughness={0.9} />
    </mesh>
    <mesh position={[(bounds.xMin + bounds.xMax) / 200, 0.003, (bounds.zMin + bounds.zMax) / 200]} rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow onPointerMove={onMove} onPointerDown={onDown} onPointerUp={onUp}>
      <planeGeometry args={[w, d]} /><meshStandardMaterial map={texture} color="#ffffff" roughness={room.floor.kind === 'carpet' ? 1 : 0.74} />
    </mesh>
  </group>;
}

function WallpaperMaterial({ color }: { color: string }) {
  const textures = useTexture(['/textures/rough_linen_diff_1k.jpg', '/textures/rough_linen_nor_gl_1k.jpg', '/textures/rough_linen_rough_1k.jpg']);
  textures.forEach(texture => { texture.wrapS = texture.wrapT = RepeatWrapping; texture.anisotropy = 4; });
  textures[0].colorSpace = SRGBColorSpace;
  return <meshStandardMaterial color={color} map={textures[0]} normalMap={textures[1]} roughnessMap={textures[2]} roughness={0.9} />;
}

function WallBlock({ width, height, depth, x, y, z, finish }: { width: number; height: number; depth: number; x: number; y: number; z: number; finish: WallFinish }) {
  const geometry = useMemo(() => {
    const g = new BoxGeometry(width, height, depth); const uv = g.attributes.uv, p = g.attributes.position;
    for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + x) / 0.271, (p.getY(i) + y) / 0.271);
    return g;
  }, [width, height, depth, x, y]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} position={[x, y, z]} castShadow receiveShadow>
    {finish.kind === 'wallpaper' ? <WallpaperMaterial color={finish.color} /> : <meshStandardMaterial color={finish.color} roughness={0.88} />}
  </mesh>;
}

function Trim({ size, at, color = '#f0ede5' }: { size: [number, number, number]; at: [number, number, number]; color?: string }) {
  return <mesh position={at} castShadow receiveShadow><boxGeometry args={size} /><meshStandardMaterial color={color} roughness={0.6} /></mesh>;
}

function WallOpening({ opening, wallLength, depth, side, project, room, navigate }: {
  opening: Opening; wallLength: number; depth: number; side: number; project: Apartment; room: Room; navigate: (opening: Opening) => void;
}) {
  const w = opening.widthCm / 100, h = opening.heightCm / 100, bottom = opening.sillCm / 100;
  const x = (opening.offsetCm + opening.widthCm / 2) / 100 - wallLength / 2;
  const selected = useEditor(s => s.selection?.kind === 'opening' && s.selection.id === opening.id);
  const frameColor = selected ? '#d9bb89' : '#f1eee7';
  const select = (e: ThreeEvent<MouseEvent>) => {
    if (useEditor.getState().placement || useEditor.getState().draft || useEditor.getState().walking) return;
    e.stopPropagation();
    if (opening.kind === 'door') navigate(opening); else useEditor.getState().select({ kind: 'opening', id: opening.id });
  };
  return <group position={[x, 0, 0]} onClick={select}>
    <Trim size={[0.045, h, depth + 0.025]} at={[-w / 2 + 0.0225, bottom + h / 2, 0]} color={frameColor} />
    <Trim size={[0.045, h, depth + 0.025]} at={[w / 2 - 0.0225, bottom + h / 2, 0]} color={frameColor} />
    <Trim size={[w, 0.045, depth + 0.025]} at={[0, bottom + h - 0.0225, 0]} color={frameColor} />
    {opening.kind === 'window' ? <>
      <Trim size={[w + 0.07, 0.045, depth + 0.15]} at={[0, bottom - 0.012, side * 0.05]} />
      <Trim size={[0.035, h, 0.065]} at={[0, bottom + h / 2, 0]} />
      <mesh position={[0, bottom + h / 2, 0]}><boxGeometry args={[w - 0.07, h - 0.06, 0.008]} />
        <meshStandardMaterial color="#c2d4d5" transparent opacity={0.13} roughness={0.08} metalness={0.1} depthWrite={false} />
      </mesh>
      <Trim size={[0.012, 0.1, 0.018]} at={[0.045, bottom + h * 0.48, side * 0.045]} color="#3b3b37" />
    </> : (() => {
      const hinge = opening.hinge === 'start' ? -1 : 1;
      const swingsHere = opening.swingRoomId === room.id;
      const leafSide = swingsHere ? side : -side;
      return <group position={[hinge * (w / 2 - 0.04), 0, 0]} rotation={[0, hinge * leafSide * Math.PI / 2.2, 0]}>
        <Trim size={[w - 0.08, h - 0.07, 0.035]} at={[-hinge * (w - 0.08) / 2, (h - 0.07) / 2, 0]} color="#cfc9bc" />
        <Trim size={[0.1, 0.012, 0.022]} at={[-hinge * (w - 0.17), h * 0.47, side * 0.031]} color="#af986a" />
      </group>;
    })()}
  </group>;
}

function RoomWall({ project, room, wallId, walking }: { project: Apartment; room: Room; wallId: string; walking: boolean }) {
  const ref = useRef<Group>(null); const quality = useEditor(s => s.quality);
  const segment = getWallSegment(project, wallId); const wall = project.walls[wallId]; const bounds = getRoomBounds(project, room.id, false);
  const angle = Math.atan2(segment.end.zCm - segment.start.zCm, segment.end.xCm - segment.start.xCm);
  const midX = (segment.start.xCm + segment.end.xCm) / 200, midZ = (segment.start.zCm + segment.end.zCm) / 200;
  const normal = new Vector3(-Math.sin(angle), 0, Math.cos(angle));
  const center = new Vector3((bounds.xMin + bounds.xMax) / 200, 0, (bounds.zMin + bounds.zMax) / 200);
  const side = normal.dot(center.clone().sub(new Vector3(midX, 0, midZ))) >= 0 ? 1 : -1;
  const wallDepth = wall.thicknessCm / 100;
  const shared = wallRoomIds(project, wallId).length === 2;
  const depth = walking && shared ? wallDepth / 2 : wallDepth;
  const offsetZ = walking && shared ? side * wallDepth / 4 : 0;
  const length = segment.lengthCm / 100, height = project.ceilingHeightCm / 100;
  const finish = project.wallFinishes[`${wallId}:${room.id}`] ?? WALL_DEFAULT;
  const selected = useEditor(s => s.selection?.kind === 'wall' && s.selection.id === wallId);
  const openings = project.openings.filter(o => o.wallId === wallId).sort((a, b) => a.offsetCm - b.offsetCm);
  const pieces: { x: number; y: number; width: number; height: number }[] = []; let cursor = 0;
  for (const o of openings) {
    const start = o.offsetCm / 100, w = o.widthCm / 100, bottom = o.sillCm / 100, top = bottom + o.heightCm / 100;
    if (start > cursor) pieces.push({ x: (cursor + start) / 2 - length / 2, y: height / 2, width: start - cursor, height });
    if (bottom > 0) pieces.push({ x: start + w / 2 - length / 2, y: bottom / 2, width: w, height: bottom });
    if (height > top) pieces.push({ x: start + w / 2 - length / 2, y: (height + top) / 2, width: w, height: height - top });
    cursor = start + w;
  }
  if (length > cursor) pieces.push({ x: (cursor + length) / 2 - length / 2, y: height / 2, width: length - cursor, height });
  useFrame(({ camera }) => {
    if (ref.current && !quality.running && !quality.complete) ref.current.visible = walking || normal.dot(camera.position.clone().sub(new Vector3(midX, 0, midZ))) * side >= -0.02;
  });
  const navigate = (opening: Opening) => {
    const other = wallRoomIds(project, opening.wallId).find(id => id !== room.id);
    if (other) useEditor.getState().setActiveRoom(other); else useEditor.getState().setNotice('Входная дверь ведёт за пределы квартиры');
  };
  return <group ref={ref} userData={{ wallId }} position={[midX, 0, midZ]} rotation={[0, -angle, 0]} onClick={e => {
    const s = useEditor.getState(); if (s.placement || s.draft || walking || s.quality.running || s.quality.complete) return;
    e.stopPropagation(); s.select({ kind: 'wall', id: wallId });
  }}>
    {pieces.map((p, i) => <group key={i}>
      <WallBlock {...p} depth={depth} z={offsetZ} finish={finish} />
      {p.y - p.height / 2 < 0.001 && <Trim size={[p.width, 0.075, 0.015]} at={[p.x, 0.0375, side * (wallDepth / 2 + 0.008)]} color={selected ? '#d9bb89' : '#dedbd3'} />}
    </group>)}
    {(!walking || !shared || wallRoomIds(project, wallId)[0] === room.id) && openings.map(opening => <WallOpening key={opening.id} opening={opening} wallLength={length} depth={wallDepth} side={side} project={project} room={room} navigate={navigate} />)}
  </group>;
}

function Environment({ time, center }: { time: number; center: [number, number] }) {
  const day = Math.max(0, Math.sin((time - 6) / 12 * Math.PI));
  const { scene } = useThree();
  const environment = useMemo(() => {
    const w = 128, h = 64, bytes = new Uint8Array(w * h * 4);
    const sky = new Color(day > 0 ? '#bccbd2' : '#17213b'); const earth = new Color(day > 0 ? '#aead99' : '#20222d');
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const color = sky.clone().lerp(earth, Math.min(1, Math.max(0, (y / h - 0.3) / 0.6)));
      const factor = 0.25 + day * 0.65; const offset = (y * w + x) * 4;
      bytes[offset] = Math.round(color.r * 255 * factor); bytes[offset + 1] = Math.round(color.g * 255 * factor); bytes[offset + 2] = Math.round(color.b * 255 * factor); bytes[offset + 3] = 255;
    }
    const texture = new DataTexture(bytes, w, h, RGBAFormat); texture.mapping = EquirectangularReflectionMapping; texture.magFilter = texture.minFilter = LinearFilter; texture.needsUpdate = true;
    return texture;
  }, [day]);
  useEffect(() => {
    scene.environment = environment; scene.background = new Color(day > 0.05 ? '#c9d1d2' : '#1a2130');
    return () => { if (scene.environment === environment) scene.environment = null; environment.dispose(); };
  }, [scene, environment, day]);
  return <group name="outside-world">
    <mesh position={[center[0], -0.22, center[1]]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[160, 160]} /><meshStandardMaterial color={day > 0 ? '#aeb4a3' : '#4f584e'} roughness={1} /></mesh>
    {Array.from({ length: 12 }, (_, i) => {
      const a = i * Math.PI / 6; const radius = 22 + hash(i) * 13; const h = 3 + hash(i + 20) * 7;
      return <group key={i} position={[center[0] + Math.cos(a) * radius, h / 2 - 0.2, center[1] + Math.sin(a) * radius]}>
        <mesh castShadow receiveShadow><boxGeometry args={[4 + hash(i) * 4, h, 4 + hash(i + 1) * 3]} /><meshStandardMaterial color={i % 2 ? '#b9b5a9' : '#c4beb0'} roughness={0.95} /></mesh>
      </group>;
    })}
    {Array.from({ length: 15 }, (_, i) => { const a = i * 2.4, radius = 12 + hash(i + 60) * 9, h = 2.4 + hash(i) * 2; return <group key={i} position={[center[0] + Math.cos(a) * radius, -0.2, center[1] + Math.sin(a) * radius]}>
      <mesh castShadow position={[0, h * 0.25, 0]}><cylinderGeometry args={[0.07, 0.12, h * 0.5, 7]} /><meshStandardMaterial color="#70604b" /></mesh>
      <mesh castShadow position={[0, h * 0.7, 0]} scale={[0.85, 1.2, 0.85]}><icosahedronGeometry args={[h * 0.32, 1]} /><meshStandardMaterial color={i % 2 ? '#6b7955' : '#7d8967'} roughness={1} /></mesh>
    </group>; })}
    <mesh position={[center[0] - 30, 10 + day * 22, center[1] - 36]}><sphereGeometry args={[day > 0 ? 1.6 : 1.1, 24, 16]} /><meshBasicMaterial color={day > 0 ? '#fff5d5' : '#ced6df'} /></mesh>
    {day <= 0 && Array.from({ length: 45 }, (_, i) => <mesh key={i} position={[center[0] + (hash(i + 100) - 0.5) * 120, 25 + hash(i + 80) * 40, center[1] + (hash(i + 150) - 0.5) * 120]}><sphereGeometry args={[0.045 + hash(i) * 0.035, 4, 3]} /><meshBasicMaterial color="#d7d9e7" /></mesh>)}
  </group>;
}

function RoomLight({ project, room }: { project: Apartment; room: Room }) {
  const b = getRoomBounds(project, room.id); const h = project.ceilingHeightCm / 100;
  const hasChandelier = project.furniture.some(f => f.roomId === room.id && getCatalogItem(f.catalogItemId).placement === 'ceiling');
  const center: [number, number, number] = [(b.xMin + b.xMax) / 200, h - 0.1, (b.zMin + b.zMax) / 200];
  return <group>
    {!hasChandelier && <group position={center}>
      <mesh><cylinderGeometry args={[0.18, 0.2, 0.075, 32]} /><meshStandardMaterial color="#e8e3d6" roughness={0.65} /></mesh>
      <mesh position={[0, -0.04, 0]}><cylinderGeometry args={[0.175, 0.175, 0.01, 32]} /><meshStandardMaterial color="#f7efd8" emissive="#fff0cd" emissiveIntensity={room.lightOn ? 2 : 0} /></mesh>
    </group>}
  </group>;
}

function WalkControls({ project, enabled }: { project: Apartment; enabled: boolean }) {
  const { camera, gl } = useThree(); const keys = useRef(new Set<string>()); const yaw = useRef(0); const pitch = useRef(0); const dragging = useRef(false);
  useEffect(() => {
    if (!enabled) return;
    const b = getRoomBounds(project, useEditor.getState().activeRoomId); let x = (b.xMin + b.xMax) / 200, z = (b.zMin + b.zMax) / 200;
    if (!canWalk(project, x, z)) {
      outer: for (let xx = b.xMin + 25; xx < b.xMax - 25; xx += 25) for (let zz = b.zMin + 25; zz < b.zMax - 25; zz += 25) if (canWalk(project, xx / 100, zz / 100)) { x = xx / 100; z = zz / 100; break outer; }
    }
    camera.position.set(x, 1.6, z); camera.rotation.set(0, 0, 0); yaw.current = 0; pitch.current = 0;
    const onDown = (e: KeyboardEvent) => { if (/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName)) return; if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) { e.preventDefault(); keys.current.add(e.code); } if (e.code === 'Escape') useEditor.getState().setWalking(false); };
    const onUp = (e: KeyboardEvent) => { keys.current.delete(e.code); };
    const onMove = (e: MouseEvent) => { if (document.pointerLockElement !== gl.domElement && !dragging.current) return; yaw.current -= e.movementX * 0.0023; pitch.current = Math.max(-1.35, Math.min(1.35, pitch.current - e.movementY * 0.0023)); };
    const down = () => { dragging.current = true; if (gl.domElement.requestPointerLock && document.pointerLockElement !== gl.domElement) { const request = gl.domElement.requestPointerLock(); if (request && 'catch' in request) request.catch(() => {}); } };
    const up = () => { dragging.current = false; };
    const blur = () => { keys.current.clear(); dragging.current = false; };
    window.addEventListener('keydown', onDown); window.addEventListener('keyup', onUp); window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', up); window.addEventListener('blur', blur); gl.domElement.addEventListener('mousedown', down);
    return () => { keys.current.clear(); dragging.current = false; window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', up); window.removeEventListener('blur', blur); gl.domElement.removeEventListener('mousedown', down); if (document.pointerLockElement === gl.domElement) document.exitPointerLock(); };
  }, [enabled, gl, camera, project.id]);
  useFrame((_, delta) => {
    if (!enabled) return; camera.quaternion.setFromEuler(new Euler(pitch.current, yaw.current, 0, 'YXZ'));
    const k = keys.current, forward = Number(k.has('KeyW') || k.has('ArrowUp')) - Number(k.has('KeyS') || k.has('ArrowDown'));
    const right = Number(k.has('KeyD') || k.has('ArrowRight')) - Number(k.has('KeyA') || k.has('ArrowLeft'));
    if (!forward && !right) return;
    const d = Math.min(delta, 0.04) * 1.65 / (forward && right ? Math.SQRT2 : 1);
    const dx = (-Math.sin(yaw.current) * forward + Math.cos(yaw.current) * right) * d;
    const dz = (-Math.cos(yaw.current) * forward - Math.sin(yaw.current) * right) * d;
    if (canWalk(project, camera.position.x + dx, camera.position.z)) camera.position.x += dx;
    if (canWalk(project, camera.position.x, camera.position.z + dz)) camera.position.z += dz;
    camera.position.y = 1.6;
    const room = project.rooms.find(r => { const b = getRoomBounds(project, r.id); return camera.position.x * 100 >= b.xMin && camera.position.x * 100 <= b.xMax && camera.position.z * 100 >= b.zMin && camera.position.z * 100 <= b.zMax; });
    if (room && room.id !== useEditor.getState().activeRoomId) useEditor.getState().setActiveRoom(room.id);
  });
  return null;
}

function QualityRenderer({ project, time }: { project: Apartment; time: number }) {
  const { gl, scene, camera, size } = useThree(); const quality = useEditor(s => s.quality);
  const tracer = useRef<WebGLPathTracer | null>(null); const sequence = useRef(0); const started = useRef(0); const lastReport = useRef(0);
  useEffect(() => {
    if (!quality.running && !quality.complete) { sequence.current++; tracer.current?.dispose(); tracer.current = null; return; }
    if (!quality.running || tracer.current) return;
    const id = ++sequence.current; started.current = performance.now();
    const prepare = async () => {
      try {
        const { WebGLPathTracer: Tracer } = await import('three-gpu-pathtracer');
        if (id !== sequence.current) return;
        scene.updateMatrixWorld(true); const snapshot = scene.clone(true); snapshot.environment = scene.environment; snapshot.background = scene.background;
        const helpers: Group[] = []; snapshot.traverse(o => { if (o.name === 'editor-helper') helpers.push(o as Group); }); helpers.forEach(o => o.removeFromParent());
        const b = getRoomBounds(project, useEditor.getState().activeRoomId), day = Math.max(0, Math.sin((time - 6) / 12 * Math.PI));
        const area = new RectAreaLight('#fff2d8', day > 0 ? 7 * day + 1 : 0.2, (b.xMax - b.xMin) / 100, (b.zMax - b.zMin) / 100);
        area.position.set((b.xMin + b.xMax) / 200, project.ceilingHeightCm / 100 + 0.7, (b.zMin + b.zMax) / 200); area.rotation.x = -Math.PI / 2; snapshot.add(area);
        const p = new Tracer(gl); tracer.current = p;
        p.bounces = 6; p.transmissiveBounces = 8; p.filterGlossyFactor = 0.5; p.tiles.set(2, 2); p.renderScale = 0.85; p.minSamples = 1; p.fadeDuration = 200; p.renderDelay = 0; p.dynamicLowRes = false;
        p.setScene(snapshot, camera.clone());
        if (id !== sequence.current) { p.dispose(); if (tracer.current === p) tracer.current = null; return; }
      } catch (error) {
        if (id !== sequence.current) return;
        tracer.current?.dispose(); tracer.current = null;
        useEditor.getState().updateQuality({ running: false, complete: false, error: `Снимок не построен: ${error instanceof Error ? error.message : 'ошибка WebGL'}. Вернитесь к редактору и повторите попытку.` });
      }
    };
    void prepare();
  }, [quality.running, quality.complete, gl, scene, camera, project, time]);
  useEffect(() => () => { sequence.current++; tracer.current?.dispose(); tracer.current = null; }, []);
  useEffect(() => { if (tracer.current) { useEditor.getState().setQuality(false); } }, [project, time, size.width, size.height]);
  useFrame(() => {
    const p = tracer.current; const current = useEditor.getState().quality;
    if (p && (current.running || current.complete)) {
      try {
        p.pausePathTracing = current.complete; p.renderSample();
        const now = performance.now();
        if (current.running && (now - lastReport.current > 200 || p.samples >= QUALITY_SAMPLES)) {
          lastReport.current = now;
          useEditor.getState().updateQuality({ samples: Math.floor(p.samples), seconds: (now - started.current) / 1000, ...(p.samples >= QUALITY_SAMPLES ? { running: false, complete: true } : {}) });
        }
      } catch (error) {
        p.dispose(); tracer.current = null;
        useEditor.getState().updateQuality({ running: false, complete: false, error: `Видеоустройство не завершило снимок: ${error instanceof Error ? error.message : 'ошибка WebGL'}. Обычный 3D-режим восстановлен.` });
      }
    } else gl.render(scene, camera);
  }, 1);
  return null;
}

function RoomScene() {
  const s = useEditor(); const project = s.project!; const room = project.rooms.find(r => r.id === s.activeRoomId) ?? project.rooms[0];
  const bounds = getRoomBounds(project, room.id); const { camera, gl } = useThree(); const controls = useRef<OrbitControlType>(null);
  const drag = useRef<{ id: string; offsetX: number; offsetZ: number; rotating?: boolean; startAngle?: number; originAngle?: number } | null>(null);
  const point = useRef(new Vector3()); const centerX = (bounds.xMin + bounds.xMax) / 200, centerZ = (bounds.zMin + bounds.zMax) / 200;
  const max = Math.max(bounds.xMax - bounds.xMin, bounds.zMax - bounds.zMin) / 100;
  const day = Math.max(0, Math.sin((s.timeOfDay - 6) / 12 * Math.PI));
  useEffect(() => {
    if (s.walking) return;
    camera.position.set(centerX + max * 0.72, max * 0.92, centerZ + max * 0.85); camera.lookAt(centerX, 0.7, centerZ);
    if (controls.current) { controls.current.target.set(centerX, 0.65, centerZ); controls.current.update(); }
  }, [camera, room.id, centerX, centerZ, max, s.walking]);
  useEffect(() => { if (!s.draft) drag.current = null; }, [s.draft]);
  useEffect(() => {
    gl.domElement.style.cursor = s.walking || s.placement ? 'crosshair' : s.draft ? 'grabbing' : 'grab';
    return () => { gl.domElement.style.cursor = ''; };
  }, [gl, s.walking, s.placement, s.draft]);
  useEffect(() => {
    const onUp = (event: PointerEvent) => {
      const bounds = gl.domElement.getBoundingClientRect();
      const outside = event.clientX < bounds.left || event.clientX >= bounds.right || event.clientY < bounds.top || event.clientY >= bounds.bottom;
      const state = useEditor.getState();
      if (drag.current) { drag.current = null; outside ? state.cancelDraft() : state.commitDraft(); }
      else if (outside && state.placement && state.draft) state.cancelDraft();
    };
    const onCancel = () => {
      const state = useEditor.getState();
      if (!drag.current && !state.draft) return;
      drag.current = null; state.cancelDraft();
    };
    window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onCancel); window.addEventListener('blur', onCancel);
    gl.domElement.addEventListener('lostpointercapture', onCancel);
    return () => { window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onCancel); window.removeEventListener('blur', onCancel); gl.domElement.removeEventListener('lostpointercapture', onCancel); };
  }, [gl]);
  const coordinates = (e: ThreeEvent<PointerEvent>, existing?: FurnitureInstance) => {
    const state = useEditor.getState();
    const candidate = existing ?? state.draft;
    const itemId = state.placement ?? candidate?.catalogItemId;
    const item = itemId ? getCatalogItem(itemId) : null;
    let planeHeight = item?.placement === 'wall' ? (candidate?.yCm ?? item.mountHeightCm ?? 145) / 100 : 0;
    if (item?.placement === 'tabletop') {
      let hit = e.object;
      while (hit.parent && !hit.userData.furnitureInstanceId) hit = hit.parent;
      const support = project.furniture.find(f => f.id === hit.userData.furnitureInstanceId && f.id !== candidate?.id);
      planeHeight = support ? (support.yCm + getCatalogItem(support.catalogItemId).heightCm) / 100 : (candidate?.yCm ?? 0) / 100;
    }
    e.ray.intersectPlane(planeHeight ? new Plane(WORLD_UP, -planeHeight) : FLOOR_PLANE, point.current);
    return { x: point.current.x * 100, z: point.current.z * 100 };
  };
  const move = (e: ThreeEvent<PointerEvent>) => {
    const state = useEditor.getState(); if (state.walking || state.quality.running || state.quality.complete || (!drag.current && !state.placement)) return;
    e.stopPropagation(); const p = coordinates(e);
    if (drag.current?.rotating && state.draft) {
      const a = Math.atan2(p.z - state.draft.zCm, p.x - state.draft.xCm) * 180 / Math.PI;
      const raw = (drag.current.originAngle ?? 0) + a - (drag.current.startAngle ?? 0);
      state.setDraft({ ...state.draft, angleDeg: e.altKey ? raw : Math.round(raw / 15) * 15 });
    } else state.previewAt(p.x - (drag.current?.offsetX ?? 0), p.z - (drag.current?.offsetZ ?? 0), e.altKey);
  };
  const down = (e: ThreeEvent<PointerEvent>) => {
    const state = useEditor.getState(); if (e.button !== 0 || state.walking || state.quality.running || state.quality.complete) return;
    if (state.placement) { e.stopPropagation(); const p = coordinates(e); state.previewAt(p.x, p.z, e.altKey); }
    else if (!drag.current) state.select(null);
  };
  const up = (e: ThreeEvent<PointerEvent>) => {
    if (s.walking) return;
    const state = useEditor.getState(); if (state.placement || drag.current) {
      e.stopPropagation(); const b = gl.domElement.getBoundingClientRect();
      const outside = e.clientX < b.left || e.clientX >= b.right || e.clientY < b.top || e.clientY >= b.bottom;
      drag.current = null; outside ? state.cancelDraft() : state.commitDraft();
    }
  };
  const objectDown = (e: ThreeEvent<PointerEvent>, f: FurnitureInstance, rotating = false) => {
    const state = useEditor.getState(); if (e.button !== 0 || state.walking || state.quality.running || state.quality.complete) return;
    e.stopPropagation(); const p = coordinates(e, f);
    if (state.placement) { state.previewAt(p.x, p.z, e.altKey); return; }
    state.select({ kind: 'furniture', id: f.id }); state.beginDrag(f.id);
    drag.current = { id: f.id, offsetX: p.x - f.xCm, offsetZ: p.z - f.zCm, rotating, startAngle: Math.atan2(p.z - f.zCm, p.x - f.xCm) * 180 / Math.PI, originAngle: f.angleDeg };
    (e.target as unknown as { setPointerCapture?: (id: number) => void }).setPointerCapture?.(e.pointerId);
  };
  const rooms = s.walking ? project.rooms : [room];
  const visibleFurniture = project.furniture.filter(f => (s.walking || f.roomId === room.id) && f.id !== s.draft?.id);
  const furniture = (f: FurnitureInstance, ghost = false) => {
    const item = getCatalogItem(f.catalogItemId); const selected = !ghost && s.selection?.kind === 'furniture' && s.selection.id === f.id;
    const radius = Math.max(item.widthCm, item.depthCm) / 200 + 0.16;
    return <group key={ghost ? `draft-${f.id}` : f.id} userData={{ furnitureInstanceId: f.id }} position={[f.xCm / 100, f.yCm / 100, f.zCm / 100]} rotation={[0, -f.angleDeg * Math.PI / 180, 0]}
      onPointerDown={ghost ? undefined : e => objectDown(e, f)} onPointerMove={move} onPointerUp={up}>
      <FurnitureModel item={item} color={f.color} ghost={ghost} invalid={ghost && !s.draftValidation.valid} lit={project.rooms.find(r => r.id === f.roomId)?.lightOn} />
      {selected && !s.walking && <group name="editor-helper">
        <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}><ringGeometry args={[radius - 0.007, radius + 0.007, 64]} /><meshBasicMaterial color="#d9bb89" side={DoubleSide} depthTest={false} transparent opacity={0.85} /></mesh>
        {item.placement !== 'wall' && <mesh position={[radius, 0.035, 0]} onPointerDown={e => objectDown(e, f, true)} onPointerMove={move} onPointerUp={up}>
          <sphereGeometry args={[0.065, 14, 10]} /><meshBasicMaterial color="#d9bb89" depthTest={false} />
        </mesh>}
      </group>}
    </group>;
  };
  return <>
    <group onPointerMove={move} onPointerDown={down} onPointerUp={up}>
    <Environment time={s.timeOfDay} center={[centerX, centerZ]} />
    <ambientLight intensity={0.22 + day * 0.35} color={day > 0 ? '#fff9ed' : '#9eaec8'} />
    <hemisphereLight intensity={0.35 + day * 0.65} color="#dce9f2" groundColor="#a28c67" />
    <directionalLight position={[centerX - 6, 9, centerZ - 4]} intensity={day * 3.4 + 0.06} color={s.timeOfDay < 10 || s.timeOfDay > 16 ? '#ffe0b1' : '#fff6e4'} castShadow
      shadow-mapSize={[2048, 2048]} shadow-camera-left={-12} shadow-camera-right={12} shadow-camera-top={12} shadow-camera-bottom={-12} shadow-camera-near={0.2} shadow-camera-far={35} shadow-bias={-0.0003} shadow-normalBias={0.025} />
    {rooms.map(r => { const b = getRoomBounds(project, r.id); return <group key={r.id}>
      <RoomFloor project={project} room={r} onMove={move} onDown={down} onUp={up} />
      {r.boundary.map(edge => <RoomWall key={edge.wallId} project={project} room={r} wallId={edge.wallId} walking={s.walking} />)}
      <RoomLight project={project} room={r} />
      {s.walking && <mesh position={[(b.xMin + b.xMax) / 200, project.ceilingHeightCm / 100, (b.zMin + b.zMax) / 200]} rotation={[Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[(b.xMax - b.xMin) / 100, (b.zMax - b.zMin) / 100]} /><meshStandardMaterial color="#e4e1d8" roughness={1} /></mesh>}
    </group>; })}
    {visibleFurniture.map(f => furniture(f))}
    {s.draft && !s.walking && furniture(s.draft, true)}
    {roomLightSources(project, rooms).map(source => <pointLight key={source.id} position={source.position} intensity={source.intensity} color="#ffe9c5" distance={10} decay={2} />)}
    </group>
    {!s.walking && <OrbitControls ref={controls} makeDefault target={[centerX, 0.65, centerZ]} enabled={!s.placement && !s.draft && !s.quality.running && !s.quality.complete}
      enableDamping dampingFactor={0.12} minDistance={1.2} maxDistance={max * 4} minPolarAngle={0.12} maxPolarAngle={Math.PI / 2 - 0.015}
      onStart={() => { const state = useEditor.getState(); if (state.quality.complete) state.setQuality(false); }} />}
    <WalkControls project={project} enabled={s.walking} />
    <QualityRenderer project={project} time={s.timeOfDay} />
  </>;
}

class SceneBoundary extends Component<{ children: ReactNode; onRetry: () => void }, { error: string | null }> {
  state: { error: string | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  componentDidCatch(_error: Error, _info: ErrorInfo) {
    useEditor.getState().setWebglAvailable(false);
    useEditor.getState().setQuality(false);
  }
  render() {
    if (!this.state.error) return this.props.children;
    const isWebgl = /webgl|context|gpu|renderer/i.test(this.state.error);
    return <div className="scene-error" role="alert"><h3>{isWebgl ? 'Включите 3D в браузере' : 'Не удалось открыть 3D-сцену'}</h3>
      <p>{isWebgl ? 'В этом браузере недоступен WebGL. Включите аппаратное ускорение в настройках Chrome или Edge и перезапустите браузер.' : 'Не удалось загрузить сцену или материал. Проверьте подключение и повторите запуск.'}</p>
      <p>Можно продолжить работу на 2D-плане. Размеры, мебель и отделка сохраняются в текущей вкладке.</p>
      <div className="scene-error-actions"><button type="button" className="button primary" onClick={() => useEditor.getState().setView('2d')}>Открыть 2D-план</button><button type="button" className="button secondary" onClick={this.props.onRetry}>Повторить запуск</button></div></div>;
  }
}

export default function Scene3D() {
  const project = useEditor(s => s.project); const [revision, setRevision] = useState(0); const [contextLost, setContextLost] = useState(false);
  if (!project) return null;
  return <SceneBoundary key={revision} onRetry={() => { setContextLost(false); setRevision(v => v + 1); }}>
    {contextLost ? <div className="scene-error" role="alert"><h3>3D-сцена приостановлена</h3><p>Соединение с видеоустройством потеряно. Ваши изменения остаются в текущей вкладке.</p><div className="scene-error-actions"><button type="button" className="button primary" onClick={() => useEditor.getState().setView('2d')}>Открыть 2D-план</button><button type="button" className="button secondary" onClick={() => { setContextLost(false); setRevision(v => v + 1); }}>Восстановить 3D</button></div></div>
      : <Canvas shadows dpr={[1, 1.5]} camera={{ fov: 42, near: 0.05, far: 160 }} gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        events={store => ({ ...createPointerEvents(store), filter: visibleIntersections })}
        onCreated={({ gl }) => { useEditor.getState().setWebglAvailable(true); gl.toneMapping = ACESFilmicToneMapping; gl.toneMappingExposure = 1.05; gl.outputColorSpace = SRGBColorSpace; gl.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); useEditor.getState().setQuality(false); useEditor.getState().setWebglAvailable(false); setContextLost(true); }, { once: true }); }}
        fallback={<div className="scene-error" role="alert"><h3>Браузер не поддерживает WebGL</h3><p>Откройте 3D Room в Chrome или Edge с аппаратным ускорением. 2D-план остаётся доступен.</p></div>}>
        <Suspense fallback={null}><RoomScene /></Suspense>
      </Canvas>}
  </SceneBoundary>;
}

export { canWalk, QUALITY_SAMPLES };
