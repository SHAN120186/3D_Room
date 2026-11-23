export type RoomType = 'living' | 'bedroom' | 'kitchen' | 'bathroom' | 'toilet' | 'hall';
export type Placement = 'floor' | 'wall' | 'ceiling' | 'tabletop';
export type FloorKind = 'laminate' | 'linoleum' | 'carpet';
export interface Point { xCm: number; zCm: number }
export interface Vertex extends Point { id: string }
export interface Wall { id: string; startId: string; endId: string; thicknessCm: number }
export interface BoundaryEdge { wallId: string; forward: boolean }
export interface FloorFinish { kind: FloorKind; color: string }
export interface WallFinish { kind: 'paint' | 'wallpaper'; color: string }
export interface Room { id: string; name: string; type: RoomType; boundary: BoundaryEdge[]; floor: FloorFinish; lightOn: boolean }
export interface Opening { id: string; kind: 'door' | 'window'; wallId: string; offsetCm: number; widthCm: number; heightCm: number; sillCm: number; hinge: 'start' | 'end'; swingRoomId: string | null }
export type FurnitureKind = 'sofa' | 'armchair' | 'coffee-table' | 'dining-table' | 'chair' | 'tv-console' | 'bookcase' | 'rug' | 'bed' | 'single-bed' | 'nightstand' | 'wardrobe' | 'dresser' | 'desk' | 'kitchen-base' | 'kitchen-wall' | 'fridge' | 'stove' | 'kitchen-sink' | 'bathtub' | 'shower' | 'vanity' | 'toilet' | 'washer' | 'mirror' | 'bench' | 'coat-rack' | 'shoe-cabinet' | 'shelf' | 'floor-lamp' | 'table-lamp' | 'sconce' | 'pendant' | 'chandelier' | 'globe-chandelier';
export interface Collider { xCm: number; yCm: number; zCm: number; widthCm: number; heightCm: number; depthCm: number }
export interface CatalogItem { id: string; name: string; category: string; roomTypes: RoomType[]; kind: FurnitureKind; widthCm: number; depthCm: number; heightCm: number; placement: Placement; layer: 'solid' | 'rug'; color: string; mountHeightCm?: number; colliders?: Collider[]; description: string }
export interface FurnitureInstance extends Point { id: string; catalogItemId: string; roomId: string; yCm: number; angleDeg: number; color: string; wallId?: string; supportId?: string }
export interface Apartment { id: string; templateId: string; name: string; ceilingHeightCm: number; vertices: Record<string, Vertex>; walls: Record<string, Wall>; rooms: Room[]; openings: Opening[]; furniture: FurnitureInstance[]; wallFinishes: Record<string, WallFinish> }
/** 0 — студия, 1–4 — число жилых комнат на стартовом экране. */
export type RoomChoice = 0 | 1 | 2 | 3 | 4;
export interface LayoutTemplate { id: string; name: string; livingRooms: 1 | 2 | 3 | 4; choices: RoomChoice[]; description: string; kitchen: string; bathroom: string; apartment: Apartment }
export interface Rect { xMin: number; xMax: number; zMin: number; zMax: number }
export interface Validation { valid: boolean; code?: string; reason?: string; conflicts?: string[] }
export type Selection = { kind: 'wall' | 'opening' | 'furniture'; id: string } | null;
export type EditorStep = 'start' | 'layouts' | 'geometry' | 'interior';
export interface QualityStatus { running: boolean; samples: number; seconds: number; error: string | null; complete: boolean }
export interface GeometryPreview { project: Apartment; validation: Validation; affected: { roomId: string; name: string; widthCm: number; depthCm: number; areaM2: number }[] }
