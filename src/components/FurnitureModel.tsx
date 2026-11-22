import { createContext, useContext } from 'react';
import { RoundedBox } from '@react-three/drei';
import { Color } from 'three';
import type { CatalogItem } from '../domain/types';

/** Original, dimensioned geometry. All measurements are metres at this boundary. */
const Appearance = createContext({ ghost: false, invalid: false, lit: true });
const oak = '#a88761';
const paleOak = '#c8b292';
const charcoal = '#343536';
const brass = '#b59a62';
const porcelain = '#f0eee7';

function Material({ color, roughness = 0.72, metalness = 0, glass = false, emission = false }: { color: string; roughness?: number; metalness?: number; glass?: boolean; emission?: boolean }) {
  const { ghost, invalid, lit } = useContext(Appearance);
  const shade = ghost ? (invalid ? '#e87373' : '#d9bc8b') : color;
  return <meshStandardMaterial color={shade} roughness={glass ? 0.12 : roughness} metalness={metalness}
    transparent={ghost || glass} opacity={ghost ? 0.56 : glass ? 0.24 : 1} depthWrite={!ghost && !glass}
    emissive={emission && lit ? '#fff0cb' : '#000000'} emissiveIntensity={emission && lit ? 1.2 : 0} />;
}

type Triple = [number, number, number];
function Block({ size, at = [0, 0, 0], color, radius = 0, rotation = [0, 0, 0], metalness = 0, roughness = 0.72, glass = false, emission = false }: {
  size: Triple; at?: Triple; color: string; radius?: number; rotation?: Triple; metalness?: number; roughness?: number; glass?: boolean; emission?: boolean;
}) {
  const radiusSafe = Math.min(radius, ...size.map(v => v / 2 - 0.001));
  const material = <Material color={color} metalness={metalness} roughness={roughness} glass={glass} emission={emission} />;
  return radiusSafe > 0.002 ? <RoundedBox args={size} radius={radiusSafe} smoothness={3} position={at} rotation={rotation} castShadow receiveShadow>{material}</RoundedBox>
    : <mesh position={at} rotation={rotation} castShadow receiveShadow><boxGeometry args={size} />{material}</mesh>;
}

function Cylinder({ radius, height, at = [0, 0, 0], color, top, rotation = [0, 0, 0], metalness = 0, emission = false, open = false }: {
  radius: number; height: number; at?: Triple; color: string; top?: number; rotation?: Triple; metalness?: number; emission?: boolean; open?: boolean;
}) {
  return <mesh position={at} rotation={rotation} castShadow receiveShadow><cylinderGeometry args={[top ?? radius, radius, height, 24, 1, open]} />
    <Material color={color} metalness={metalness} emission={emission} /></mesh>;
}

function Ellipsoid({ size, at, color, emission = false }: { size: Triple; at: Triple; color: string; emission?: boolean }) {
  return <mesh position={at} scale={size.map(v => v / 2) as Triple} castShadow receiveShadow><sphereGeometry args={[1, 24, 16]} /><Material color={color} emission={emission} roughness={0.6} /></mesh>;
}

function Legs({ w, d, height, radius = 0.025, color = oak, inset = 0.07 }: { w: number; d: number; height: number; radius?: number; color?: string; inset?: number }) {
  return <>{[-1, 1].flatMap(x => [-1, 1].map(z => <Cylinder key={`${x}-${z}`} radius={radius} top={radius * 0.76} height={height}
    at={[x * (w / 2 - inset), height / 2, z * (d / 2 - inset)]} color={color} />))}</>;
}

