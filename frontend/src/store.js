import { reactive, readonly } from 'vue'
import * as api from './api/petgame.js'
import { BackendUnreachable } from './api/petgame.js'
import { demo } from './api/demoEngine.js'
import { mapDef } from './three/mapData.js'
import { CROPS, cropStage } from './three/farmData.js'

const cloneDefaultMap = () => JSON.parse(JSON.stringify(mapDef))
const hexToInt = (hex) => parseInt(String(hex).replace('#', ''), 16)

// --- JWT auto-refresh -------------------------------------------------------
// Keycloak's access_token expires in ~5 min by default. We schedule a refresh
// ~30s before expiry and rotate both tokens; if refresh ever fails (the
// refresh_token itself expired), we surface a friendly logout.
let refreshTimer = null

function cancelRefresh() {
  if (refreshTimer) {
    clearTimeout(refreshTimer)
    refreshTimer = null
  }
}

function scheduleRefresh(expiresInSec) {
  cancelRefresh()
  if (state.mode !== 'live' || !state.refreshToken) return
  const ms = Math.max(10, (expiresInSec || 60) - 30) * 1000
  refreshTimer = setTimeout(doRefresh, ms)
}

async function doRefresh() {
  if (state.mode !== 'live' || !state.refreshToken) return
  try {
    const data = await api.refreshAccessToken(state.refreshToken)
    state.token = data.access_token
    state.refreshToken = data.refresh_token || state.refreshToken
    scheduleRefresh(data.expires_in)
  } catch (e) {
    cancelRefresh()
    state.error = 'Session expired — please log in again.'
    logout()
  }
}

// Map an interaction template to the pet's reaction animation.
const REACTION_BY_TEMPLATE = {
  drink_water: 'water',
  exercise_15m: 'exercise',
  study_25m: 'study',
  play_10m: 'play'
}

function signalReaction(kind) {
  state.petReaction = { kind, n: state.petReaction.n + 1 }
}

// Pipeline stages an event passes through, used by the flow visualization.
export const STAGES = ['interaction-service', 'rabbitmq', 'pet-service']

const state = reactive({
  token: null,
  refreshToken: null,
  username: null,
  mode: null, // 'live' | 'demo'
  pet: null,
  loading: false,
  error: null,
  busy: false, // an interaction is currently flowing through the pipeline
  events: [], // recent event-flow records (newest first)
  flow: null, // the event currently animating through the pipeline
  petReaction: { kind: null, n: 0 }, // signal for the pet's celebratory reaction
  pendingTask: { templateId: null, n: 0 }, // signal for "go to map feature + perform action"
  taskActive: false,
  recenterN: 0, // bumped when the user clicks "Recenter view"

  // World map + editor
  map: null,
  mapVersion: 0, // bumped on every edit so the scene re-renders
  mapDirty: false,
  mapSaving: false,
  editMode: false,
  editTool: { kind: 'prop', value: 'house', w: 1, h: 1, recolor: true },
  editColor: '#7fb0e0',
  editRot: 0,

  // Farming
  crops: [], // [{ col, row, type, plantedAt }]
  cropsVersion: 0,
  farmMode: false,
  farmSeed: 'carrot',

  // 3D-rendered palette thumbnails, keyed 'prop:house' / 'tile:g' / 'crop:carrot'
  thumbnails: {}
})

export function setThumbnails(map) {
  state.thumbnails = map
}

function pushEvent(record) {
  state.events.unshift(record)
  if (state.events.length > 8) state.events.pop()
}

// Drive the staged pipeline animation. Returns when the packet "arrives".
function runFlow(event) {
  return new Promise((resolve) => {
    state.flow = { event, stage: 0, done: false }
    const STEP = 650
    let i = 0
    const tick = () => {
      i += 1
      if (i < STAGES.length) {
        state.flow = { event, stage: i, done: false }
        setTimeout(tick, STEP)
      } else {
        state.flow = { event, stage: STAGES.length - 1, done: true }
        setTimeout(() => {
          state.flow = null
          resolve()
        }, STEP)
      }
    }
    setTimeout(tick, STEP)
  })
}

async function applyResult(result, fallbackEvent) {
  const event = (result && result.published_event) || fallbackEvent
  if (event) {
    pushEvent({
      ...event,
      at: Date.now(),
      mode: state.mode
    })
    await runFlow(event)
  }
  // pet-service has now "consumed" the event; refresh state.
  await refreshPet()
}

async function refreshPet() {
  if (state.mode === 'demo') {
    state.pet = demo.getPet(state.username)
    return
  }
  state.pet = await api.getPet(state.token)
}

