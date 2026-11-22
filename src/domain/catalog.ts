import type { CatalogItem, Collider, FloorKind, FurnitureKind, RoomType } from './types';

/** Original generic designs. All dimensions are cm; local origin is centre-bottom. */
const allRooms: RoomType[] = ['living', 'bedroom', 'kitchen', 'bathroom', 'toilet', 'hall'];
const livingRooms: RoomType[] = ['living', 'bedroom'];
const box = (widthCm: number, heightCm: number, depthCm: number, xCm = 0, yCm = heightCm / 2, zCm = 0): Collider =>
  ({ widthCm, heightCm, depthCm, xCm, yCm, zCm });

/** A five-centimetre tabletop and four separate legs leave real space for chairs. */
function tableColliders(width: number, depth: number, height: number, leg = 6): Collider[] {
  const legHeight = height - 5;
  const x = width / 2 - leg / 2 - 6;
  const z = depth / 2 - leg / 2 - 6;
  return [
    box(width, 5, depth, 0, height - 2.5),
    ...[-x, x].flatMap(px => [-z, z].map(pz => box(leg, legHeight, leg, px, legHeight / 2, pz))),
  ];
}

/** Seat top is 45 cm. Rear (-Z) backrest occupies 45–80 cm above the floor. */
const chairColliders: Collider[] = [
  box(48, 5, 52, 0, 42.5),
  ...[-19, 19].flatMap(x => [-20, 20].map(z => box(4, 40, 4, x, 20, z))),
  box(48, 35, 6, 0, 62.5, -23),
];

const item = (kind: FurnitureKind, name: string, category: string, size: [number, number, number],
  roomTypes: RoomType[], color: string, description: string, extra: Partial<CatalogItem> = {}): CatalogItem => ({
  id: kind, kind, name, category, roomTypes, widthCm: size[0], depthCm: size[1], heightCm: size[2],
  placement: 'floor', layer: 'solid', color, description, ...extra,
});

