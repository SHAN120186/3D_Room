import type { CatalogItem } from '../domain/types';

/** Small dimensionally recognisable catalogue drawings, not external model assets. */
export default function FurnitureThumb({ item }: { item: CatalogItem }) {
  const k = item.kind;
  const wood = 'var(--object-wood)';
  const dark = 'var(--object-dark)';
  const pale = 'var(--object-pale)';
  const fabric = item.color;
  const box = (x: number, y: number, w: number, h: number, d: number, color: string, key: string) => <g key={key}>
    <path d={`M${x} ${y}l${w} -${w * .24}v${h}l-${w} ${w * .24}Z`} fill={color}/>
    <path d={`M${x+w} ${y-w*.24}l${d} ${d*.55}v${h}l-${d} -${d*.55}Z`} fill={color} style={{filter:'brightness(.68)'}}/>
    <path d={`M${x} ${y}l${w} -${w*.24} ${d} ${d*.55}-${w} ${w*.24}Z`} fill={color} style={{filter:'brightness(1.14)'}}/>
  </g>;
  const seats = ['sofa', 'armchair', 'bench'];
  const tables = ['coffee-table', 'dining-table', 'desk'];
  const cabinets = ['wardrobe', 'dresser', 'tv-console', 'shoe-cabinet', 'kitchen-base', 'kitchen-wall', 'fridge', 'bookcase', 'shelf', 'stove', 'kitchen-sink', 'washer'];
  return <svg className="furniture-thumb" viewBox="0 0 160 110" role="img" aria-label={item.name}>
    <ellipse cx="80" cy="87" rx="55" ry="9" fill="var(--object-shadow)"/>
    {seats.includes(k) ? <>
      {box(31,58,k==='armchair'?48:82,20,23,wood,'base')}
      {box(29,36,k==='armchair'?47:84,30,10,fabric,'back')}
      {box(31,57,k==='armchair'?48:82,11,24,fabric,'seat')}
      {box(28,49,10,27,31,fabric,'left')}
      {box(k==='armchair'?72:106,39,10,27,31,fabric,'right')}
      {k==='sofa' && <path d="m72 47 14 8v11" stroke="var(--object-seam)" fill="none"/>}
    </> : tables.includes(k) ? <>
      {box(38,48,6,37,5,dark,'leg1')}{box(107,32,6,38,5,dark,'leg2')}{box(60,61,6,31,5,dark,'leg3')}{box(127,45,6,36,5,dark,'leg4')}
      {box(27,42,85,7,30,k==='coffee-table'?pale:wood,'top')}
    </> : k==='bed'||k==='single-bed' ? <>
      {box(34,26,k==='single-bed'?55:77,32,8,wood,'head')}
      {box(30,62,k==='single-bed'?58:80,13,32,wood,'base')}
      {box(31,51,k==='single-bed'?57:79,14,31,fabric,'mattress')}
      {box(35,46,k==='single-bed'?44:32,7,15,pale,'pillow1')}
      {k==='bed' && box(74,37,29,7,15,pale,'pillow2')}
      <path d="m36 69 76-18" stroke="var(--object-seam)" strokeWidth="2"/>
    </> : cabinets.includes(k) ? <>
      {box(43,k==='wardrobe'||k==='fridge'||k==='bookcase'?24:48,64,k==='wardrobe'||k==='fridge'||k==='bookcase'?64:32,22,k==='fridge'||k==='washer'?pale:wood,'cabinet')}
      {(k==='wardrobe'||k==='kitchen-base'||k==='dresser'||k==='shoe-cabinet') && <><path d="m74 25v62" stroke="var(--object-seam)"/><path d="m68 57v10m11-13v10" stroke={dark} strokeWidth="2"/></>}
      {k==='bookcase' && <><path d="m48 41 53-13m-53 31 53-13m-53 31 53-13" stroke={dark} strokeWidth="3"/><path d="m56 30v12m7-14v12m17-17v12m7-14v12" stroke={pale} strokeWidth="5"/></>}
      {k==='washer' && <ellipse cx="74" cy="67" rx="16" ry="17" fill={dark} stroke={pale} strokeWidth="5"/>}
      {k==='stove' && <><ellipse cx="67" cy="44" rx="10" ry="5" fill={dark}/><ellipse cx="99" cy="36" rx="10" ry="5" fill={dark}/><path d="m55 61 44-10v21l-44 10Z" fill={dark}/></>}
      {k==='kitchen-sink' && <ellipse cx="82" cy="48" rx="20" ry="9" fill={dark} stroke={pale} strokeWidth="3"/>}
    </> : k==='chair' ? <>
      {box(56,57,4,31,4,wood,'leg1')}{box(91,49,4,31,4,wood,'leg2')}{box(71,65,4,28,4,wood,'leg3')}
      {box(53,49,44,8,21,fabric,'seat')}{box(53,22,44,28,6,wood,'back')}
    </> : k==='rug' ? <><path d="m24 62 83-29 36 24-84 31Z" fill={fabric}/><path d="m34 63 71-25 27 18-71 26Z" fill="none" stroke={pale} strokeWidth="2"/></> : k==='bathtub' ? <><path d="m29 51 76-20 28 22-13 29-62 16-22-14Z" fill={pale}/><ellipse cx="80" cy="56" rx="44" ry="18" transform="rotate(-15 80 56)" fill="var(--object-inset)" stroke={pale} strokeWidth="7"/></> : k==='toilet' ? <>{box(57,27,35,33,14,pale,'tank')}<ellipse cx="85" cy="63" rx="25" ry="16" fill={pale}/><ellipse cx="85" cy="61" rx="14" ry="9" fill="var(--object-inset)"/>{box(72,71,21,15,11,pale,'base')}</> : k==='shower' ? <><path d="m44 76 48-11 26 15-48 12Z" fill={pale}/><path d="M44 22v54l26 16V36Zm26 14 48-11v55L70 92Z" fill="var(--object-glass)" stroke="var(--object-line)"/><path d="m44 22 48-11 26 14-48 11Z" fill="none" stroke="var(--object-line)"/></> : k==='vanity' ? <>{box(42,47,62,36,22,wood,'vanity')}<ellipse cx="82" cy="47" rx="26" ry="12" fill={pale}/><ellipse cx="82" cy="46" rx="17" ry="7" fill="var(--object-inset)"/><path d="M79 39V25q0-8 10-8" stroke={dark} strokeWidth="4" fill="none"/></> : k==='mirror' ? <><ellipse cx="80" cy="52" rx="29" ry="38" fill="var(--object-glass)" stroke={wood} strokeWidth="5"/><path d="m61 52 26-25m-14 43 23-23" stroke={pale}/></> : k==='coat-rack' ? <><path d="M80 18v67m-24 7 24-7 23 7M58 34l22 8 22-16M66 21l14 10 12-15" fill="none" stroke={wood} strokeWidth="5" strokeLinecap="round"/></> : <>
      {k==='sconce' ? <><path d="M70 34v42m0-20h20" stroke={wood} strokeWidth="5"/><circle cx="94" cy="45" r="19" fill={pale}/></> : k==='chandelier'||k==='globe-chandelier' ? <><path d="M80 8v44m-33 13 33-13 34 11M62 37l18 15 16-19" stroke={wood} strokeWidth="4" fill="none"/>{[[47,65],[114,63],[62,37],[96,33],[80,76]].map(([x,y])=><circle key={x+','+y} cx={x} cy={y} r="12" fill={pale}/>)}</> : <><path d={k==='pendant'?'M80 5v36':'M80 41v45'} stroke={wood} strokeWidth="4"/>{k!=='pendant'&&<ellipse cx="80" cy="87" rx="24" ry="7" fill={wood}/>}<path d="m61 31 38 0 15 30q-34 15-68 0Z" fill={fabric}/><ellipse cx="80" cy="32" rx="19" ry="5" fill={pale}/></>}
    </>}
  </svg>;
}