export async function doLogin(username, password) {
  state.loading = true
  state.error = null
  try {
    let token
    let expiresIn = null
    try {
      const data = await api.login(username, password)
      token = data.access_token
      state.refreshToken = data.refresh_token || null
      expiresIn = data.expires_in
      state.mode = 'live'
    } catch (e) {
      if (e instanceof BackendUnreachable) {
        // Services down -> seamless demo fallback.
        token = demo.login(username)
        state.mode = 'demo'
      } else {
        throw e // real auth error (bad credentials) - surface it
      }
    }
    state.token = token
    state.username = username
    if (state.mode === 'live') scheduleRefresh(expiresIn)
    await refreshPet()
    await loadMap()
    await loadFarm()
    return true
  } catch (e) {
    state.error = e.message
    return false
  } finally {
    state.loading = false
  }
}

export async function complete(templateId, opts = {}) {
  if (state.busy) return
  state.busy = true
  state.error = null
  try {
    let result
    if (state.mode === 'demo') {
      result = demo.complete(state.username, templateId)
    } else {
      result = await api.completeInteraction(state.token, templateId)
    }
    await applyResult(result)
    if (!opts.silent) signalReaction(REACTION_BY_TEMPLATE[templateId] || 'happy')
  } catch (e) {
    state.error = e.message
  } finally {
    state.busy = false
  }
}

// Begin a full "ritual": pet walks to a map feature, plays an action, then the
// celebratory hop+icon fires. The actual orchestration lives in PetCanvas
// because it needs scene access; this just publishes the signal.
export function interact(templateId) {
  if (state.busy || state.taskActive) return
  state.taskActive = true
  state.pendingTask = { templateId, n: state.pendingTask.n + 1 }
}

export function finishTask() {
  state.taskActive = false
}

export async function triggerMissed() {
  if (state.busy) return
  state.busy = true
  state.error = null
  try {
    let result
    if (state.mode === 'demo') {
      result = demo.checkMissed(state.username)
    } else {
      result = await api.checkMissed(state.token)
    }
    if (result && result.missed === false) {
      // Real backend says nothing was missed today; show an informational note.
      pushEvent({
        event_type: 'interaction.ok',
        user_id: state.username,
        day_key: result.day_key,
        at: Date.now(),
        mode: state.mode,
        note: 'already completed today'
      })
    } else {
      await applyResult(result, result && result.published_event)
      signalReaction('sad')
    }
  } catch (e) {
    state.error = e.message
  } finally {
    state.busy = false
  }
}

export async function refresh() {
  if (!state.token) return
  try {
    await refreshPet()
  } catch (e) {
    state.error = e.message
  }
}

// --- World map + editor -----------------------------------------------------

export async function loadMap() {
  try {
    let data = null
    if (state.mode === 'demo') {
      data = demo.getMap()
    } else {
      const resp = await api.getMap(state.token)
      data = resp && resp.data
    }
    state.map = data || cloneDefaultMap()
  } catch (e) {
    // Map service down — fall back to the default starter map.
    state.map = cloneDefaultMap()
  }
  state.mapVersion++
  state.mapDirty = false
}

export async function saveMap() {
  if (!state.map) return
  state.mapSaving = true
  state.error = null
  try {
    if (state.mode === 'demo') {
      demo.saveMap(JSON.parse(JSON.stringify(state.map)))
    } else {
      await api.saveMap(state.token, JSON.parse(JSON.stringify(state.map)))
    }
    state.mapDirty = false
  } catch (e) {
    state.error = `Save failed: ${e.message}`
  } finally {
    state.mapSaving = false
  }
}

export function toggleEdit() {
  state.editMode = !state.editMode
  if (state.editMode) state.farmMode = false
}

// --- Farming ----------------------------------------------------------------

export async function loadFarm() {
  try {
    if (state.mode === 'demo') {
      state.crops = demo.getFarm() || []
    } else {
      const r = await api.getFarm(state.token)
      state.crops = (r && r.crops) || []
    }
  } catch (e) {
    state.crops = []
  }
  state.cropsVersion++
}

async function saveFarmNow() {
  try {
    const crops = JSON.parse(JSON.stringify(state.crops))
    if (state.mode === 'demo') demo.saveFarm(crops)
    else await api.saveFarm(state.token, crops)
  } catch (e) {
    /* non-fatal: keep playing, retry on next action */
  }
}

export function toggleFarm() {
  state.farmMode = !state.farmMode
  if (state.farmMode) state.editMode = false
}

export function selectSeed(type) {
  state.farmSeed = type
}

function cropAt(col, row) {
  return state.crops.find((c) => c.col === col && c.row === row)
}

function solidAt(col, row) {
  return state.map.props.some((p) => {
    if (!p.solid) return false
    const w = p.w || 1
    const h = p.h || 1
    return col >= p.col && col < p.col + w && row >= p.row && row < p.row + h
  })
}

export function isPlantable(col, row) {
  if (!state.map) return false
  const g = state.map.grid
  if (row < 0 || row >= g.length || col < 0 || col >= g[row].length) return false
  const glyph = g[row][col]
  if (glyph !== 'g' && glyph !== 's') return false
  return !solidAt(col, row) && !cropAt(col, row)
}