export const CATALOG: CatalogItem[] = [
  item('sofa', 'Диван «Линия»', 'Мягкая мебель', [220, 94, 84], ['living'], '#c5c1b7',
    'Трёхместный диван с мягкими подлокотниками и тканевой обивкой.', {
      colliders: [box(220, 84, 94)],
    }),
  item('armchair', 'Кресло «Форма»', 'Мягкая мебель', [80, 86, 82], livingRooms, '#899384',
    'Мягкое кресло с глубокой посадкой и деревянными опорами.', {
      colliders: [box(80, 82, 86)],
    }),
  item('coffee-table', 'Журнальный стол', 'Столы', [110, 60, 40], ['living'], '#a78056',
    'Дубовая столешница толщиной 5 см на четырёх опорах.', { colliders: tableColliders(110, 60, 40, 4) }),
  item('dining-table', 'Обеденный стол', 'Столы', [160, 90, 75], ['living', 'kitchen'], '#b49369',
    'Прямоугольный стол на четыре–шесть мест; высота столешницы 75 см.', { colliders: tableColliders(160, 90, 75) }),
  item('chair', 'Стул «Контур»', 'Стулья', [48, 52, 80], ['living', 'bedroom', 'kitchen'], '#7f8d83',
    'Сиденье на высоте 45 см. Можно задвинуть под стол, не задевая его ножки.', { colliders: chairColliders }),
  item('tv-console', 'Тумба под ТВ', 'Хранение', [160, 40, 55], ['living', 'bedroom'], '#78644f',
    'Низкая тумба с двумя фасадами и открытой центральной секцией.'),
  item('bookcase', 'Стеллаж', 'Хранение', [90, 35, 200], ['living', 'bedroom', 'hall'], '#b18f67',
    'Открытый стеллаж с пятью полками и закрытой задней стенкой.', {
      colliders: [box(90, 200, 35)],
    }),
  item('rug', 'Ковёр «Тихий ритм»', 'Текстиль', [200, 300, 1], ['living', 'bedroom', 'hall'], '#aaa598',
    'Плоский тканый ковёр. Допускает размещение под мебелью.', { layer: 'rug' }),
  item('bed', 'Кровать 160 × 200', 'Кровати', [170, 215, 105], ['bedroom'], '#c3b6a3',
    'Двуспальная кровать; габарит с мягким изголовьем — 170 × 215 см.', {
      colliders: [box(170, 105, 215)],
    }),
  item('single-bed', 'Кровать 90 × 200', 'Кровати', [100, 210, 95], ['bedroom'], '#a3a29b',
    'Односпальная кровать с невысоким тканевым изголовьем.', {
      colliders: [box(100, 95, 210)],
    }),
  item('nightstand', 'Прикроватная тумба', 'Хранение', [50, 42, 55], ['bedroom'], '#ab8a63',
    'Компактная тумба с двумя ящиками; верхняя поверхность на высоте 55 см.'),
  item('wardrobe', 'Шкаф для одежды', 'Хранение', [160, 60, 220], ['bedroom', 'hall'], '#c4c2b9',
    'Двухдверный шкаф с матовыми фасадами и встроенными ручками.'),
  item('dresser', 'Комод', 'Хранение', [120, 45, 85], ['bedroom', 'living', 'hall'], '#b29a7b',
    'Комод с тремя широкими ящиками; верхняя поверхность на высоте 85 см.'),
  item('desk', 'Письменный стол', 'Столы', [140, 65, 75], ['bedroom', 'living'], '#b99a73',
    'Рабочая поверхность 140 × 65 см без тумбы под столом.', { colliders: tableColliders(140, 65, 75) }),
  item('kitchen-base', 'Кухонная тумба', 'Кухня', [80, 60, 90], ['kitchen', 'living'], '#8b968a',
    'Напольный модуль со столешницей на высоте 90 см.'),
  item('kitchen-wall', 'Навесной шкаф', 'Кухня', [80, 35, 70], ['kitchen', 'living'], '#c4c8bf',
    'Настенный кухонный модуль. Нижняя грань на высоте 145 см.', { placement: 'wall', mountHeightCm: 145 }),
  item('fridge', 'Холодильник', 'Техника', [60, 65, 185], ['kitchen', 'living'], '#b8bec0',
    'Двухкамерный холодильник; габариты учитывают корпус и двери.'),
  item('stove', 'Плита', 'Техника', [60, 60, 90], ['kitchen', 'living'], '#c8cdcd',
    'Четырёхконфорочная плита с духовкой в стандартном напольном корпусе.'),
  item('kitchen-sink', 'Тумба с мойкой', 'Кухня', [80, 60, 90], ['kitchen', 'living'], '#879386',
    'Напольный модуль с врезной мойкой и смесителем.'),
  item('bathtub', 'Ванна', 'Сантехника', [170, 75, 60], ['bathroom'], '#dfdfd9',
    'Прямоугольная ванна с закруглённой чашей и наружным экраном.'),
  item('shower', 'Душевая кабина', 'Сантехника', [90, 90, 210], ['bathroom'], '#c4dad9',
    'Душевой уголок с поддоном и стеклянными ограждениями.'),
  item('vanity', 'Тумба с раковиной', 'Сантехника', [80, 50, 85], ['bathroom', 'toilet'], '#a28d73',
    'Тумба с двумя фасадами и накладной раковиной.'),
  item('toilet', 'Унитаз', 'Сантехника', [38, 66, 79], ['bathroom', 'toilet'], '#e5e4dc',
    'Напольный унитаз с бачком; полный габарит от стены до края чаши 66 см.', {
      colliders: [box(38, 79, 66)],
    }),
  item('washer', 'Стиральная машина', 'Техника', [60, 60, 85], ['bathroom', 'kitchen'], '#d8dbd6',
    'Фронтальная загрузка; габариты 60 × 60 × 85 см.'),
  item('mirror', 'Настенное зеркало', 'Зеркала', [70, 5, 90], ['bathroom', 'toilet', 'hall', 'bedroom'], '#d0d9d8',
    'Вертикальное зеркало в тонкой раме. Нижняя грань на высоте 100 см.', { placement: 'wall', mountHeightCm: 100 }),
  item('bench', 'Банкетка', 'Мягкая мебель', [100, 38, 46], ['hall', 'bedroom'], '#a8a695',
    'Мягкое сиденье на четырёх деревянных ножках.', {
      colliders: [box(100, 46, 38)],
    }),
  item('coat-rack', 'Напольная вешалка', 'Хранение', [50, 50, 175], ['hall'], '#847461',
    'Вертикальная вешалка с устойчивым основанием и верхними крючками.', {
      colliders: [box(50, 5, 50, 0, 2.5), box(5, 160, 5, 0, 85), box(50, 30, 50, 0, 160)],
    }),
  item('shoe-cabinet', 'Обувница', 'Хранение', [90, 30, 105], ['hall'], '#bab4a7',
    'Узкая обувница с тремя откидными секциями.'),
  item('shelf', 'Настенная полка', 'Хранение', [120, 24, 20], ['living', 'bedroom', 'kitchen', 'hall'], '#b09168',
    'Полка с боковинами; нижняя грань на высоте 145 см.', {
      placement: 'wall', mountHeightCm: 145,
      colliders: [box(120, 3, 24, 0, 1.5), box(3, 17, 24, -58.5, 11.5), box(3, 17, 24, 58.5, 11.5), box(114, 17, 2, 0, 11.5, -11)],
    }),
  item('floor-lamp', 'Торшер', 'Свет', [40, 40, 160], ['living', 'bedroom', 'hall'], '#c6bdac',
    'Тканевый абажур и тонкая стойка на круглом основании.', {
      colliders: [box(30, 4, 30, 0, 2), box(3, 126, 3, 0, 67), box(40, 30, 40, 0, 145)],
    }),
  item('table-lamp', 'Настольная лампа', 'Свет', [28, 28, 42], ['living', 'bedroom', 'kitchen', 'bathroom', 'hall'], '#c9b99a',
    'Устанавливается только на столешницу подходящего предмета.', {
      placement: 'tabletop',
      colliders: [box(18, 3, 18, 0, 1.5), box(3, 23, 3, 0, 14.5), box(28, 16, 28, 0, 34)],
    }),
  item('sconce', 'Настенное бра', 'Свет', [16, 18, 28], allRooms, '#c4b58e',
    'Настенный светильник; нижняя грань на высоте 165 см.', { placement: 'wall', mountHeightCm: 165 }),
  item('pendant', 'Потолочный плафон', 'Свет', [42, 42, 18], allRooms, '#d8d4c8',
    'Невысокий потолочный плафон; устанавливается верхней гранью к потолку.', { placement: 'ceiling' }),
  item('chandelier', 'Люстра «Кольцо»', 'Свет', [70, 70, 65], ['living', 'bedroom', 'kitchen', 'hall'], '#bca679',
    'Кольцевая люстра на подвесах; заменяет стандартный светильник комнаты.', { placement: 'ceiling' }),
  item('globe-chandelier', 'Люстра «Сферы»', 'Свет', [80, 80, 55], ['living', 'bedroom', 'hall'], '#c8b38d',
    'Композиция с круглыми плафонами; верхнее крепление на потолке.', { placement: 'ceiling' }),
];

