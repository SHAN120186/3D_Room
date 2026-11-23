import { useEffect, useId, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Hand, Minus, Plus, Scan } from 'lucide-react';
import type { Apartment, FurnitureInstance, Opening, Point } from '../domain/types';
import { useEditor } from '../state/editor';
import { getCatalogItem } from '../domain/catalog';
import { getRoomArea, getRoomBounds, getWallSegment, openingWorld } from '../domain/geometry';

const format = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
interface Props { project?: Apartment; readOnly?: boolean; compact?: boolean; showDimensions?: boolean; fitActive?: boolean }
export default function Plan2D({project: supplied, readOnly=false, compact=false, showDimensions=true, fitActive=false}: Props) {
  const state=useEditor();
  const project=supplied??state.geometryPreview?.project??state.project;
  const gridId=useId().replace(/:/g,'');
  const svgRef=useRef<SVGSVGElement>(null);
  const shell=useRef<HTMLDivElement>(null);
  const [size,setSize]=useState({w:700,h:500});
  const [zoom,setZoom]=useState(1);
  const [pan,setPan]=useState({x:0,z:0});
  const [hand,setHand]=useState(false);
  const [hover,setHover]=useState<Point|null>(null);
  const dragging=useRef<{kind:'move'|'rotate'|'pan'|'wall'|'opening'|'place'|'underlay';offset:Point; original?:FurnitureInstance; wallId?:string; opening?:Opening; client?:{x:number;y:number};pan?:{x:number;z:number}}|null>(null);
  useEffect(()=>{if(!shell.current)return;const o=new ResizeObserver(([entry])=>setSize({w:entry.contentRect.width,h:entry.contentRect.height}));o.observe(shell.current);return()=>o.disconnect()},[]);
  useEffect(()=>{setZoom(1);setPan({x:0,z:0})},[project?.templateId,state.activeRoomId,state.planOverview,fitActive]);
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.code==='Escape')dragging.current=null};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[]);
  useEffect(()=>{const el=svgRef.current;if(!el||readOnly)return;const listener=(e:WheelEvent)=>{e.preventDefault();setZoom(v=>Math.max(.55,Math.min(3,v*(e.deltaY>0?.9:1.1))))};el.addEventListener('wheel',listener,{passive:false});return()=>el.removeEventListener('wheel',listener)},[readOnly,project?.id]);
  if(!project)return null;
  const p=project;
  const underlay=!readOnly&&state.step==='geometry'&&state.underlay?.visible&&state.underlay.fitted?state.underlay:null;
  const tool=underlay?state.underlayTool:'none';
  const focus=fitActive&&!state.planOverview&&!readOnly&&state.step==='interior';
  const rooms=focus?p.rooms.filter(r=>r.id===state.activeRoomId):p.rooms;
  const fitProject=supplied??state.project??p;
  const bounds=rooms.map(r=>getRoomBounds(fitProject,r.id,false));
  const minX=Math.min(...bounds.map(b=>b.xMin)),maxX=Math.max(...bounds.map(b=>b.xMax));
  const minZ=Math.min(...bounds.map(b=>b.zMin)),maxZ=Math.max(...bounds.map(b=>b.zMax));
  const basePadding=compact?40:Math.max(75,(maxX-minX)*.06);
  const roughScale=Math.min(size.w/(maxX-minX+basePadding*2),size.h/(maxZ-minZ+basePadding*2))||1;
  const padding=compact||!showDimensions?basePadding:Math.max(basePadding,32/roughScale);
  const vw=(maxX-minX+padding*2)/zoom,vh=(maxZ-minZ+padding*2)/zoom;
  const vx=(minX+maxX-vw)/2+pan.x,vz=(minZ+maxZ-vh)/2+pan.z;
  const scale=Math.min(size.w/vw,size.h/vh)||1;
  const textSize=(compact?10:14)/scale;
  const lineWidth=1.4/scale;
  const roomIds=new Set(rooms.map(r=>r.id));
  const visibleWalls=new Set(rooms.flatMap(r=>r.boundary.map(w=>w.wallId)));
  const point=(e:{clientX:number;clientY:number}):Point=>{const m=svgRef.current?.getScreenCTM();if(!m)return{xCm:0,zCm:0};const q=new DOMPoint(e.clientX,e.clientY).matrixTransform(m.inverse());return{xCm:q.x,zCm:q.y}};
  const beginItem=(e:ReactPointerEvent<SVGGElement>,item:FurnitureInstance)=>{if(readOnly||state.step!=='interior'||state.placement)return;e.stopPropagation();e.preventDefault();const q=point(e);state.beginDrag(item.id);dragging.current={kind:'move',offset:{xCm:q.xCm-item.xCm,zCm:q.zCm-item.zCm},original:item};svgRef.current?.setPointerCapture(e.pointerId)};
  const beginRotate=(e:ReactPointerEvent<SVGCircleElement>,item:FurnitureInstance)=>{e.stopPropagation();e.preventDefault();state.beginDrag(item.id);dragging.current={kind:'rotate',offset:{xCm:0,zCm:0},original:item};svgRef.current?.setPointerCapture(e.pointerId)};
  const onMove=(e:ReactPointerEvent<SVGSVGElement>)=>{if(readOnly)return;const d=dragging.current,q=point(e);if(d?.kind==='underlay'&&d.client){state.updateUnderlay({xCm:d.offset.xCm+(e.clientX-d.client.x)/scale,zCm:d.offset.zCm+(e.clientY-d.client.y)/scale});return}if(tool==='calibrate'){setHover(q);return}if(d?.kind==='wall'&&d.wallId&&state.project){const wall=getWallSegment(state.project,d.wallId);let delta=wall.horizontal?q.zCm-d.offset.zCm:q.xCm-d.offset.xCm;if(!e.altKey)delta=Math.round(delta/5)*5;state.previewWall(d.wallId,delta);return}if(d?.kind==='opening'&&d.opening&&state.project){const wall=getWallSegment(state.project,d.opening.wallId);let offset=d.opening.offsetCm+(wall.horizontal?q.xCm-d.offset.xCm:q.zCm-d.offset.zCm);if(!e.altKey)offset=Math.round(offset/5)*5;state.previewOpening(d.opening.id,{offsetCm:offset});return}if(d?.kind==='pan'&&d.client&&d.pan){setPan({x:d.pan.x-(e.clientX-d.client.x)/scale,z:d.pan.z-(e.clientY-d.client.y)/scale});return}if(d?.kind==='rotate'&&d.original){let angle=Math.atan2(q.zCm-d.original.zCm,q.xCm-d.original.xCm)*180/Math.PI+90;if(!e.altKey)angle=Math.round(angle/15)*15;state.setDraft({...d.original,angleDeg:((angle%360)+360)%360});return}if(d?.kind==='move')state.previewAt(q.xCm-d.offset.xCm,q.zCm-d.offset.zCm,e.altKey);else if(state.placement)state.previewAt(q.xCm,q.zCm,e.altKey)};
  const onDown=(e:ReactPointerEvent<SVGSVGElement>)=>{if(readOnly)return;if(hand||e.button===1||e.button===2){e.preventDefault();dragging.current={kind:'pan',offset:{xCm:0,zCm:0},client:{x:e.clientX,y:e.clientY},pan};e.currentTarget.setPointerCapture(e.pointerId);return}if(tool==='calibrate'&&e.button===0){state.addCalibrationPoint(point(e));return}if(tool==='move'&&underlay&&e.button===0){e.preventDefault();dragging.current={kind:'underlay',offset:{xCm:underlay.xCm,zCm:underlay.zCm},client:{x:e.clientX,y:e.clientY}};e.currentTarget.setPointerCapture(e.pointerId);return}if(state.placement){const q=point(e);state.previewAt(q.xCm,q.zCm,e.altKey);dragging.current={kind:'place',offset:{xCm:0,zCm:0}};e.currentTarget.setPointerCapture(e.pointerId)}else if(e.target===e.currentTarget)state.select(null)};
  const onUp=(e:ReactPointerEvent<SVGSVGElement>)=>{const d=dragging.current;dragging.current=null;const rect=e.currentTarget.getBoundingClientRect();const outside=e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom;if(d&&d.kind!=='pan'&&d.kind!=='underlay'&&outside){const live=useEditor.getState();if(d.kind==='wall'||d.kind==='opening')live.cancelGeometry();else live.cancelDraft();if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);return}if(d?.kind==='wall'||d?.kind==='opening'){const live=useEditor.getState(),preview=live.geometryPreview;if(preview?.validation.valid)live.commitGeometry();else if(preview){const reason=preview.validation.reason;live.cancelGeometry();live.setNotice(reason??'Изменение не применено.')}}else if(d&&d.kind!=='pan'&&d.kind!=='underlay')useEditor.getState().commitDraft();if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId)};
  const cancel=()=>{const d=dragging.current;if(d){dragging.current=null;if(d.kind==='wall'||d.kind==='opening')state.cancelGeometry();else state.cancelDraft()}};
  const drawFurniture=(item:FurnitureInstance,ghost=false)=>{
    const data=getCatalogItem(item.catalogItemId),w=data.widthCm,d=data.depthCm,selected=state.selection?.kind==='furniture'&&state.selection.id===item.id;
    const invalid=ghost&&!state.draftValidation.valid;
    return <g key={ghost?'draft':item.id} transform={`translate(${item.xCm} ${item.zCm}) rotate(${item.angleDeg})`} className={`plan-furniture${ghost?' is-preview':''}${selected?' selected':''}`} style={{pointerEvents:ghost?'none':undefined}} onPointerDown={e=>beginItem(e,item)} role={readOnly?undefined:'button'} tabIndex={readOnly?-1:0} aria-label={`${data.name}, ${w} на ${d} сантиметров`} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();state.select({kind:'furniture',id:item.id})}}}>
      <rect x={-w/2} y={-d/2} width={w} height={d} rx={data.layer==='rug'?2:6} fill={invalid?'var(--danger-soft)':item.color} stroke={invalid?'var(--danger)':selected?'var(--accent)':'var(--plan-object-edge)'} strokeWidth={(selected||ghost?2:1)/scale}/>
      {(data.kind==='sofa'||data.kind==='armchair')&&<><rect x={-w/2+7} y={-d/2+7} width={w-14} height={Math.max(15,d*.2)} rx={4} fill="var(--object-seam)"/><path d={`M${-w/2+10} ${-d/2+30}V${d/2-10}M${w/2-10} ${-d/2+30}V${d/2-10}`} stroke="var(--object-seam)" strokeWidth={4}/></>}
      {(data.kind==='bed'||data.kind==='single-bed')&&<><rect x={-w/2+8} y={-d/2+12} width={w-16} height={35} rx={7} fill="var(--object-pale)"/><path d={`M${-w/2+6} ${-d/2+65}H${w/2-6}`} stroke="var(--object-seam)" strokeWidth={4}/></>}
      {selected&&!ghost&&!readOnly&&<><path d={`M0 ${-d/2}v${-30/scale}`} stroke="var(--accent)" strokeWidth={lineWidth}/><circle cx={0} cy={-d/2-30/scale} r={7/scale} fill="var(--accent)" stroke="var(--canvas)" strokeWidth={2/scale} pointerEvents="all" onPointerDown={e=>beginRotate(e,item)} aria-label="Повернуть предмет"/><path d={`M${-5/scale} ${-d/2-30/scale}h${10/scale}`} stroke="var(--accent-ink)" strokeWidth={1/scale}/></>}
    </g>
  };
  return <div className={`plan-shell${compact?' compact':''}${readOnly?' readonly':''}`} ref={shell}>
    <svg ref={svgRef} className={`plan-svg${hand?' pan-mode':''}${state.placement&&!readOnly?' placement-mode':''}${underlay?' with-underlay':''}${tool!=='none'&&!hand?` underlay-tool tool-${tool}`:''}`} viewBox={`${vx} ${vz} ${vw} ${vh}`} aria-label="План квартиры в сантиметрах" onPointerMove={onMove} onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={cancel} onLostPointerCapture={cancel} onContextMenu={e=>e.preventDefault()}>
      <title>План квартиры. Все линейные размеры указаны в сантиметрах.</title>
      {!compact&&<><defs><pattern id={`${gridId}-minor`} width={50} height={50} patternUnits="userSpaceOnUse"><path d="M50 0H0V50" fill="none" stroke="var(--plan-grid)" strokeWidth={1/scale}/></pattern><pattern id={`${gridId}-major`} width={100} height={100} patternUnits="userSpaceOnUse"><path d="M100 0H0V100" fill="none" stroke="var(--plan-grid-major)" strokeWidth={1/scale}/></pattern></defs><g className="plan-grid" pointerEvents="none" aria-hidden="true"><rect x={vx} y={vz} width={vw} height={vh} fill={`url(#${gridId}-minor)`}/><rect x={vx} y={vz} width={vw} height={vh} fill={`url(#${gridId}-major)`}/></g></>}
      {underlay&&<image className={`plan-underlay${underlay.invert?' inverted':''}`} href={underlay.url} x={0} y={0} width={underlay.widthPx} height={underlay.heightPx} preserveAspectRatio="none" opacity={underlay.opacity} transform={`translate(${underlay.xCm} ${underlay.zCm}) rotate(${underlay.rotation}) scale(${underlay.cmPerPx})`} pointerEvents="none" aria-hidden="true"/>}
      {rooms.map(room=>{const b=getRoomBounds(p,room.id,true),active=!readOnly&&state.activeRoomId===room.id;return <g key={room.id}>
        <rect x={b.xMin} y={b.zMin} width={b.xMax-b.xMin} height={b.zMax-b.zMin} fill={`var(--room-${room.type})`} className={active?'room-active':'room-floor'} onClick={()=>{if(!readOnly&&!state.placement&&!dragging.current)state.setActiveRoom(room.id)}}/>
        {!compact&&<text className="plan-room-label" x={(b.xMin+b.xMax)/2} y={(b.zMin+b.zMax)/2-textSize*.35} textAnchor="middle" fontSize={textSize} pointerEvents="none"><tspan>{room.name}</tspan><tspan x={(b.xMin+b.xMax)/2} dy={textSize*1.5} className="plan-room-area" fontSize={textSize*.9}>{format.format(getRoomArea(p,room.id))} м²</tspan></text>}
      </g>})}
      {Object.values(p.walls).filter(w=>visibleWalls.has(w.id)).map(w=>{const s=getWallSegment(p,w.id),selected=state.selection?.kind==='wall'&&state.selection.id===w.id&&!readOnly;return <g key={w.id}>
        <line x1={s.start.xCm} y1={s.start.zCm} x2={s.end.xCm} y2={s.end.zCm} stroke={selected?(state.geometryPreview&&!state.geometryPreview.validation.valid?'var(--danger)':'var(--accent)'):'var(--plan-wall)'} strokeWidth={w.thicknessCm} strokeLinecap="square" className={`plan-wall${selected?' selected':''}`}/>
        {!readOnly&&<line x1={s.start.xCm} y1={s.start.zCm} x2={s.end.xCm} y2={s.end.zCm} stroke="transparent" strokeWidth={Math.max(w.thicknessCm,16/scale)} className="wall-hit" onPointerDown={e=>{if(state.placement||hand||e.button!==0)return;e.stopPropagation();state.select({kind:'wall',id:w.id});if(state.step==='geometry'){dragging.current={kind:'wall',wallId:w.id,offset:point(e)};svgRef.current?.setPointerCapture(e.pointerId)}}}/>}
      </g>})}
      {p.openings.filter(o=>visibleWalls.has(o.wallId)).map(o=>{const loc=openingWorld(p,o),wall=getWallSegment(p,o.wallId),selected=state.selection?.kind==='opening'&&state.selection.id===o.id;const swing=p.rooms.find(r=>r.id===o.swingRoomId);const b=swing?getRoomBounds(p,swing.id):null;const normal=wall.horizontal?{x:0,z:b&&((b.zMin+b.zMax)/2)<loc.center.zCm?-1:1}:{x:b&&((b.xMin+b.xMax)/2)<loc.center.xCm?-1:1,z:0};const hinge=o.hinge==='start'?loc.start:loc.end,end=o.hinge==='start'?loc.end:loc.start;const leaf={x:hinge.xCm+normal.x*o.widthCm,z:hinge.zCm+normal.z*o.widthCm};const sweep=((end.xCm-hinge.xCm)*(leaf.z-hinge.zCm)-(end.zCm-hinge.zCm)*(leaf.x-hinge.xCm))>0?1:0;return <g key={o.id} onPointerDown={e=>{if(readOnly||state.placement||hand||e.button!==0)return;e.stopPropagation();state.select({kind:'opening',id:o.id});if(state.step==='geometry'){dragging.current={kind:'opening',opening:{...o},offset:point(e)};svgRef.current?.setPointerCapture(e.pointerId)}}} className={!readOnly?'opening-hit':''}>
        <line x1={loc.start.xCm} y1={loc.start.zCm} x2={loc.end.xCm} y2={loc.end.zCm} stroke="var(--canvas)" strokeWidth={p.walls[o.wallId].thicknessCm+2}/>
        {o.kind==='window'?<><line x1={loc.start.xCm} y1={loc.start.zCm} x2={loc.end.xCm} y2={loc.end.zCm} stroke={selected?'var(--accent)':'var(--plan-window)'} strokeWidth={8}/><line x1={loc.start.xCm} y1={loc.start.zCm} x2={loc.end.xCm} y2={loc.end.zCm} stroke="var(--canvas)" strokeWidth={3}/></>:<><path d={`M${end.xCm} ${end.zCm}A${o.widthCm} ${o.widthCm} 0 0 ${sweep} ${leaf.x} ${leaf.z}`} fill="none" stroke={selected?'var(--accent)':'var(--plan-door)'} strokeWidth={lineWidth*.75}/><line x1={hinge.xCm} y1={hinge.zCm} x2={leaf.x} y2={leaf.z} stroke={selected?'var(--accent)':'var(--plan-door)'} strokeWidth={lineWidth*1.4}/></>}
        {!readOnly&&<line x1={loc.start.xCm} y1={loc.start.zCm} x2={loc.end.xCm} y2={loc.end.zCm} stroke="transparent" strokeWidth={20/scale}/>}
      </g>})}
      {p.furniture.filter(item=>roomIds.has(item.roomId)&&!(state.draft?.id===item.id&&!readOnly)).map(item=>drawFurniture(item))}
      {!readOnly&&state.draft&&roomIds.has(state.draft.roomId)&&drawFurniture(state.draft,true)}
      {showDimensions&&!compact&&(()=>{const t=6/scale,top=minZ-padding*.55,right=maxX+padding*.55;const tick=(x:number,z:number)=>`M${x-t} ${z+t}L${x+t} ${z-t}`;return <g className="plan-dimensions" fontSize={textSize*.85}>
        <path className="dim-line" d={`M${minX-t*1.6} ${top}H${maxX+t*1.6}M${minX} ${minZ-padding*.18}V${top-t*1.8}M${maxX} ${minZ-padding*.18}V${top-t*1.8}`} fill="none" strokeWidth={.8/scale}/>
        <path className="dim-tick" d={tick(minX,top)+tick(maxX,top)} fill="none" strokeWidth={1.8/scale}/>
        <text x={(minX+maxX)/2} y={top-textSize*.45} textAnchor="middle">{Math.round(maxX-minX)} см</text>
        <path className="dim-line" d={`M${right} ${minZ-t*1.6}V${maxZ+t*1.6}M${maxX+padding*.18} ${minZ}H${right+t*1.8}M${maxX+padding*.18} ${maxZ}H${right+t*1.8}`} fill="none" strokeWidth={.8/scale}/>
        <path className="dim-tick" d={tick(right,minZ)+tick(right,maxZ)} fill="none" strokeWidth={1.8/scale}/>
        <text x={right+textSize*.45} y={(minZ+maxZ)/2} transform={`rotate(90 ${right+textSize*.45} ${(minZ+maxZ)/2})`} textAnchor="middle">{Math.round(maxZ-minZ)} см</text>
      </g>})()}
      {tool==='calibrate'&&state.calibration.length>0&&(()=>{const [a,b]=state.calibration,end=b??hover;return <g className="calibration-marks" pointerEvents="none">
        {end&&<line x1={a.xCm} y1={a.zCm} x2={end.xCm} y2={end.zCm} strokeWidth={2/scale} strokeDasharray={b?undefined:`${6/scale} ${4/scale}`}/>}
        {[a,b].filter(Boolean).map((c,i)=><circle key={i} cx={c!.xCm} cy={c!.zCm} r={6/scale} strokeWidth={2/scale}/>)}
      </g>})()}
    </svg>
    {!compact&&!readOnly&&<div className="plan-controls" aria-label="Масштаб плана"><button className={`icon-button${hand?' selected':''}`} aria-label="Перемещать план" title="Перемещать план" aria-pressed={hand} onClick={()=>setHand(!hand)}><Hand size={18}/></button><button className="icon-button" aria-label="Уменьшить план" title="Уменьшить план" onClick={()=>setZoom(v=>Math.max(.55,v/1.2))}><Minus size={18}/></button><span className="zoom-label">{Math.round(zoom*100)}%</span><button className="icon-button" aria-label="Увеличить план" title="Увеличить план" onClick={()=>setZoom(v=>Math.min(3,v*1.2))}><Plus size={18}/></button><button className="icon-button" aria-label="Показать план целиком" title="Показать план целиком" onClick={()=>{setZoom(1);setPan({x:0,z:0})}}><Scan size={18}/></button></div>}
  </div>
}