export async function plantAt(col, row) {
  const def = CROPS[state.farmSeed]
  if (!def) return
  if (!isPlantable(col, row)) {
    state.error = "Can't plant there"
    return
  }
  if (!state.pet || (state.pet.coins || 0) < def.seedCost) {
    state.error = `Not enough coins for seed (need ${def.seedCost})`
    return
  }
  try {
    state.pet =
      state.mode === 'demo'
        ? demo.spendCoins(state.username, def.seedCost)
        : await api.spendCoins(state.token, def.seedCost)
  } catch (e) {
    state.error = `Couldn't buy seed: ${e.message}`
    return
  }
  state.crops.push({ col, row, type: state.farmSeed, plantedAt: Date.now() })
  state.cropsVersion++
  saveFarmNow()
}

export async function harvestAt(col, row) {
  const crop = cropAt(col, row)
  if (!crop || cropStage(crop) < 1) return false
  const def = CROPS[crop.type]
  state.crops = state.crops.filter((c) => c !== crop)
  state.cropsVersion++
  saveFarmNow()
  try {
    state.pet =
      state.mode === 'demo'
        ? demo.earnCoins(state.username, def.coins, def.xp)
        : await api.earnCoins(state.token, def.coins, def.xp)
  } catch (e) {
    state.error = `Harvest reward failed: ${e.message}`
  }
  signalReaction('happy')
  return true
}

// A click on a tile in farm mode: harvest if a ripe crop is there, else plant.
export function farmClick(col, row) {
  const crop = cropAt(col, row)
  if (crop) {
    if (cropStage(crop) >= 1) harvestAt(col, row)
    return
  }
  plantAt(col, row)
}

export function recenterView() {
  state.recenterN += 1
}

export function selectTool(tool) {
  state.editTool = { kind: 'prop', w: 1, h: 1, recolor: false, price: 0, ...tool }
}

export function setEditColor(hex) {
  state.editColor = hex
}

export function rotateTool() {
  state.editRot = (state.editRot + Math.PI / 2) % (Math.PI * 2)
}

function markEdited() {
  state.mapVersion++
  state.mapDirty = true
}

function setTile(col, row, glyph) {
  const g = state.map.grid
  if (row < 0 || row >= g.length || col < 0 || col >= g[row].length) return
  g[row] = g[row].slice(0, col) + glyph + g[row].slice(col + 1)
}

function removePropsAt(col, row) {
  const before = state.map.props.length
  state.map.props = state.map.props.filter((p) => !(p.col === col && p.row === row))
  return state.map.props.length !== before
}

export async function applyToolAt(col, row) {
  if (!state.map) return
  const t = state.editTool

  if (t.kind === 'tile') {
    setTile(col, row, t.value)
    markEdited()
    return
  }
  if (t.kind === 'erase') {
    if (!removePropsAt(col, row)) setTile(col, row, 'g')
    markEdited()
    return
  }

  // Prop placement — spend coins via pet-service (or demo).
  const price = t.price || 0
  if (price > 0) {
    if (!state.pet || (state.pet.coins || 0) < price) {
      state.error = `Not enough coins (need ${price})`
      return
    }
    try {
      const newPet =
        state.mode === 'demo'
          ? demo.spendCoins(state.username, price)
          : await api.spendCoins(state.token, price)
      state.pet = newPet
    } catch (e) {
      state.error = `Couldn't spend coins: ${e.message}`
      return
    }
  }

  removePropsAt(col, row)
  const prop = { type: t.value, col, row }
  if (t.w && t.w > 1) prop.w = t.w
  if (t.h && t.h > 1) prop.h = t.h
  if (t.scale) prop.scale = t.scale
  if (state.editRot) prop.rot = state.editRot
  if (t.recolor) prop.color = hexToInt(state.editColor)
  state.map.props.push(prop)
  markEdited()
}

export function expandGrid(side) {
  const m = state.map
  if (side === 'right') {
    m.grid = m.grid.map((r) => r + 'g')
    m.cols += 1
  } else if (side === 'left') {
    m.grid = m.grid.map((r) => 'g' + r)
    m.cols += 1
    m.props.forEach((p) => (p.col += 1))
    m.pets.forEach((p) => (p.col += 1))
  } else if (side === 'bottom') {
    m.grid.push('g'.repeat(m.cols))
    m.rows += 1
  } else if (side === 'top') {
    m.grid.unshift('g'.repeat(m.cols))
    m.rows += 1
    m.props.forEach((p) => (p.row += 1))
    m.pets.forEach((p) => (p.row += 1))
  }
  markEdited()
}

export function resetMap() {
  state.map = cloneDefaultMap()
  markEdited()
}

export function logout() {
  cancelRefresh()
  state.token = null
  state.refreshToken = null
  state.username = null
  state.mode = null
  state.pet = null
  state.events = []
  state.flow = null
  state.map = null
  state.editMode = false
  state.mapDirty = false
  state.crops = []
  state.farmMode = false
}

export const store = readonly(state)