const byId = new Map(CATALOG.map(entry => [entry.id, entry]));
export function getCatalogItem(id: string): CatalogItem {
  const entry = byId.get(id);
  if (!entry) throw new Error(`Предмет каталога «${id}» не найден`);
  return entry;
}

/** Only these original designs expose a supported horizontal surface for a lamp. */
export const TABLETOP_SUPPORT_KINDS: ReadonlySet<FurnitureKind> = new Set([
  'desk', 'dining-table', 'coffee-table', 'nightstand', 'dresser', 'kitchen-base',
]);

export const FLOOR_COLORS: Record<FloorKind, { name: string; color: string }[]> = {
  laminate: [
    { name: 'Светлый дуб', color: '#c8ae86' },
    { name: 'Натуральный дуб', color: '#a98458' },
    { name: 'Дымчатый ясень', color: '#8e908b' },
  ],
  linoleum: [
    { name: 'Мягкий серый', color: '#b8b9b3' },
    { name: 'Светлый камень', color: '#d1cfc6' },
    { name: 'Тёплый графит', color: '#797b78' },
  ],
  carpet: [
    { name: 'Жемчужный', color: '#b8b5ac' },
    { name: 'Шалфей', color: '#8a9686' },
    { name: 'Глубокий серый', color: '#777e81' },
  ],
};

export const WALL_COLORS: { name: string; color: string }[] = [
  { name: 'Тёплый белый', color: '#e7e5dc' },
  { name: 'Меловой', color: '#d6d5cd' },
  { name: 'Каменный', color: '#b2b3ac' },
  { name: 'Шалфей', color: '#a1af9d' },
  { name: 'Дымчатый голубой', color: '#9fadb2' },
  { name: 'Глина', color: '#b58d78' },
  { name: 'Пудровый', color: '#c8acaa' },
  { name: 'Графит', color: '#656e70' },
];
