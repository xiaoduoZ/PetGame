// Crop catalog for the farming system. growSec is real seconds to ripen
// (kept short so growth is visible within a session); seedCost is spent to
// plant, coins/xp are awarded on harvest. fruit/leaf are render colors.
export const CROPS = {
  carrot: {
    label: 'Carrot', icon: '🥕', seedCost: 5, growSec: 60, coins: 12, xp: 5,
    fruit: 0xff8a3c, leaf: 0x57a64a
  },
  strawberry: {
    label: 'Strawberry', icon: '🍓', seedCost: 10, growSec: 90, coins: 26, xp: 10,
    fruit: 0xe34b4b, leaf: 0x57a64a
  },
  wheat: {
    label: 'Wheat', icon: '🌾', seedCost: 8, growSec: 120, coins: 22, xp: 8,
    fruit: 0xe8c558, leaf: 0xcdb24a
  },
  pumpkin: {
    label: 'Pumpkin', icon: '🎃', seedCost: 15, growSec: 240, coins: 55, xp: 20,
    fruit: 0xff8a3c, leaf: 0x4f9e4a
  }
}

export const SEED_LIST = Object.keys(CROPS).map((k) => ({ type: k, ...CROPS[k] }))

// Growth fraction 0..1 from plantedAt (epoch ms). >=1 means ripe.
export function cropStage(crop, now = Date.now()) {
  const def = CROPS[crop.type]
  if (!def) return 1
  return Math.min(1, (now - crop.plantedAt) / 1000 / def.growSec)
}
