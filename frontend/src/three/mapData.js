// Data-driven world map. Everything the 3D scene renders is described here, so
// the map can be expanded (more rows/cols, more props, more pets) just by
// editing this file — no scene code changes required.
//
// A prop occupies (col,row) as its top-left cell. Optional w/h give a
// multi-cell footprint (e.g. the manor is 2x2); the prop is centered over that
// footprint and (if solid) blocks every cell it covers. Optional scale sizes
// the mesh; bigger buildings use a larger footprint + scale.

export const TILE_SIZE = 1.0
export const TILE_HEIGHT = 0.32

// Tile glyph -> { color, walkable }. Tuned to the Tiny-World-Builder palette.
export const TILE_TYPES = {
  g: { color: 0xb0d949, walkable: true }, // bright grass (Tiny World palette)
  p: { color: 0xf2d29c, walkable: true }, // warm sand path
  w: { color: 0x3a8fcc, walkable: false }, // deeper blue water
  s: { color: 0x7d4519, walkable: false } // rich dirt
}

export const mapDef = {
  cols: 9,
  rows: 9,
  // row-major; each string is one row, one char per column
  grid: [
    'ggggggggg',
    'ggpgggpgg',
    'ppppppppp',
    'ggpgggpgg',
    'ggpgggpgg',
    'ggpgggpgg',
    'ppppppppp',
    'ggpgsspww',
    'ggggggpww'
  ],
  props: [
    // Large centerpiece — 2x2 footprint, scaled up.
    { type: 'manor', col: 3, row: 3, w: 2, h: 2, scale: 1.6, solid: true },

    { type: 'house', col: 1, row: 1, rot: -0.25, color: 0x7fb0e0, scale: 1.05, solid: true },
    { type: 'cottage', col: 7, row: 1, rot: 0.2, color: 0xe39a86, solid: true },
    { type: 'tower', col: 7, row: 4, scale: 1.15, solid: true },
    { type: 'windmill', col: 1, row: 5, scale: 1.15, solid: true },

    { type: 'tree', col: 0, row: 0, solid: true },
    { type: 'roundtree', col: 8, row: 0, solid: true },
    { type: 'tree', col: 0, row: 8, solid: true },
    { type: 'roundtree', col: 0, row: 4, solid: true },
    { type: 'tree', col: 8, row: 4, solid: true },

    { type: 'crops', col: 4, row: 7 },
    { type: 'crops', col: 5, row: 7 },
    { type: 'bridge', col: 7, row: 7 },

    { type: 'lamppost', col: 5, row: 5, solid: true },
    { type: 'lamppost', col: 5, row: 1, solid: true },
    { type: 'bench', col: 4, row: 5, rot: 0, solid: true },
    { type: 'flowerbed', col: 3, row: 5, solid: true },
    { type: 'haybale', col: 8, row: 5, solid: true },
    { type: 'signpost', col: 1, row: 3, solid: true },

    { type: 'bush', col: 0, row: 1 },
    { type: 'bush', col: 8, row: 1 },
    { type: 'flower', col: 0, row: 7, color: 0xff7aa0 },
    { type: 'flower', col: 7, row: 5, color: 0xffd23f },
    { type: 'mushroom', col: 0, row: 3 }
  ],
  // pets that spawn on the map (more can be added later)
  pets: [{ name: 'Mochi', col: 5, row: 3, primary: true }]
}

// Palette for the in-app editor.
export const TILE_PALETTE = [
  { glyph: 'g', label: 'Grass', icon: '🟩' },
  { glyph: 'p', label: 'Path', icon: '🟫' },
  { glyph: 'w', label: 'Water', icon: '🟦' },
  { glyph: 's', label: 'Soil', icon: '🟤' }
]

// price = coins spent each time you place this prop. recolor:true picks roof
// colour. Tiles in TILE_PALETTE are always free.
export const PROP_PALETTE = [
  { type: 'manor', label: 'Manor', icon: '🏛️', w: 2, h: 2, scale: 1.6, recolor: true, price: 250 },
  { type: 'house', label: 'House', icon: '🏠', recolor: true, price: 80 },
  { type: 'cottage', label: 'Cottage', icon: '🏡', recolor: true, price: 60 },
  { type: 'tower', label: 'Tower', icon: '🗼', recolor: true, price: 120 },
  { type: 'windmill', label: 'Windmill', icon: '🌬️', price: 150 },
  { type: 'barn', label: 'Barn', icon: '🚜', w: 2, h: 1, scale: 1.2, recolor: true, price: 130 },
  { type: 'fountain', label: 'Fountain', icon: '⛲', price: 65 },
  { type: 'gazebo', label: 'Gazebo', icon: '⛩', price: 75 },
  { type: 'marketstall', label: 'Stall', icon: '🎪', price: 50 },
  { type: 'statue', label: 'Statue', icon: '🗿', price: 45 },
  { type: 'well', label: 'Well', icon: '🚰', price: 35 },
  { type: 'campfire', label: 'Campfire', icon: '🔥', price: 20 },
  { type: 'roundtree', label: 'Tree', icon: '🌳', price: 8 },
  { type: 'tree', label: 'Pine', icon: '🌲', price: 8 },
  { type: 'bush', label: 'Bush', icon: '🌿', price: 4 },
  { type: 'lamppost', label: 'Lamp', icon: '💡', price: 20 },
  { type: 'bench', label: 'Bench', icon: '🪑', price: 15 },
  { type: 'flowerbed', label: 'Planter', icon: '🌷', price: 25 },
  { type: 'crops', label: 'Crops', icon: '🌾', price: 12 },
  { type: 'haybale', label: 'Hay', icon: '🟡', price: 10 },
  { type: 'signpost', label: 'Sign', icon: '🪧', price: 10 },
  { type: 'bridge', label: 'Bridge', icon: '🌉', price: 30 },
  { type: 'flower', label: 'Flower', icon: '🌸', price: 3 },
  { type: 'mushroom', label: 'Mushroom', icon: '🍄', price: 3 }
]