function Cabinet({ w, d, h, color, drawers = 0, doors = 2, legs = true }: { w: number; d: number; h: number; color: string; drawers?: number; doors?: number; legs?: boolean }) {
  const base = legs ? Math.min(0.13, h * 0.17) : 0.04;
  const handleColor = color === charcoal ? brass : charcoal;
  return <>
    {legs && <Legs w={w} d={d} height={base} color={charcoal} inset={Math.min(0.075, w / 8)} />}
    <Block size={[w, h - base, d]} at={[0, base + (h - base) / 2, 0]} color={color} radius={0.012} />
    <Block size={[w, 0.025, d]} at={[0, h - 0.0125, 0]} color={paleOak} radius={0.006} />
    {drawers > 0 ? Array.from({ length: drawers }, (_, i) => {
      const dh = (h - base - 0.035) / drawers;
      return <group key={i}>
        <Block size={[w - 0.025, dh - 0.012, 0.012]} at={[0, base + dh * (i + 0.5), d / 2 - 0.002]} color={color} radius={0.004} />
        <Block size={[Math.min(w * 0.28, 0.2), 0.014, 0.018]} at={[0, base + dh * (i + 0.8), d / 2 - 0.009]} color={handleColor} radius={0.004} metalness={0.5} />
      </group>;
    }) : Array.from({ length: doors }, (_, i) => {
      const dw = w / doors;
      return <group key={i}>
        <Block size={[dw - 0.013, h - base - 0.04, 0.012]} at={[-w / 2 + dw * (i + 0.5), (h + base) / 2, d / 2 - 0.003]} color={color} radius={0.003} />
        <Block size={[0.012, Math.min(0.24, h / 4), 0.016]} at={[-w / 2 + dw * (i + 0.5) + dw * 0.3, (h + base) / 2, d / 2 - 0.008]} color={handleColor} radius={0.003} metalness={0.5} />
      </group>;
    })}
  </>;
}

function Sofa({ w, d, h, color, single = false }: { w: number; d: number; h: number; color: string; single?: boolean }) {
  const light = `#${new Color(color).offsetHSL(0, -0.04, 0.075).getHexString()}`;
  const cushions = single ? 1 : 3;
  const inside = w - 0.18;
  return <>
    <Legs w={w} d={d} height={h * 0.16} radius={0.025} color={charcoal} inset={0.09} />
    <Block size={[w - 0.04, h * 0.24, d - 0.04]} at={[0, h * 0.28, 0]} color={color} radius={0.07} />
    <Block size={[w - 0.04, h * 0.67, d * 0.19]} at={[0, h * 0.66, -d * 0.385]} color={color} radius={0.065} />
    {[-1, 1].map(s => <Block key={s} size={[0.13, h * 0.48, d * 0.92]} at={[s * (w / 2 - 0.065), h * 0.48, 0]} color={color} radius={0.055} />)}
    {Array.from({ length: cushions }, (_, i) => <group key={i}>
      <Block size={[inside / cushions - 0.018, h * 0.18, d * 0.72]} at={[-inside / 2 + inside / cushions * (i + 0.5), h * 0.44, d * 0.065]} color={light} radius={0.055} />
      <Block size={[inside / cushions - 0.025, h * 0.39, d * 0.16]} at={[-inside / 2 + inside / cushions * (i + 0.5), h * 0.76, -d * 0.24]} color={light} radius={0.06} rotation={[-0.09, 0, 0]} />
    </group>)}
    {!single && <Block size={[h * 0.32, h * 0.32, 0.11]} at={[-w * 0.31, h * 0.66, -d * 0.08]} rotation={[0.04, 0.08, -0.18]} color={'#bca185'} radius={0.055} />}
  </>;
}

function Bed({ w, d, h, color, single }: { w: number; d: number; h: number; color: string; single: boolean }) {
  return <>
    <Legs w={w} d={d} height={0.12} radius={0.035} color={charcoal} inset={0.09} />
    <Block size={[w, h * 0.28, d - 0.04]} at={[0, h * 0.24, 0.02]} color={color} radius={0.045} />
    <Block size={[w, h * 0.87, 0.1]} at={[0, h * 0.565, -d / 2 + 0.05]} color={color} radius={0.045} />
    <Block size={[w - 0.08, h * 0.18, d - 0.16]} at={[0, h * 0.45, 0.025]} color={'#e9e5db'} radius={0.07} />
    <Block size={[w - 0.05, h * 0.075, d * 0.64]} at={[0, h * 0.565, d * 0.16]} color={'#c2b5a6'} radius={0.04} />
    <Block size={[w - 0.06, 0.018, d * 0.18]} at={[0, h * 0.615, d * 0.16]} color={'#b1a392'} radius={0.008} />
    {(single ? [0] : [-1, 1]).map(s => <Block key={s} size={[w * (single ? 0.72 : 0.39), h * 0.09, d * 0.2]}
      at={[s * w * 0.23, h * 0.59, -d * 0.32]} color={'#f4f0e7'} radius={0.055} rotation={[0.04, 0, s * 0.025]} />)}
  </>;
}

