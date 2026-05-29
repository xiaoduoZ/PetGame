<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import PetScene from '../three/PetScene.js'
import { store, applyToolAt, complete, interact, finishTask, farmClick, setThumbnails } from '../store.js'

// Each interaction button corresponds to a map feature, an action animation,
// and the celebratory reaction that fires right after the action.
const TEMPLATE_TARGETS = {
  drink_water: { tile: 'w', action: 'drink', reaction: 'water' },
  exercise_15m: { prop: 'haybale', action: 'exercise', reaction: 'exercise' },
  study_25m: { prop: 'bench', action: 'study', reaction: 'study' },
  play_10m: { prop: 'flowerbed', action: 'play', reaction: 'play' }
}

const canvas = ref(null)
let scene = null
let down = null

function onResize() {
  scene && scene.resize()
}
function onPointerDown(e) {
  down = { x: e.clientX, y: e.clientY }
}
function onPointerUp(e) {
  if (!scene || !down) return
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y)
  down = null
  if (moved > 6) return // that was an orbit drag, not a tap

  if (store.editMode) {
    const cell = scene.pickCell(e.clientX, e.clientY)
    if (cell) applyToolAt(cell.col, cell.row)
    return
  }
  if (store.farmMode) {
    const cell = scene.pickCell(e.clientX, e.clientY)
    if (cell) farmClick(cell.col, cell.row)
    return
  }
  // Tap the pet itself -> pet it.
  const pet = scene.pickPet(e.clientX, e.clientY)
  if (pet) {
    pet.react('pet')
    return
  }
  const cell = scene.pickCell(e.clientX, e.clientY)
  if (!cell || !store.map) return
  const glyph = store.map.grid[cell.row][cell.col]
  if (glyph === 'w') {
    // Same ritual as the Water button — go drink there.
    interact('drink_water')
  } else if (scene.grid.isWalkable(cell.col, cell.row)) {
    scene.sendPetTo(cell, null, null) // just stroll over there
  }
}

// Find the cell of the nearest matching map feature for a given target.
function findNearestTarget(cfg) {
  if (!scene || !store.map) return null
  const a = scene.primaryActor
  const pos = a ? a.group.position : { x: 0, z: 0 }
  let best = null
  let bestD = Infinity
  if (cfg.prop) {
    for (const p of store.map.props) {
      if (p.type !== cfg.prop) continue
      const w = scene.grid.cellToWorld(p.col, p.row)
      const d = (w.x - pos.x) ** 2 + (w.z - pos.z) ** 2
      if (d < bestD) {
        bestD = d
        best = { col: p.col, row: p.row }
      }
    }
  } else if (cfg.tile) {
    const g = store.map.grid
    for (let r = 0; r < g.length; r++) {
      for (let c = 0; c < g[r].length; c++) {
        if (g[r][c] !== cfg.tile) continue
        const w = scene.grid.cellToWorld(c, r)
        const d = (w.x - pos.x) ** 2 + (w.z - pos.z) ** 2
        if (d < bestD) {
          bestD = d
          best = { col: c, row: r }
        }
      }
    }
  }
  return best
}

// Run the full interaction ritual: walk to feature -> action animation ->
// celebratory hop+icon -> real backend interaction (event flow, stats).
function runInteraction(templateId) {
  if (!scene) {
    finishTask()
    return
  }
  const cfg = TEMPLATE_TARGETS[templateId]
  if (!cfg) {
    finishTask()
    complete(templateId)
    return
  }
  const after = () => {
    scene.reactPrimary(cfg.reaction) // jump + emoji NOW
    finishTask()
    complete(templateId, { silent: true }) // backend + event flow, no double-react
  }
  const cell = findNearestTarget(cfg)
  let sent = false
  if (cell) sent = scene.sendPetTo(cell, cfg.action, after)
  if (!sent) {
    // No matching feature on the map (or unreachable) — perform in place.
    scene.primaryActor.performAction(cfg.action, after)
  }
}

onMounted(() => {
  scene = new PetScene(canvas.value, store.map)
  scene.setEditMode(store.editMode)
  scene.start()
  if (store.pet) scene.setPetStats(store.pet)
  if (store.crops && store.crops.length) scene.setCrops(store.crops)
  // One-time 3D thumbnails for the build/farm palettes.
  const refreshThumbs = () => {
    try {
      setThumbnails(scene.generateThumbnails())
    } catch (e) {
      /* thumbnails are a nicety; ignore failures */
    }
  }
  refreshThumbs()
  // When GLB building models finish loading, swap placeholders for the real
  // models and regenerate their thumbnails.
  scene.onModelsLoaded = () => {
    if (!scene) return
    scene.setMap(store.map)
    refreshThumbs()
  }
  window.addEventListener('resize', onResize)
  canvas.value.addEventListener('pointerdown', onPointerDown)
  canvas.value.addEventListener('pointerup', onPointerUp)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  if (canvas.value) {
    canvas.value.removeEventListener('pointerdown', onPointerDown)
    canvas.value.removeEventListener('pointerup', onPointerUp)
  }
  scene && scene.dispose()
  scene = null
})

watch(
  () => store.mapVersion,
  () => {
    if (scene && store.map) scene.setMap(store.map)
  }
)
watch(
  () => store.editMode,
  (on) => scene && scene.setEditMode(on)
)
watch(
  () => store.recenterN,
  () => scene && scene.recenter()
)
watch(
  () => store.cropsVersion,
  () => scene && scene.setCrops(store.crops)
)
watch(
  () => store.farmMode,
  (on) => scene && scene.setPanMode(on) // pan-style controls while farming (pet keeps roaming)
)
watch(
  () => store.pet,
  (pet) => {
    if (scene && pet) scene.setPetStats(pet)
  },
  { deep: true }
)
// Celebratory reaction signal (e.g. missed -> sad).
watch(
  () => store.petReaction.n,
  () => {
    const kind = store.petReaction.kind
    if (scene && kind) scene.reactPrimary(kind)
  }
)
// Begin a "go to feature + perform action + react" ritual.
watch(
  () => store.pendingTask.n,
  () => {
    const tid = store.pendingTask.templateId
    if (tid) runInteraction(tid)
  }
)
</script>

<template>
  <canvas ref="canvas" class="pet-canvas" :class="{ editing: store.editMode }"></canvas>
</template>

<style scoped>
.pet-canvas {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}
.pet-canvas.editing {
  cursor: crosshair;
}
</style>