function Lamp({ kind, w, d, h, color }: { kind: string; w: number; d: number; h: number; color: string }) {
  if (kind === 'sconce') return <>
    <Cylinder radius={Math.min(w, h) * 0.25} height={0.025} at={[0, h / 2, -d / 2 + 0.02]} rotation={[Math.PI / 2, 0, 0]} color={brass} metalness={0.7} />
    <Block size={[0.025, 0.025, d * 0.65]} at={[0, h * 0.42, -d * 0.1]} color={brass} metalness={0.7} />
    <Ellipsoid size={[w * 0.92, h * 0.6, d * 0.65]} at={[0, h * 0.68, d * 0.12]} color={porcelain} emission />
  </>;
  if (kind === 'pendant' || kind === 'chandelier' || kind === 'globe-chandelier') {
    const ceiling = h - 0.025;
    if (kind === 'pendant') return <>
      <Cylinder radius={w * 0.13} height={0.03} at={[0, ceiling, 0]} color={charcoal} />
      <Cylinder radius={0.007} height={h * 0.63} at={[0, h * 0.64, 0]} color={charcoal} />
      <Cylinder radius={w / 2} top={w * 0.2} height={h * 0.33} at={[0, h * 0.18, 0]} color={color} open />
      <Cylinder radius={w * 0.46} height={0.012} at={[0, 0.025, 0]} color={porcelain} emission />
    </>;
    return <>
      <Cylinder radius={w * 0.12} height={0.03} at={[0, ceiling, 0]} color={brass} metalness={0.7} />
      <Cylinder radius={0.012} height={h * 0.72} at={[0, h * 0.61, 0]} color={brass} metalness={0.7} />
      {Array.from({ length: 6 }, (_, i) => {
        const a = i * Math.PI / 3; const radius = w * 0.31;
        return <group key={i} rotation={[0, a, 0]}>
          <Block size={[radius, 0.018, 0.018]} at={[radius / 2, h * 0.27, 0]} color={brass} metalness={0.65} />
          {kind === 'globe-chandelier' ? <Ellipsoid size={[w * 0.26, w * 0.26, w * 0.26]} at={[radius, h * 0.27, 0]} color={porcelain} emission />
            : <Cylinder radius={w * 0.13} top={w * 0.075} height={h * 0.3} at={[radius, h * 0.18, 0]} color={color} />}
        </group>;
      })}
    </>;
  }
  const baseHeight = kind === 'floor-lamp' ? 0.04 : 0.03;
  const shadeHeight = kind === 'floor-lamp' ? 0.3 : 0.16;
  const stemHeight = h - baseHeight - shadeHeight;
  return <>
    <Cylinder radius={kind === 'floor-lamp' ? 0.15 : 0.09} height={baseHeight} at={[0, baseHeight / 2, 0]} color={charcoal} metalness={0.4} />
    <Cylinder radius={0.015} height={stemHeight} at={[0, baseHeight + stemHeight / 2, 0]} color={brass} metalness={0.7} />
    <Cylinder radius={Math.min(w, d) / 2} top={Math.min(w, d) * 0.3} height={shadeHeight} at={[0, h - shadeHeight / 2, 0]} color={color} open />
    <Ellipsoid size={[0.07, 0.09, 0.07]} at={[0, h - shadeHeight / 2, 0]} color={porcelain} emission />
  </>;
}

function Model({ item, color }: { item: CatalogItem; color: string }) {
  const w = item.widthCm / 100; const d = item.depthCm / 100; const h = item.heightCm / 100;
  switch (item.kind) {
    case 'sofa': return <Sofa w={w} d={d} h={h} color={color} />;
    case 'armchair': return <Sofa w={w} d={d} h={h} color={color} single />;
    case 'bed': case 'single-bed': return <Bed w={w} d={d} h={h} color={color} single={item.kind === 'single-bed'} />;
    case 'coffee-table': case 'dining-table': case 'desk': return <>{item.colliders?.map((c, i) => i === 0
      ? <Block key={i} size={[c.widthCm / 100, c.heightCm / 100, c.depthCm / 100]} at={[c.xCm / 100, c.yCm / 100, c.zCm / 100]} color={color} radius={0.025} />
      : <Cylinder key={i} radius={c.widthCm / 200} top={c.widthCm / 230} height={c.heightCm / 100} at={[c.xCm / 100, c.yCm / 100, c.zCm / 100]} color={item.kind === 'coffee-table' ? charcoal : oak} />)}</>;
    case 'chair': return <>{item.colliders?.map((c, i) => (i > 0 && i < 5)
      ? <Cylinder key={i} radius={c.widthCm / 200} top={c.widthCm / 230} height={c.heightCm / 100} at={[c.xCm / 100, c.yCm / 100, c.zCm / 100]} color={oak} />
      : <Block key={i} size={[c.widthCm / 100, c.heightCm / 100, c.depthCm / 100]} at={[c.xCm / 100, c.yCm / 100, c.zCm / 100]} color={color} radius={0.025} />)}</>;
    case 'tv-console': return <Cabinet w={w} d={d} h={h} color={color} doors={3} />;
    case 'nightstand': return <Cabinet w={w} d={d} h={h} color={color} drawers={2} />;
    case 'dresser': return <Cabinet w={w} d={d} h={h} color={color} drawers={4} />;
    case 'wardrobe': return <Cabinet w={w} d={d} h={h} color={color} doors={3} legs={false} />;
    case 'shoe-cabinet': return <Cabinet w={w} d={d} h={h} color={color} drawers={3} legs={false} />;
    case 'kitchen-base': return <Cabinet w={w} d={d} h={h} color={color} doors={2} legs={false} />;
    case 'kitchen-wall': return <Cabinet w={w} d={d} h={h} color={color} doors={2} legs={false} />;
    case 'bookcase': return <>
      <Block size={[w, h, 0.025]} at={[0, h / 2, -d / 2 + 0.0125]} color={color} />
      {[-1, 1].map(s => <Block key={s} size={[0.025, h, d]} at={[s * (w / 2 - 0.0125), h / 2, 0]} color={color} />)}
      {Array.from({ length: 6 }, (_, i) => <group key={i}>
        <Block size={[w, 0.025, d]} at={[0, 0.015 + i * (h - 0.03) / 5, 0]} color={color} />
        {i < 5 && Array.from({ length: 3 + (i % 2) }, (_, j) => <Block key={j} size={[w * 0.075, h * (0.12 + j * 0.008), d * 0.65]} at={[-w * 0.31 + j * w * 0.09, 0.03 + i * (h - 0.03) / 5 + h * (0.06 + j * 0.004), 0]} color={['#b29a7c', '#56605b', '#ddd4c3', '#8c7460'][j]} />)}
      </group>)}
    </>;
    case 'rug': return <>
      <Block size={[w, Math.min(h, 0.012), d]} at={[0, Math.min(h, 0.012) / 2, 0]} color={color} radius={0.004} />
      {[-1, 1].map(s => <Block key={s} size={[w * 0.9, 0.002, d * 0.012]} at={[0, Math.min(h, 0.012) + 0.001, s * d * 0.43]} color={'#9f9584'} />)}
    </>;
    case 'shelf': return <>{item.colliders?.map((c, i) => <Block key={i} size={[c.widthCm / 100, c.heightCm / 100, c.depthCm / 100]} at={[c.xCm / 100, c.yCm / 100, c.zCm / 100]} color={color} radius={0.007} />)}</>;
    case 'fridge': return <>
      <Block size={[w, h, d]} at={[0, h / 2, 0]} color={color} radius={0.025} metalness={0.26} roughness={0.34} />
      <Block size={[w - 0.02, h * 0.66, 0.018]} at={[0, h * 0.655, d / 2 - 0.004]} color={color} radius={0.014} metalness={0.3} />
      <Block size={[w - 0.02, h * 0.31, 0.018]} at={[0, h * 0.16, d / 2 - 0.004]} color={color} radius={0.014} metalness={0.3} />
      {[0.5, 0.23].map(y => <Block key={y} size={[0.018, h * 0.14, 0.022]} at={[-w * 0.32, h * y, d / 2 - 0.011]} color={charcoal} radius={0.007} />)}
    </>;
    case 'stove': return <>
      <Block size={[w, h, d]} at={[0, h / 2, 0]} color={color} radius={0.012} />
      <Block size={[w - 0.02, 0.02, d - 0.02]} at={[0, h - 0.01, 0]} color={charcoal} />
      {[-1, 1].flatMap(x => [-1, 1].map(z => <Cylinder key={`${x}${z}`} radius={w * 0.15} height={0.005} at={[x * w * 0.24, h - 0.0025, z * d * 0.24]} color={'#717172'} />))}
      <Block size={[w * 0.8, h * 0.55, 0.015]} at={[0, h * 0.42, d / 2 - 0.003]} color={'#262626'} radius={0.02} roughness={0.15} />
      <Block size={[w * 0.7, 0.022, 0.025]} at={[0, h * 0.75, d / 2 - 0.0125]} color={charcoal} radius={0.006} />
      {[-1, 0, 1].map(x => <Cylinder key={x} radius={0.022} height={0.02} at={[x * w * 0.23, h * 0.9, d / 2 - 0.01]} rotation={[Math.PI / 2, 0, 0]} color={charcoal} />)}
    </>;
    case 'kitchen-sink': return <>
      <Cabinet w={w} d={d} h={h - 0.18} color={color} legs={false} />
      <Block size={[w * 0.68, 0.012, d * 0.65]} at={[0, h - 0.175, 0]} color={'#868d8a'} radius={0.05} metalness={0.75} />
      <Block size={[w * 0.55, 0.014, d * 0.53]} at={[0, h - 0.168, 0]} color={'#525c59'} radius={0.05} metalness={0.55} />
      <Cylinder radius={0.014} height={0.16} at={[0, h - 0.1, -d * 0.32]} color={charcoal} />
      <Block size={[0.026, 0.026, d * 0.25]} at={[0, h - 0.02, -d * 0.23]} color={charcoal} radius={0.01} />
    </>;
    case 'bathtub': return <>
      <Block size={[w, h * 0.9, d]} at={[0, h * 0.45, 0]} color={color} radius={0.16} roughness={0.28} />
      <Block size={[w * 0.82, 0.035, d * 0.72]} at={[0, h * 0.91, 0]} color={'#b6c2bf'} radius={0.14} roughness={0.2} />
      <Block size={[w * 0.76, 0.012, d * 0.64]} at={[0, h * 0.94, 0]} color={'#d2dcda'} radius={0.14} roughness={0.12} />
      <Cylinder radius={0.015} height={0.11} at={[w * 0.36, h * 0.9, -d * 0.25]} color={charcoal} />
    </>;
    case 'shower': return <>
      <Block size={[w, 0.09, d]} at={[0, 0.045, 0]} color={porcelain} radius={0.035} roughness={0.3} />
      <Block size={[w, h - 0.1, 0.012]} at={[0, h / 2 + 0.03, -d / 2 + 0.006]} color={'#b8d4d0'} glass />
      <Block size={[0.012, h - 0.1, d]} at={[-w / 2 + 0.006, h / 2 + 0.03, 0]} color={'#b8d4d0'} glass />
      <Block size={[w, h - 0.1, 0.012]} at={[0, h / 2 + 0.03, d / 2 - 0.006]} color={'#b8d4d0'} glass />
      {[-1, 1].flatMap(x => [-1, 1].map(z => <Block key={`${x}${z}`} size={[0.018, h, 0.018]} at={[x * (w / 2 - 0.01), h / 2, z * (d / 2 - 0.01)]} color={charcoal} />))}
      <Cylinder radius={0.012} height={h * 0.6} at={[w * 0.2, h * 0.64, -d * 0.46]} color={charcoal} />
      <Cylinder radius={w * 0.13} height={0.018} at={[w * 0.2, h * 0.94, -d * 0.25]} color={charcoal} />
    </>;
    case 'vanity': return <>
      <Cabinet w={w} d={d} h={h - 0.19} color={color} drawers={2} />
      <Block size={[w, 0.06, d]} at={[0, h - 0.16, 0]} color={porcelain} radius={0.028} roughness={0.2} />
      <Block size={[w * 0.7, 0.012, d * 0.65]} at={[0, h - 0.126, 0]} color={'#adbab5'} radius={0.065} />
      <Cylinder radius={0.015} height={0.12} at={[0, h - 0.065, -d * 0.36]} color={charcoal} />
    </>;
    case 'toilet': return <>
      <Ellipsoid size={[w * 0.65, h * 0.55, d * 0.55]} at={[0, h * 0.29, d * 0.11]} color={porcelain} />
      <Block size={[w * 0.84, h * 0.67, d * 0.28]} at={[0, h * 0.64, -d * 0.34]} color={porcelain} radius={0.045} roughness={0.2} />
      <Ellipsoid size={[w, h * 0.2, d * 0.76]} at={[0, h * 0.54, d * 0.07]} color={porcelain} />
      <Ellipsoid size={[w * 0.77, 0.018, d * 0.55]} at={[0, h * 0.65, d * 0.09]} color={'#c4cdca'} />
      <Cylinder radius={0.025} height={0.006} at={[0, h * 0.985, -d * 0.34]} color={'#a4aba7'} metalness={0.7} />
    </>;
    case 'washer': return <>
      <Block size={[w, h, d]} at={[0, h / 2, 0]} color={porcelain} radius={0.016} />
      <Cylinder radius={w * 0.33} height={0.025} at={[0, h * 0.44, d / 2 - 0.014]} rotation={[Math.PI / 2, 0, 0]} color={'#939995'} metalness={0.65} />
      <Cylinder radius={w * 0.25} height={0.028} at={[0, h * 0.44, d / 2 - 0.014]} rotation={[Math.PI / 2, 0, 0]} color={'#394546'} />
      <Block size={[w * 0.34, 0.06, 0.008]} at={[w * 0.18, h * 0.88, d / 2 - 0.004]} color={charcoal} />
      <Cylinder radius={0.035} height={0.018} at={[-w * 0.24, h * 0.88, d / 2 - 0.009]} rotation={[Math.PI / 2, 0, 0]} color={'#969c98'} />
    </>;
    case 'mirror': return <>
      <Block size={[w, h, d]} at={[0, h / 2, 0]} color={brass} radius={Math.min(w, h) * 0.2} metalness={0.75} />
      <Block size={[w - 0.035, h - 0.035, 0.008]} at={[0, h / 2, d / 2 - 0.004]} color={'#bfcdce'} radius={Math.min(w, h) * 0.18} metalness={0.98} roughness={0.06} />
    </>;
    case 'bench': return <>
      <Legs w={w} d={d} height={h * 0.8} radius={0.028} color={charcoal} />
      <Block size={[w, h * 0.2, d]} at={[0, h * 0.9, 0]} color={color} radius={0.04} />
      <Block size={[w * 0.85, 0.025, d * 0.78]} at={[0, h * 0.25, 0]} color={oak} radius={0.007} />
    </>;
    case 'coat-rack': return <>
      <Cylinder radius={Math.min(w, d) * 0.45} height={0.04} at={[0, 0.02, 0]} color={charcoal} />
      <Cylinder radius={0.025} height={h - 0.04} at={[0, h / 2 + 0.02, 0]} color={color} />
      {[0, 1, 2, 3].map(i => <group key={i} rotation={[0, i * Math.PI / 2, 0]}><Block size={[w * 0.45, 0.03, 0.03]} at={[w * 0.22, h * (0.72 + i % 2 * 0.15), 0]} color={color} radius={0.013} /><Cylinder radius={0.025} height={0.06} at={[w * 0.41, h * (0.72 + i % 2 * 0.15) + 0.025, 0]} color={color} /></group>)}
    </>;
    case 'floor-lamp': case 'table-lamp': case 'sconce': case 'pendant': case 'chandelier': case 'globe-chandelier': return <Lamp kind={item.kind} w={w} d={d} h={h} color={color} />;
  }
}

export default function FurnitureModel({ item, color = item.color, ghost = false, invalid = false, lit = true }: {
  item: CatalogItem; color?: string; ghost?: boolean; invalid?: boolean; lit?: boolean;
}) {
  return <Appearance.Provider value={{ ghost, invalid, lit }}><Model item={item} color={color} /></Appearance.Provider>;
}
