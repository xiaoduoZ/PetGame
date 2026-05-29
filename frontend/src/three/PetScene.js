import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mapDef, TILE_TYPES, TILE_SIZE, TILE_HEIGHT, PROP_PALETTE, TILE_PALETTE } from './mapData.js'
import { CROPS } from './farmData.js'
import PetActor from './PetActor.js'

// Building palette + proportions ported from Tiny World Builder's procedural
// houses: flat saturated colours with dark-trim zoning + clean gabled geometry
// (pitched roofs, framed windows, trimmed doors) — detail comes from geometry,
// not textures.
const BC = {
  wall: 0xf2dfb0, roof: 0x2a6dd1, door: 0x7a4a2e, trim: 0x5c3818,
  glass: 0x3f7fd6, chimney: 0xc9c4ba, step: 0xa9a49a, knob: 0xe8c050,
  brick: 0xc4855a, stone: 0xb8b1a5
}
const BW = 0.82 // wall width
const BH = 0.55 // wall height to eaves
const BPEAK = 0.87 // ridge apex
const BT = 0.06 // roof slab thickness

// Renders a data-driven isometric tile map (looks flat, is actually 3D) and
// hosts one or more free-roaming PetActors. The map comes entirely from
// mapData.js, so it can be expanded without touching this file.
export default class PetScene {
  constructor(canvas, map) {
    this.canvas = canvas
    this.map = map || mapDef
    this.clock = new THREE.Clock()
    this.bursts = []
    this.emojis = []
    this.waters = []
    this.actors = []
    this.windmills = []
    this.lamps = []
    this.flames = []
    this.timeOfDay = 0.28 // start mid-morning
    this.dayLength = 180 // seconds per in-game day
    this._darkness = 0
    this.editMode = false
    this.panMode = false
    this.raycaster = new THREE.Raycaster()
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -TILE_HEIGHT)
    this._raf = null

    this._initRenderer()
    this._initScene()
    this._initTextures()
    this._buildLights()
    this.tileGroup = new THREE.Group()
    this.propGroup = new THREE.Group()
    this.cropGroup = new THREE.Group()
    this.crops = []
    this.scene.add(this.tileGroup, this.propGroup, this.cropGroup)
    this._buildGrid()
    this._buildTiles()
    this._buildProps()
    this._buildActors()
    this._buildAmbientParticles()
    this._initControls()
    this.resize()
    this._preloadModels()
  }

  // Load GLB building models referenced in the palette, normalize each to its
  // footprint, and cache a template to clone. Procedural builders are used as
  // a fallback until (or unless) a model loads.
  _preloadModels() {
    this._modelDefs = {}
    this._models = {}
    for (const p of PROP_PALETTE) if (p.model) this._modelDefs[p.type] = p
    const entries = Object.entries(this._modelDefs)
    if (!entries.length) return
    const loader = new GLTFLoader()
    let remaining = entries.length
    const done = () => {
      remaining--
      if (remaining === 0 && this.onModelsLoaded) this.onModelsLoaded()
    }
    for (const [type, def] of entries) {
      loader.load(
        def.model,
        (gltf) => {
          const root = gltf.scene
          const box = new THREE.Box3().setFromObject(root)
          const size = box.getSize(new THREE.Vector3())
          const center = box.getCenter(new THREE.Vector3())
          const footprint = Math.max(size.x, size.z) || 1
          const cells = Math.max(def.w || 1, def.h || 1)
          const sc = ((cells * TILE_SIZE * 0.92) / footprint) * (def.scale || 1)
          root.scale.setScalar(sc)
          root.position.set(-center.x * sc, -box.min.y * sc, -center.z * sc)
          root.traverse((o) => {
            if (o.isMesh) {
              o.castShadow = true
              o.receiveShadow = true
            }
          })
          const wrap = new THREE.Group()
          wrap.add(root)
          this._models[type] = wrap
          done()
        },
        undefined,
        (err) => {
          console.warn('[PetScene] model load failed:', def.model, err)
          done()
        }
      )
    }
  }

  _clearGroup(group) {
    for (let i = group.children.length - 1; i >= 0; i--) {
      const obj = group.children[i]
      group.remove(obj)
      obj.traverse((o) => {
        if (o.geometry) o.geometry.dispose()
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material]
          mats.forEach((m) => m.dispose())
        }
      })
    }
  }

  // Re-render tiles + props from a new/edited map, keeping lights, pets, camera.
  setMap(map) {
    this.map = map
    this._buildGrid()
    this._buildTiles()
    this._buildProps()
    for (const a of this.actors) {
      a.grid = this.grid
      if (!this.grid.isWorldWalkable(a.group.position.x, a.group.position.z)) {
        const spot = this._firstWalkable()
        if (spot) {
          a.group.position.set(spot.x, a.standY, spot.z)
          a.targetWorld = null
        }
      }
    }
  }

  _firstWalkable() {
    for (let row = 0; row < this.map.rows; row++) {
      for (let col = 0; col < this.map.cols; col++) {
        if (this.grid.isWalkable(col, row)) return this.grid.cellToWorld(col, row)
      }
    }
    return null
  }

  setEditMode(on) {
    this.editMode = on
    this._applyControlsMode()
  }

  _ndc(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect()
    return new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    )
  }

  // Returns the actor under the cursor, or null.
  pickPet(clientX, clientY) {
    this.raycaster.setFromCamera(this._ndc(clientX, clientY), this.camera)
    for (const a of this.actors) {
      if (this.raycaster.intersectObject(a.group, true).length) return a
    }
    return null
  }

  reactPrimary(kind) {
    if (this.primaryActor) this.primaryActor.react(kind)
  }

  // --- 3D palette thumbnails ----------------------------------------------

  // Render every placeable (props, tiles, crops) to a small 3D image so the
  // build/farm palettes can show real previews instead of emoji.
  generateThumbnails(size = 110) {
    const r = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true })
    r.setSize(size, size)
    r.setPixelRatio(1)
    r.setClearAlpha(0)
    const sc = new THREE.Scene()
    sc.add(new THREE.HemisphereLight(0xffffff, 0xc6d8b0, 1.25))
    const dir = new THREE.DirectionalLight(0xfff0d6, 1.5)
    dir.position.set(3, 6, 4)
    sc.add(dir)
    const cam = new THREE.PerspectiveCamera(34, 1, 0.05, 60)

    const shoot = (obj) => {
      const box = new THREE.Box3().setFromObject(obj)
      const center = box.getCenter(new THREE.Vector3())
      const sphere = box.getBoundingSphere(new THREE.Sphere())
      obj.position.sub(center)
      sc.add(obj)
      const dist = (sphere.radius / Math.sin((34 * Math.PI) / 180 / 2)) * 0.62
      cam.position.set(dist * 0.82, dist * 0.72, dist * 0.82)
      cam.lookAt(0, 0, 0)
      r.render(sc, cam)
      const url = r.domElement.toDataURL('image/png')
      sc.remove(obj)
      obj.traverse((o) => {
        if (o.geometry) o.geometry.dispose()
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material]
          mats.forEach((m) => m.dispose())
        }
      })
      return url
    }

    const out = {}
    for (const p of PROP_PALETTE) {
      const mesh = this._makeProp({ type: p.type })
      if (mesh) {
        if (p.scale) mesh.scale.setScalar(p.scale)
        out['prop:' + p.type] = shoot(mesh)
      }
    }
    for (const t of TILE_PALETTE) {
      const type = TILE_TYPES[t.glyph]
      const map = t.glyph === 'g' ? this.tex.grass : t.glyph === 'w' ? null : this.tex.dirt
      const matT = map
        ? new THREE.MeshStandardMaterial({ map, color: type.color, roughness: 0.96 })
        : this._flat(type.color)
      const tile = new THREE.Mesh(new THREE.BoxGeometry(1, 0.34, 1), matT)
      out['tile:' + t.glyph] = shoot(tile)
    }
    for (const key of Object.keys(CROPS)) {
      const obj = this._cropMesh({ type: key, plantedAt: 0 })
      obj.leaf.scale.set(1, 1, 1)
      obj.fruit.visible = true
      out['crop:' + key] = shoot(obj.group)
    }

    r.dispose()
    return out
  }

  // --- Crops ---------------------------------------------------------------

  setCrops(crops) {
    this._clearGroup(this.cropGroup)
    this.crops = []
    for (const c of crops) {
      const obj = this._cropMesh(c)
      const w = this.grid.cellToWorld(c.col, c.row)
      obj.group.position.set(w.x, this.grid.tileTopY, w.z)
      this.cropGroup.add(obj.group)
      this.crops.push(obj)
    }
  }

  _cropMesh(crop) {
    const def = CROPS[crop.type] || CROPS.carrot
    const g = new THREE.Group()
    const dirt = new THREE.Mesh(this._rbox(0.62, 0.08, 0.62, 0.04), this._flat(0x6f4a2e))
    dirt.position.y = 0.02
    dirt.receiveShadow = true
    g.add(dirt)

    const leaf = new THREE.Group()
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2
      const blade = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.34, 5), this._flat(def.leaf))
      blade.position.set(Math.cos(a) * 0.1, 0.2, Math.sin(a) * 0.1)
      blade.rotation.z = (Math.random() - 0.5) * 0.3
      blade.castShadow = true
      leaf.add(blade)
    }
    leaf.position.y = 0.06
    g.add(leaf)

    const fruit = new THREE.Group()
    if (crop.type === 'pumpkin') {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), this._flat(def.fruit))
      p.scale.set(1.2, 0.9, 1.2)
      p.position.y = 0.18
      fruit.add(p)
    } else if (crop.type === 'wheat') {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), this._flat(def.fruit))
        head.position.set(Math.cos(a) * 0.1, 0.44, Math.sin(a) * 0.1)
        fruit.add(head)
      }
    } else {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.5
        const f = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), this._flat(def.fruit))
        f.position.set(Math.cos(a) * 0.12, 0.18, Math.sin(a) * 0.12)
        fruit.add(f)
      }
    }
    fruit.visible = false
    g.add(fruit)
    return { group: g, leaf, fruit, plantedAt: crop.plantedAt, growSec: def.growSec }
  }

  _updateCrops(nowMs) {
    for (const cr of this.crops) {
      const stage = Math.min(1, (nowMs - cr.plantedAt) / 1000 / cr.growSec)
      const sc = 0.15 + stage * 0.85
      cr.leaf.scale.set(sc, sc, sc)
      if (stage >= 1) {
        cr.fruit.visible = true
        cr.fruit.position.y = Math.abs(Math.sin(nowMs * 0.003)) * 0.05 // ripe bob
      } else {
        cr.fruit.visible = false
      }
    }
  }

  // Breadth-first path of cells from start to goal over walkable tiles.
  findPath(start, goal) {
    if (!this.grid.isWalkable(goal.col, goal.row)) return null
    const key = (c, r) => `${c},${r}`
    const prev = { [key(start.col, start.row)]: null }
    const queue = [start]
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ]
    while (queue.length) {
      const cur = queue.shift()
      if (cur.col === goal.col && cur.row === goal.row) {
        const path = []
        let node = cur
        while (node) {
          path.unshift(node)
          node = prev[key(node.col, node.row)]
        }
        return path
      }
      for (const [dc, dr] of dirs) {
        const nc = cur.col + dc
        const nr = cur.row + dr
        const k = key(nc, nr)
        if (this.grid.isWalkable(nc, nr) && !(k in prev)) {
          prev[k] = cur
          queue.push({ col: nc, row: nr })
        }
      }
    }
    return null
  }

  // Send the pet to a cell. For 'drink', it walks to the water's edge, faces it,
  // plays the drink action, then calls onComplete (which fires the interaction).
  sendPetTo(cell, action, onComplete) {
    const a = this.primaryActor
    if (!a) return false
    const start = this.grid.worldToCell(a.group.position.x, a.group.position.z)
    let goal = cell
    let faceWorld = null

    if (!this.grid.isWalkable(cell.col, cell.row)) {
      // Target tile itself isn't walkable (e.g. water) — stop at its nearest edge.
      const dirs = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
      ]
      let best = null
      let bestD = Infinity
      for (const [dc, dr] of dirs) {
        const nc = cell.col + dc
        const nr = cell.row + dr
        if (!this.grid.isWalkable(nc, nr)) continue
        const d = Math.abs(nc - start.col) + Math.abs(nr - start.row)
        if (d < bestD) {
          bestD = d
          best = { col: nc, row: nr }
        }
      }
      if (!best) return false
      goal = best
      const w = this.grid.cellToWorld(cell.col, cell.row)
      // Water surface y for drink, so splash particles emit from the water itself.
      const y = action === 'drink' ? TILE_HEIGHT * 0.7 : 0
      faceWorld = new THREE.Vector3(w.x, y, w.z)
    }

    const path = this.findPath(start, goal)
    if (!path) return false
    const smoothed = this._smoothPath(path)
    const points = smoothed.map((c) => this.grid.cellToWorld(c.col, c.row))
    // Step the final point partway toward the target so the pet stands at the
    // water's edge / right next to the prop, instead of in the middle of the
    // adjacent tile. Makes it look like it's interacting with the feature.
    if (faceWorld && points.length) {
      const last = points[points.length - 1]
      points[points.length - 1] = {
        x: last.x + (faceWorld.x - last.x) * 0.45,
        z: last.z + (faceWorld.z - last.z) * 0.45
      }
    }
    a.goTo(points, faceWorld, action, onComplete)
    return true
  }

  // String-pulling: drop any waypoint that can be reached by a straight line
  // from an earlier one, so the pet walks diagonals instead of axis-only steps.
  _smoothPath(cells) {
    if (cells.length <= 2) return cells
    const out = [cells[0]]
    let i = 0
    while (i < cells.length - 1) {
      let j = cells.length - 1
      while (j > i + 1) {
        const a = this.grid.cellToWorld(cells[i].col, cells[i].row)
        const b = this.grid.cellToWorld(cells[j].col, cells[j].row)
        if (this._losClear(a.x, a.z, b.x, b.z)) break
        j--
      }
      out.push(cells[j])
      i = j
    }
    return out
  }

  _losClear(x0, z0, x1, z1) {
    const len = Math.hypot(x1 - x0, z1 - z0)
    const steps = Math.max(1, Math.ceil(len / 0.2))
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      if (!this.grid.isWorldWalkable(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) return false
    }
    return true
  }

  // Screen point -> { col, row } on the map, or null if outside.
  pickCell(clientX, clientY) {
    this.raycaster.setFromCamera(this._ndc(clientX, clientY), this.camera)
    const pt = new THREE.Vector3()
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, pt)) return null
    const offX = ((this.map.cols - 1) / 2) * TILE_SIZE
    const offZ = ((this.map.rows - 1) / 2) * TILE_SIZE
    const col = Math.round((pt.x + offX) / TILE_SIZE)
    const row = Math.round((pt.z + offZ) / TILE_SIZE)
    if (col < 0 || row < 0 || col >= this.map.cols || row >= this.map.rows) return null
    return { col, row }
  }

  _initControls() {
    // Drag to orbit, scroll/pinch to zoom, right-drag (or left-drag in build
    // mode) to pan across the map.
    const controls = new OrbitControls(this.camera, this.renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.enablePan = true
    controls.screenSpacePanning = true
    controls.panSpeed = 0.9
    controls.rotateSpeed = 0.7
    controls.target.set(0, 0.4, 0)
    controls.minPolarAngle = THREE.MathUtils.degToRad(20)
    controls.maxPolarAngle = THREE.MathUtils.degToRad(82)
    controls.minDistance = 12
    controls.maxDistance = 36
    controls.update()
    this.controls = controls
    this._applyControlsMode()
  }

  // Mouse / touch mapping depends on the mode: in build mode the user mostly
  // wants to pan around to place things; in play mode they mostly want to
  // orbit to see the pet from different angles.
  setPanMode(on) {
    this.panMode = on
    this._applyControlsMode()
  }

  _applyControlsMode() {
    if (!this.controls) return
    if (this.editMode || this.panMode) {
      this.controls.mouseButtons.LEFT = THREE.MOUSE.PAN
      this.controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE
      this.controls.touches.ONE = THREE.TOUCH.PAN
    } else {
      this.controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE
      this.controls.mouseButtons.RIGHT = THREE.MOUSE.PAN
      this.controls.touches.ONE = THREE.TOUCH.ROTATE
    }
  }

  // Snap the camera + target back to the default home view.
  recenter() {
    if (!this.controls) return
    this.controls.target.set(0, 0.4, 0)
    this.camera.position.set(14, 11, 14)
    this.controls.update()
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setClearAlpha(0)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
  }

  _initScene() {
    this.scene = new THREE.Scene()
    // Solid sky colour so the day/night cycle can lerp it.
    this.scene.background = new THREE.Color(0x9fd9f2)
    this.scene.fog = new THREE.Fog(0xfbe6cf, 24, 60)

    // Narrow-FOV perspective: keeps the "flat diorama" feel while still showing
    // natural near-bigger / far-smaller foreshortening as you orbit.
    this.camera = new THREE.PerspectiveCamera(
      35,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    )
    this.camera.position.set(14, 11, 14)
    this.camera.lookAt(0, 0, 0)
  }

  _buildLights() {
    // Held as fields so the day/night cycle can retune them per frame.
    this.hemi = new THREE.HemisphereLight(0xfff6e6, 0xc6e6cf, 1.25)
    this.scene.add(this.hemi)

    this.sun = new THREE.DirectionalLight(0xfff0d6, 1.05)
    this.sun.position.set(8, 14, 6)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    this.sun.shadow.radius = 4
    const c = this.sun.shadow.camera
    c.near = 1
    c.far = 44
    c.left = -10
    c.right = 10
    c.top = 10
    c.bottom = -10
    this.sun.shadow.bias = -0.0004
    this.scene.add(this.sun)

    this.fill = new THREE.DirectionalLight(0xdfe9ff, 0.35)
    this.fill.position.set(-7, 5, -8)
    this.scene.add(this.fill)
  }

  // --- Day / night ---------------------------------------------------------

  // Keyframes around the day: t in [0,1).
  static DAY_KEYS = [
    { t: 0.00, sky: 0x172238, sun: 0x6d80a8, sunI: 0.15, hSky: 0x2a3a55, hGround: 0x2a3340, fog: 0x1f2a3a },
    { t: 0.22, sky: 0xffc89a, sun: 0xffae70, sunI: 0.9,  hSky: 0xffe8c8, hGround: 0xd0d8a8, fog: 0xffd9a8 },
    { t: 0.50, sky: 0x9fd9f2, sun: 0xfff0d6, sunI: 1.4,  hSky: 0xfff6e6, hGround: 0xc6e6cf, fog: 0xfbe6cf },
    { t: 0.78, sky: 0xff9e6f, sun: 0xff7a4a, sunI: 0.9,  hSky: 0xffc0a0, hGround: 0xb89880, fog: 0xff9e6f },
    { t: 1.00, sky: 0x172238, sun: 0x6d80a8, sunI: 0.15, hSky: 0x2a3a55, hGround: 0x2a3340, fog: 0x1f2a3a }
  ]

  _updateDayNight(dt) {
    this.timeOfDay = (this.timeOfDay + dt / this.dayLength) % 1
    const keys = PetScene.DAY_KEYS
    let from = keys[0], to = keys[0], u = 0
    for (let i = 0; i < keys.length - 1; i++) {
      if (this.timeOfDay >= keys[i].t && this.timeOfDay < keys[i + 1].t) {
        from = keys[i]
        to = keys[i + 1]
        u = (this.timeOfDay - from.t) / (to.t - from.t)
        break
      }
    }
    if (!this._tcA) {
      this._tcA = new THREE.Color()
      this._tcB = new THREE.Color()
    }
    const lerpC = (out, a, b) => out.copy(this._tcA.setHex(a)).lerp(this._tcB.setHex(b), u)
    lerpC(this.scene.background, from.sky, to.sky)
    lerpC(this.sun.color, from.sun, to.sun)
    lerpC(this.hemi.color, from.hSky, to.hSky)
    lerpC(this.hemi.groundColor, from.hGround, to.hGround)
    lerpC(this.scene.fog.color, from.fog, to.fog)
    this.sun.intensity = from.sunI * (1 - u) + to.sunI * u

    // Sun arcs from east (sunrise) up through south to west.
    const a = (this.timeOfDay - 0.25) * Math.PI * 2
    this.sun.position.set(Math.cos(a) * 12, Math.max(2, Math.sin(a) * 14), Math.sin(a * 0.3) * 6 + 6)

    // Darkness: 1 at deep night, 0 at full day. Drives lamps + isNight().
    const sunY = Math.sin(a)
    this._darkness = THREE.MathUtils.clamp(-sunY * 1.6 + 0.15, 0, 1)
    for (const lamp of this.lamps) {
      if (lamp.mat) lamp.mat.emissiveIntensity = THREE.MathUtils.lerp(0.05, 1.5, this._darkness)
      lamp.light.intensity = THREE.MathUtils.lerp(lamp.dayI ?? 0, lamp.nightI ?? 0.9, this._darkness)
    }
  }

  isNight() {
    return this._darkness > 0.55
  }

  // Smooth-shaded by default for a softer look; pass { flat:true } for facets.
  _flat(color, opts = {}) {
    const { flat, ...rest } = opts
    return new THREE.MeshStandardMaterial({
      color,
      flatShading: !!flat,
      roughness: rest.roughness ?? 0.92,
      ...rest
    })
  }

  _rbox(w, h, d, r = 0.05) {
    return new RoundedBoxGeometry(w, h, d, 4, r)
  }

  // Tintable canvas textures (white-based, so material.color tints them) —
  // the trick borrowed from Tiny World Builder for surface detail without
  // extra geometry: shingled roofs, timber siding, stone, planks.
  _initTextures() {
    const make = (draw, size = 128) => {
      const cv = document.createElement('canvas')
      cv.width = cv.height = size
      draw(cv.getContext('2d'), size)
      const t = new THREE.CanvasTexture(cv)
      t.anisotropy = 4
      return t
    }
    this.tex = {
      // Roof shingles: rows of tiles with strong grout + highlight + seams.
      shingle: make((ctx, s) => {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, s, s)
        const rows = 7
        const h = s / rows
        for (let i = 0; i < rows; i++) {
          const y = i * h
          ctx.fillStyle = i % 2 ? '#e2e2e2' : '#ffffff'
          ctx.fillRect(0, y, s, h)
          ctx.fillStyle = 'rgba(0,0,0,0.34)' // shadow groove between rows
          ctx.fillRect(0, y, s, 3)
          ctx.fillStyle = 'rgba(255,255,255,0.65)'
          ctx.fillRect(0, y + 3, s, 1)
          ctx.fillStyle = 'rgba(0,0,0,0.18)' // staggered shingle seams
          for (let x = (i % 2 ? h / 2 : 0); x < s; x += h) ctx.fillRect(x, y + 3, 2, h - 3)
        }
      }),
      // Horizontal clapboard siding — bold board grooves.
      siding: make((ctx, s) => {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, s, s)
        const h = 13
        let n = 0
        for (let y = 0; y < s; y += h, n++) {
          ctx.fillStyle = n % 2 ? '#e6e6e6' : '#ffffff'
          ctx.fillRect(0, y, s, h)
          ctx.fillStyle = 'rgba(0,0,0,0.30)' // groove shadow
          ctx.fillRect(0, y + h - 2, s, 2)
          ctx.fillStyle = 'rgba(255,255,255,0.65)' // board highlight
          ctx.fillRect(0, y, s, 1)
        }
      }),
      // Vertical wood planks for posts/beams/doors.
      plank: make((ctx, s) => {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, s, s)
        for (let x = 0; x < s; x += 16) {
          ctx.fillStyle = 'rgba(0,0,0,0.12)'
          ctx.fillRect(x, 0, 1.5, s)
          ctx.fillStyle = `rgba(0,0,0,${0.04 + Math.random() * 0.05})`
          ctx.fillRect(x + 4 + Math.random() * 6, 0, 1, s)
        }
      }),
      // Subtle grass — speckles + tiny blades (textured ground feels softer).
      grass: make((ctx, s) => {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, s, s)
        for (let i = 0; i < 150; i++) {
          const x = Math.random() * s
          const y = Math.random() * s
          ctx.fillStyle = `rgba(0,0,0,${0.03 + Math.random() * 0.05})`
          ctx.fillRect(x, y, 2, 2 + Math.random() * 3)
        }
        for (let i = 0; i < 30; i++) {
          const x = Math.random() * s
          const y = Math.random() * s
          ctx.fillStyle = 'rgba(255,255,255,0.5)'
          ctx.fillRect(x, y, 1, 3)
        }
      }),
      // Speckled dirt for paths / soil.
      dirt: make((ctx, s) => {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, s, s)
        for (let i = 0; i < 110; i++) {
          const x = Math.random() * s
          const y = Math.random() * s
          ctx.fillStyle = `rgba(0,0,0,${0.04 + Math.random() * 0.07})`
          ctx.beginPath()
          ctx.arc(x, y, 1 + Math.random() * 2.4, 0, Math.PI * 2)
          ctx.fill()
        }
      }),
      // Mortared stone — visible courses + staggered blocks.
      stone: make((ctx, s) => {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, s, s)
        const rh = 22
        let row = 0
        for (let y = 0; y < s; y += rh, row++) {
          ctx.fillStyle = 'rgba(0,0,0,0.22)' // horizontal mortar course
          ctx.fillRect(0, y, s, 2.5)
          const off = row % 2 ? rh : 0
          for (let x = off; x < s; x += rh * 2) {
            ctx.fillStyle = 'rgba(0,0,0,0.22)' // vertical mortar (staggered)
            ctx.fillRect(x, y, 2.5, rh)
          }
        }
        for (let i = 0; i < 40; i++) {
          ctx.fillStyle = `rgba(0,0,0,${0.04 + Math.random() * 0.06})`
          ctx.beginPath()
          ctx.arc(Math.random() * s, Math.random() * s, 2 + Math.random() * 4, 0, Math.PI * 2)
          ctx.fill()
        }
      })
    }
  }

  _roofMat(color) {
    return new THREE.MeshStandardMaterial({ map: this.tex.shingle, color, roughness: 0.8 })
  }
  _wallMat(color) {
    return new THREE.MeshStandardMaterial({ map: this.tex.siding, color, roughness: 0.9 })
  }
  _plankMat(color) {
    return new THREE.MeshStandardMaterial({ map: this.tex.plank, color, roughness: 0.8 })
  }
  _stoneMat(color) {
    return new THREE.MeshStandardMaterial({ map: this.tex.stone, color, roughness: 0.95 })
  }

  // --- Grid / walkability ---------------------------------------------------

  _buildGrid() {
    const { cols, rows, grid, props } = this.map
    this.cols = cols
    this.rows = rows
    const offX = ((cols - 1) / 2) * TILE_SIZE
    const offZ = ((rows - 1) / 2) * TILE_SIZE

    const solid = new Set()
    for (const p of props) {
      if (!p.solid) continue
      const pw = p.w || 1
      const ph = p.h || 1
      for (let dc = 0; dc < pw; dc++) {
        for (let dr = 0; dr < ph; dr++) solid.add(`${p.col + dc},${p.row + dr}`)
      }
    }

    const isWalkable = (col, row) => {
      if (col < 0 || row < 0 || col >= cols || row >= rows) return false
      const type = TILE_TYPES[grid[row][col]]
      if (!type || !type.walkable) return false
      return !solid.has(`${col},${row}`)
    }

    this.grid = {
      tileTopY: TILE_HEIGHT,
      cellToWorld: (col, row) => ({
        x: col * TILE_SIZE - offX,
        z: row * TILE_SIZE - offZ
      }),
      isWalkable,
      // Free-roam helpers: convert a world point to its cell and test it.
      worldToCell: (x, z) => ({
        col: Math.round((x + offX) / TILE_SIZE),
        row: Math.round((z + offZ) / TILE_SIZE)
      }),
      isWorldWalkable: (x, z) => {
        const col = Math.round((x + offX) / TILE_SIZE)
        const row = Math.round((z + offZ) / TILE_SIZE)
        return isWalkable(col, row)
      },
      // Outer bounds of tile centers, so wandering targets stay on the map.
      minWorld: { x: -offX, z: -offZ },
      maxWorld: { x: (cols - 1) * TILE_SIZE - offX, z: (rows - 1) * TILE_SIZE - offZ }
    }
  }

  _buildTiles() {
    this._clearGroup(this.tileGroup)
    this.waters = []
    const { cols, rows, grid } = this.map
    const root = this.tileGroup
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const glyph = grid[row][col]
        const type = TILE_TYPES[glyph] || TILE_TYPES.g
        const w = this.grid.cellToWorld(col, row)
        const isWater = glyph === 'w'

        const h = isWater ? TILE_HEIGHT * 0.7 : TILE_HEIGHT
        const geo = new THREE.BoxGeometry(TILE_SIZE, h, TILE_SIZE)
        let mat
        if (isWater) {
          mat = new THREE.MeshStandardMaterial({
            color: type.color, transparent: true, opacity: 0.85, roughness: 0.3, metalness: 0.1
          })
        } else {
          const cc = new THREE.Color(type.color)
          cc.offsetHSL(0, 0, (Math.random() - 0.5) * 0.05)
          const map = glyph === 'g' ? this.tex.grass : this.tex.dirt
          mat = new THREE.MeshStandardMaterial({ map, color: cc.getHex(), roughness: 0.96 })
        }
        const tile = new THREE.Mesh(geo, mat)
        tile.position.set(w.x, h / 2, w.z)
        tile.receiveShadow = true
        if (!isWater) tile.castShadow = true
        root.add(tile)
        if (isWater) this.waters.push(tile)
      }
    }
  }

  _buildProps() {
    this._clearGroup(this.propGroup)
    this.windmills = []
    this.lamps = []
    this.flames = []
    for (const p of this.map.props) {
      const g = this._makeProp(p)
      if (!g) continue
      // Center the prop over its (possibly multi-cell) footprint.
      const pw = p.w || 1
      const ph = p.h || 1
      const w = this.grid.cellToWorld(p.col + (pw - 1) / 2, p.row + (ph - 1) / 2)
      g.position.set(w.x, this.grid.tileTopY, w.z)
      // Model props are pre-normalized to their footprint; only procedural
      // props use the stored scale.
      if (p.scale && !(this._modelDefs && this._modelDefs[p.type])) g.scale.setScalar(p.scale)
      if (p.rot != null) g.rotation.y = p.rot
      this.propGroup.add(g)
    }
  }

  _makeProp(p) {
    // GLB-model props: clone the loaded template, or a placeholder while loading.
    if (this._modelDefs && this._modelDefs[p.type]) {
      const tmpl = this._models[p.type]
      if (tmpl) return tmpl.clone(true)
      const ph = new THREE.Mesh(this._rbox(0.6, 0.6, 0.6, 0.08), this._flat(0xd8cdb0))
      ph.position.y = 0.3
      return ph
    }
    switch (p.type) {
      case 'manor':
        return this._manor(p.color)
      case 'house':
        return this._house(p.color ?? 0x7fb0e0)
      case 'cottage':
        return this._cottage(p.color ?? 0xe39a86)
      case 'tower':
        return this._tower(p.color)
      case 'windmill':
        return this._windmill()
      case 'tree':
        return this._tree()
      case 'roundtree':
        return this._roundtree()
      case 'lamppost':
        return this._lamppost()
      case 'crops':
        return this._crops()
      case 'bush':
        return this._bush()
      case 'flower':
        return this._flower(p.color ?? 0xff7aa0)
      case 'mushroom':
        return this._mushroom()
      case 'bridge':
        return this._bridge()
      case 'haybale':
        return this._haybale()
      case 'bench':
        return this._bench()
      case 'flowerbed':
        return this._flowerbed()
      case 'signpost':
        return this._signpost()
      case 'fountain':
        return this._fountain()
      case 'well':
        return this._well()
      case 'marketstall':
        return this._marketStall()
      case 'campfire':
        return this._campfire()
      case 'statue':
        return this._statue()
      case 'gazebo':
        return this._gazebo()
      case 'barn':
        return this._barn(p.color)
      default:
        return null
    }
  }

  _fountain() {
    const g = new THREE.Group()
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.7, 0.22, 16), this._flat(0xd7d2c4))
    base.position.y = 0.11
    base.castShadow = true
    g.add(base)
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.07, 8, 20), this._flat(0xe6e1d4))
    rim.position.y = 0.24
    rim.rotation.x = Math.PI / 2
    g.add(rim)
    const water = new THREE.Mesh(
      new THREE.CylinderGeometry(0.54, 0.54, 0.1, 16),
      new THREE.MeshStandardMaterial({ color: 0x86cdee, transparent: true, opacity: 0.85, roughness: 0.2 })
    )
    water.position.y = 0.24
    g.add(water)
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.42, 12), this._flat(0xe6e1d4))
    pillar.position.y = 0.43
    g.add(pillar)
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.1, 0.08, 14), this._flat(0xe6e1d4))
    upper.position.y = 0.66
    g.add(upper)
    const spout = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xbfe9ff, transparent: true, opacity: 0.9 })
    )
    spout.position.y = 0.76
    g.add(spout)
    return g
  }

  _well() {
    const g = new THREE.Group()
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.5, 14), this._stoneMat(0xcfcabb))
    base.position.y = 0.25
    base.castShadow = true
    g.add(base)
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.06, 8, 18), this._flat(0xe6e1d4))
    rim.position.y = 0.5
    rim.rotation.x = Math.PI / 2
    g.add(rim)
    const water = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.34, 0.08, 14),
      new THREE.MeshStandardMaterial({ color: 0x5fa8d8, roughness: 0.2 })
    )
    water.position.y = 0.46
    g.add(water)
    for (const x of [-0.38, 0.38]) {
      const post = new THREE.Mesh(this._rbox(0.08, 0.7, 0.08, 0.02), this._flat(0x8a5a34))
      post.position.set(x, 0.85, 0)
      post.castShadow = true
      g.add(post)
    }
    const roof = this._gableRoof(0.7, 0.95, 0.32, 0xb0855a, 0.1)
    roof.position.y = 1.2
    g.add(roof)
    const beam = new THREE.Mesh(this._rbox(0.7, 0.06, 0.06, 0.02), this._flat(0x6f4a2e))
    beam.position.y = 1.12
    g.add(beam)
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.14, 10), this._flat(0x9c6f4f))
    bucket.position.set(0, 0.86, 0)
    g.add(bucket)
    return g
  }

  _marketStall() {
    const g = new THREE.Group()
    const counter = new THREE.Mesh(this._rbox(0.9, 0.4, 0.4, 0.04), this._flat(0xb0855a))
    counter.position.set(0, 0.2, 0.1)
    counter.castShadow = true
    g.add(counter)
    for (const x of [-0.42, 0.42]) {
      for (const z of [-0.3, 0.42]) {
        const post = new THREE.Mesh(this._rbox(0.06, 1.0, 0.06, 0.02), this._flat(0x8a5a34))
        post.position.set(x, 0.5, z)
        g.add(post)
      }
    }
    const awning = new THREE.Group()
    for (let i = 0; i < 5; i++) {
      const stripe = new THREE.Mesh(this._rbox(0.2, 0.04, 0.74, 0.01), this._flat(i % 2 ? 0xe0584e : 0xf6efe0))
      stripe.position.set(-0.4 + i * 0.2, 0, 0)
      awning.add(stripe)
    }
    awning.position.set(0, 1.0, 0.06)
    awning.rotation.x = -0.22
    awning.castShadow = true
    g.add(awning)
    const crateA = new THREE.Mesh(this._rbox(0.18, 0.12, 0.18, 0.02), this._flat(0x9c6f4f))
    crateA.position.set(-0.2, 0.46, 0.16)
    g.add(crateA)
    const apples = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), this._flat(0xe0584e))
    apples.position.set(-0.2, 0.57, 0.16)
    g.add(apples)
    const crateB = new THREE.Mesh(this._rbox(0.18, 0.12, 0.18, 0.02), this._flat(0x9c6f4f))
    crateB.position.set(0.2, 0.46, 0.16)
    g.add(crateB)
    const oranges = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), this._flat(0xffa94c))
    oranges.position.set(0.2, 0.57, 0.16)
    g.add(oranges)
    return g
  }

  _campfire() {
    const g = new THREE.Group()
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2
      const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.1, 0), this._flat(0xbdb6a6))
      stone.position.set(Math.cos(a) * 0.32, 0.07, Math.sin(a) * 0.32)
      stone.rotation.set(Math.random(), Math.random(), Math.random())
      g.add(stone)
    }
    for (let i = 0; i < 3; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8), this._flat(0x7a5232))
      log.rotation.z = Math.PI / 2
      log.rotation.y = (i / 3) * Math.PI
      log.position.y = 0.08
      g.add(log)
    }
    const flameMat = new THREE.MeshStandardMaterial({ color: 0xffb04a, emissive: 0xff7a1a, emissiveIntensity: 1.2, roughness: 0.4 })
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.42, 8), flameMat)
    flame.position.y = 0.3
    g.add(flame)
    const flame2 = new THREE.Mesh(
      new THREE.ConeGeometry(0.09, 0.26, 8),
      new THREE.MeshStandardMaterial({ color: 0xffe07a, emissive: 0xffd24a, emissiveIntensity: 1.4 })
    )
    flame2.position.y = 0.34
    g.add(flame2)
    const light = new THREE.PointLight(0xff9540, 0.4, 4.5, 2)
    light.position.y = 0.5
    g.add(light)
    this.flames.push({ mesh: flame, mesh2: flame2, phase: Math.random() * 9 })
    this.lamps.push({ light, dayI: 0.3, nightI: 0.8 }) // no mat -> flame stays lit by day too
    return g
  }

  _statue() {
    const g = new THREE.Group()
    const stoneC = 0xc9c0ad
    const base = new THREE.Mesh(this._rbox(0.5, 0.16, 0.5, 0.04), this._flat(0xbdb6a6))
    base.position.y = 0.08
    base.castShadow = true
    g.add(base)
    const pedestal = new THREE.Mesh(this._rbox(0.32, 0.5, 0.32, 0.04), this._flat(stoneC))
    pedestal.position.y = 0.41
    pedestal.castShadow = true
    g.add(pedestal)
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 12), this._flat(stoneC))
    body.scale.set(1, 0.9, 0.9)
    body.position.y = 0.78
    body.castShadow = true
    g.add(body)
    for (const x of [-0.1, 0.1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), this._flat(stoneC))
      ear.scale.set(0.8, 1.2, 0.5)
      ear.position.set(x, 0.96, 0)
      g.add(ear)
    }
    return g
  }

  _gazebo() {
    const g = new THREE.Group()
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.64, 0.12, 6), this._flat(0xb0855a))
    floor.position.y = 0.06
    floor.receiveShadow = true
    g.add(floor)
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      const post = new THREE.Mesh(this._rbox(0.06, 0.8, 0.06, 0.02), this._flat(0xf2ece0))
      post.position.set(Math.cos(a) * 0.52, 0.52, Math.sin(a) * 0.52)
      post.castShadow = true
      g.add(post)
    }
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.78, 0.5, 6), this._flat(0x8fce7e))
    roof.position.y = 1.15
    roof.castShadow = true
    g.add(roof)
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), this._flat(0xf2c54a))
    finial.position.y = 1.45
    g.add(finial)
    return g
  }

  _barn(roofColor) {
    const g = new THREE.Group()
    const found = new THREE.Mesh(this._rbox(1.5, 0.12, 0.82, 0.04), this._flat(0xded0b2))
    found.position.y = 0.06
    g.add(found)
    const walls = new THREE.Mesh(this._rbox(1.4, 0.62, 0.72, 0.05), this._wallMat(0xc85a4a))
    walls.position.y = 0.43
    walls.castShadow = true
    g.add(walls)
    // --- Signature: gambrel (Dutch barn) roof, ridge along the long (x) axis.
    const roof = this._gambrelRoof(0.72, 1.4, roofColor ?? 0xe8e3d6, 0.08)
    roof.position.y = 0.74
    roof.rotation.y = Math.PI / 2
    g.add(roof)
    // --- Signature: white X-braced double doors on the front. ---
    const doorMat = this._flat(0xb84e40)
    const braceMat = this._flat(0xf2ece0)
    for (const dx of [-0.22, 0.22]) {
      const leaf = new THREE.Mesh(this._rbox(0.4, 0.52, 0.05, 0.02), doorMat)
      leaf.position.set(dx, 0.31, 0.37)
      g.add(leaf)
      for (const ex of [-0.185, 0.185]) {
        const v = new THREE.Mesh(this._rbox(0.03, 0.52, 0.02, 0.01), braceMat)
        v.position.set(dx + ex, 0.31, 0.4)
        g.add(v)
      }
      for (const ey of [-0.24, 0.24]) {
        const h = new THREE.Mesh(this._rbox(0.4, 0.03, 0.02, 0.01), braceMat)
        h.position.set(dx, 0.31 + ey, 0.4)
        g.add(h)
      }
      for (const r of [0.92, -0.92]) {
        const x = new THREE.Mesh(this._rbox(0.5, 0.03, 0.02, 0.01), braceMat)
        x.position.set(dx, 0.31, 0.4)
        x.rotation.z = r
        g.add(x)
      }
    }
    // Hayloft door tucked under the ridge.
    const loft = new THREE.Mesh(this._rbox(0.2, 0.2, 0.05, 0.02), this._flat(0xf2ece0))
    loft.position.set(0, 0.78, 0.37)
    g.add(loft)
    // --- Signature: ridge cupola/vent. ---
    const cup = this._cupola(roofColor ?? 0x9c6f4f)
    cup.scale.set(0.85, 0.85, 0.85)
    cup.position.set(0, 1.1, 0)
    g.add(cup)
    return g
  }

  // Pitched (gable) roof built from a triangular prism — fancier than a pyramid.
  _gableRoof(w, d, h, color, overhang = 0.12) {
    const hw = w / 2 + overhang
    const shape = new THREE.Shape()
    shape.moveTo(-hw, 0)
    shape.lineTo(hw, 0)
    shape.lineTo(0, h)
    shape.closePath()
    const depth = d + overhang * 2
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false })
    geo.translate(0, 0, -depth / 2)
    const mesh = new THREE.Mesh(geo, this._roofMat(color))
    mesh.castShadow = true
    return mesh
  }

  // --- Building parts (ported from Tiny World Builder) --------------------

  _bmat(color, opts = {}) {
    return new THREE.MeshStandardMaterial({
      color, roughness: opts.rough ?? 0.95, metalness: 0, flatShading: !!opts.flat
    })
  }

  _b(w, h, d, x, y, z, mat) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
    m.position.set(x, y, z)
    return m
  }

  // Triangular gable end-cap (wall colour), filling the end above the eaves.
  _gable(bottomY = 0) {
    const s = new THREE.Shape()
    s.moveTo(-BW / 2, bottomY)
    s.lineTo(-BW / 2, BH)
    s.lineTo(0, BPEAK)
    s.lineTo(BW / 2, BH)
    s.lineTo(BW / 2, bottomY)
    s.closePath()
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: false, curveSegments: 1 })
    return new THREE.Mesh(geo, this._bmat(BC.wall))
  }

  // Pitched roof: two slanted slabs with tile courses + eave fascia + ridge cap.
  _pitchedRoof(wallD, roofColor, overhang = 0.2) {
    const g = new THREE.Group()
    const halfW = BW / 2
    const depth = wallD + overhang * 2
    const rise = BPEAK - BH
    const slabLen = Math.hypot(halfW, rise)
    const ang = Math.atan2(rise, halfW)
    const sa = Math.sin(ang)
    const ca = Math.cos(ang)
    const base = new THREE.Color(roofColor)
    const rmat = this._bmat(roofColor, { flat: true })
    const courseMat = this._bmat(base.clone().multiplyScalar(0.82).getHex(), { flat: true })
    const fasciaMat = this._bmat(base.clone().multiplyScalar(0.7).getHex(), { flat: true })
    const slabGeo = new THREE.BoxGeometry(slabLen, BT, depth)
    const courseGeo = new THREE.BoxGeometry(0.04, 0.03, depth * 0.99)

    // Each slab is a little group (slab + raised tile courses + eave board) so
    // the courses tilt with the roof and read as horizontal shingle rows.
    const makeSlab = (sign) => {
      const sg = new THREE.Group()
      const slab = new THREE.Mesh(slabGeo, rmat)
      slab.castShadow = true
      sg.add(slab)
      for (const u of [-0.32, -0.05, 0.22]) {
        const strip = new THREE.Mesh(courseGeo, courseMat)
        strip.position.set(u * slabLen, BT / 2 + 0.006, 0)
        sg.add(strip)
      }
      // Eave fascia board at the low (outer) edge of the slab.
      const fascia = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, depth + 0.03), fasciaMat)
      fascia.position.set(-slabLen / 2 + 0.01, -BT / 2 - 0.02, 0)
      sg.add(fascia)
      sg.rotation.z = -sign * ang
      sg.position.set(sign * (halfW / 2 + (BT / 2) * sa), (BH + BPEAK) / 2 + (BT / 2) * ca, 0)
      return sg
    }
    g.add(makeSlab(-1))
    g.add(makeSlab(1))

    const ridge = this._b(0.1, 0.07, depth + 0.04, 0, BPEAK + (BT / 2) * ca + 0.01, 0,
      this._bmat(base.clone().multiplyScalar(0.7).getHex(), { flat: true }))
    g.add(ridge)
    return g
  }

  // Hipped (pyramidal) roof for square footprints. Base at y=0, apex at y=rise.
  _hippedRoof(w, d, rise, roofColor) {
    const hw = w / 2
    const hd = d / 2
    const verts = new Float32Array([0, rise, 0, -hw, 0, -hd, hw, 0, -hd, hw, 0, hd, -hw, 0, hd])
    const idx = new Uint16Array([0, 2, 1, 0, 3, 2, 0, 4, 3, 0, 1, 4])
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3))
    geo.setIndex(new THREE.BufferAttribute(idx, 1))
    geo.computeVertexNormals()
    const m = new THREE.Mesh(geo, this._bmat(roofColor, { flat: true }))
    m.castShadow = true
    return m
  }

  // Framed window with glass + cross mullions. Origin at frame centre.
  _bwindow(orientation, size = 'large') {
    const g = new THREE.Group()
    const f = size === 'small' ? 0.2 : 0.24
    const p = size === 'small' ? 0.14 : 0.17
    const tw = this._bmat(BC.trim)
    const gl = this._bmat(BC.glass, { rough: 0.5 })
    if (orientation === 'gable') {
      g.add(this._b(f, f, 0.04, 0, 0, 0, tw))
      g.add(this._b(p, p, 0.04, 0, 0, 0.015, gl))
      g.add(this._b(p, 0.014, 0.04, 0, 0, 0.025, tw))
      g.add(this._b(0.014, p, 0.04, 0, 0, 0.025, tw))
    } else {
      g.add(this._b(0.04, f, f, 0, 0, 0, tw))
      g.add(this._b(0.04, p, p, 0.015, 0, 0, gl))
      g.add(this._b(0.04, 0.014, p, 0.025, 0, 0, tw))
      g.add(this._b(0.04, p, 0.014, 0.025, 0, 0, tw))
    }
    return g
  }

  // Door with side trims, lintel and knob. Origin at ground beneath the door.
  _bdoor(orientation) {
    const g = new THREE.Group()
    const dm = this._bmat(BC.door)
    const tw = this._bmat(BC.trim)
    const kn = this._bmat(BC.knob)
    if (orientation === 'gable') {
      g.add(this._b(0.2, 0.48, 0.04, 0, 0.24, 0, dm))
      g.add(this._b(0.04, 0.48, 0.04, -0.1, 0.24, 0.01, tw))
      g.add(this._b(0.04, 0.48, 0.04, 0.1, 0.24, 0.01, tw))
      g.add(this._b(0.24, 0.04, 0.04, 0, 0.5, 0.01, tw))
      const k = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), kn)
      k.position.set(0.08, 0.24, 0.03)
      g.add(k)
    } else {
      g.add(this._b(0.04, 0.48, 0.2, 0, 0.24, 0, dm))
      g.add(this._b(0.04, 0.48, 0.04, 0.01, 0.24, -0.1, tw))
      g.add(this._b(0.04, 0.48, 0.04, 0.01, 0.24, 0.1, tw))
      g.add(this._b(0.04, 0.04, 0.24, 0.01, 0.5, 0, tw))
      const k = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), kn)
      k.position.set(0.03, 0.24, 0.05)
      g.add(k)
    }
    return g
  }

  _bchimney() {
    return new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.6, 0.14), this._bmat(BC.chimney))
  }

  // --- Signature detail parts (one per building gives each its own look) ---

  // Roof dormer: a little gabled window box that pokes out of a roof slope.
  _dormer(roofColor) {
    const g = new THREE.Group()
    const w = 0.26
    const h = 0.18
    const d = 0.22
    const body = this._b(w, h, d, 0, h / 2, 0, this._bmat(BC.wall))
    body.castShadow = true
    g.add(body)
    const win = this._bwindow('gable', 'small')
    win.position.set(0, h * 0.55, d / 2 + 0.005)
    g.add(win)
    const rise = 0.12
    const s = new THREE.Shape()
    s.moveTo(-w / 2 - 0.03, 0)
    s.lineTo(w / 2 + 0.03, 0)
    s.lineTo(0, rise)
    s.closePath()
    const depth = d + 0.05
    const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 1 })
    geo.translate(0, 0, -depth / 2)
    const base = new THREE.Color(roofColor)
    const cap = new THREE.Mesh(geo, this._bmat(base.clone().multiplyScalar(0.85).getHex(), { flat: true }))
    cap.position.y = h
    cap.castShadow = true
    g.add(cap)
    return g
  }

  // Window flower box: a planter with little blooms (cottage charm).
  _flowerBox() {
    const g = new THREE.Group()
    const box = this._b(0.28, 0.07, 0.08, 0, 0, 0, this._bmat(BC.door))
    box.castShadow = true
    g.add(box)
    const colors = [0xff7aa0, 0xffd23f, 0xff9a4c, 0xb98aff]
    let i = 0
    for (const x of [-0.09, 0, 0.09]) {
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), this._bmat(colors[i++ % colors.length]))
      f.position.set(x, 0.06, 0)
      g.add(f)
    }
    return g
  }

  // Door awning: a small sloped canopy over the doorway, on two brackets.
  _awning(color) {
    const g = new THREE.Group()
    const canopy = this._b(0.36, 0.03, 0.18, 0, 0, 0, this._bmat(color, { flat: true }))
    canopy.rotation.x = -0.5
    canopy.castShadow = true
    g.add(canopy)
    for (const x of [-0.14, 0.14]) {
      g.add(this._b(0.02, 0.16, 0.02, x, -0.08, -0.05, this._bmat(BC.trim)))
    }
    return g
  }

  // Rooftop cupola/lantern: a small base + tented cap + finial (manor, barn).
  _cupola(roofColor) {
    const g = new THREE.Group()
    const baseMat = this._bmat(0xf3ece0)
    const base = this._b(0.2, 0.16, 0.2, 0, 0.08, 0, baseMat)
    base.castShadow = true
    g.add(base)
    for (const [dx, dz, ry] of [[0, 0.101, 0], [0, -0.101, 0], [0.101, 0, Math.PI / 2], [-0.101, 0, Math.PI / 2]]) {
      const win = this._b(0.07, 0.07, 0.02, dx, 0.09, dz, this._bmat(BC.glass, { rough: 0.5 }))
      win.rotation.y = ry
      g.add(win)
    }
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.16, 4), this._bmat(roofColor, { flat: true }))
    roof.position.y = 0.24
    roof.rotation.y = Math.PI / 4
    roof.castShadow = true
    g.add(roof)
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), this._bmat(BC.knob))
    finial.position.y = 0.34
    g.add(finial)
    return g
  }

  // Crenellations: a ring of merlons (battlement blocks) around a radius.
  _crenellations(radius, y, count, color) {
    const g = new THREE.Group()
    const mat = this._bmat(color, { flat: true })
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.13, 0.09), mat)
      m.position.set(Math.sin(a) * radius, y, Math.cos(a) * radius)
      m.rotation.y = -a
      m.castShadow = true
      g.add(m)
    }
    return g
  }

  // Gambrel (barn) roof: a 4-slope cross-section extruded along the ridge.
  // Same call shape as _gableRoof so it drops into the barn.
  _gambrelRoof(w, d, color, overhang = 0.08) {
    const hw = w / 2 + overhang
    const kneeX = w * 0.3
    const kneeY = 0.2
    const peakY = 0.42
    const s = new THREE.Shape()
    s.moveTo(-hw, 0)
    s.lineTo(-kneeX, kneeY)
    s.lineTo(0, peakY)
    s.lineTo(kneeX, kneeY)
    s.lineTo(hw, 0)
    s.closePath()
    const depth = d + overhang * 2
    const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 1 })
    geo.translate(0, 0, -depth / 2)
    const mesh = new THREE.Mesh(geo, this._bmat(color, { flat: true }))
    mesh.castShadow = true
    return mesh
  }

  // Gabled house: walls bottom at y=0, gable end-caps, pitched roof, gable-end
  // door + window + step, side windows. opts toggles each building's signature
  // detail: { dormer, chimney, flowerBox, awning }.
  _gabledHouse(wallD, roofColor, wallColor, opts = {}) {
    const g = new THREE.Group()
    const halfD = wallD / 2
    const walls = new THREE.Mesh(this._rbox(BW, BH, wallD, 0.04), this._bmat(wallColor))
    walls.position.y = BH / 2
    walls.castShadow = true
    g.add(walls)
    const gf = this._gable()
    gf.position.set(0, 0, halfD - 0.035)
    g.add(gf)
    const gb = this._gable()
    gb.position.set(0, 0, -halfD - 0.005)
    g.add(gb)
    g.add(this._pitchedRoof(wallD, roofColor))
    // Front (gable) door + window + step.
    const door = this._bdoor('gable')
    door.position.set(-0.11, 0, halfD + 0.01)
    g.add(door)
    const win = this._bwindow('gable')
    win.position.set(0.2, 0.32, halfD + 0.01)
    g.add(win)
    const step = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.06, 0.12), this._bmat(BC.step))
    step.position.set(-0.11, 0.03, halfD + 0.08)
    g.add(step)
    // Side windows.
    const wR = this._bwindow('side')
    wR.position.set(BW / 2 + 0.005, 0.32, 0.05)
    g.add(wR)
    const wL = this._bwindow('side')
    wL.position.set(-BW / 2 - 0.005, 0.32, 0.05)
    wL.rotation.y = Math.PI
    g.add(wL)
    // --- Signature details ---
    if (opts.chimney) {
      const chim = this._bchimney()
      chim.position.set(-0.28, BH + 0.3, -0.1)
      chim.castShadow = true
      g.add(chim)
    }
    if (opts.dormer) {
      // Dormer on the front roof slope, halfway between eave and ridge.
      const dormer = this._dormer(roofColor)
      dormer.position.set(0.08, (BH + BPEAK) / 2 - 0.05, halfD * 0.5)
      g.add(dormer)
    }
    if (opts.flowerBox) {
      // Planter sits under the front window.
      const fb = this._flowerBox()
      fb.position.set(0.2, 0.18, halfD + 0.05)
      g.add(fb)
      // …and one under each side window for a cosy cottage look.
      for (const sx of [1, -1]) {
        const sfb = this._flowerBox()
        sfb.position.set(sx * (BW / 2 + 0.03), 0.18, 0.05)
        sfb.rotation.y = (sx * Math.PI) / 2
        g.add(sfb)
      }
    }
    if (opts.awning) {
      const aw = this._awning(roofColor)
      aw.position.set(-0.11, 0.56, halfD + 0.08)
      g.add(aw)
    }
    return g
  }

  // House: classic — pitched roof + roof dormer + chimney.
  _house(roofColor = BC.roof) {
    return this._gabledHouse(1.05, roofColor, BC.wall, { dormer: true, chimney: true })
  }

  // Cottage: cosy — window flower boxes + door awning, no chimney.
  _cottage(roofColor = 0xd85a4a) {
    return this._gabledHouse(0.7, roofColor, 0xf0e3bf, { flowerBox: true, awning: true })
  }

  _manor(roofColor = 0x8a8f9c) {
    const g = new THREE.Group()
    const SIDE = 1.7
    const wallH = 0.98
    const found = new THREE.Mesh(this._rbox(SIDE + 0.14, 0.14, SIDE + 0.14, 0.04), this._bmat(BC.stone))
    found.position.y = 0.07
    found.receiveShadow = true
    g.add(found)
    const walls = new THREE.Mesh(this._rbox(SIDE, wallH, SIDE, 0.04), this._bmat(BC.brick))
    walls.position.y = 0.14 + wallH / 2
    walls.castShadow = true
    g.add(walls)
    const wallTop = 0.14 + wallH
    const roof = this._hippedRoof(SIDE + 0.22, SIDE + 0.22, 0.62, roofColor)
    roof.position.y = wallTop
    g.add(roof)
    // Portico: porch floor, 4 columns, small pediment.
    const front = SIDE / 2
    const porch = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.1, 0.34), this._bmat(BC.stone))
    porch.position.set(0, 0.19, front + 0.12)
    g.add(porch)
    const colMat = this._bmat(0xf3ece0)
    for (const dx of [-0.36, -0.12, 0.12, 0.36]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.72, 10), colMat)
      col.position.set(dx, 0.24 + 0.36, front + 0.12)
      col.castShadow = true
      g.add(col)
    }
    const ped = this._b(0.96, 0.16, 0.34, 0, 0.24 + 0.78, front + 0.12, this._bmat(0xf3ece0))
    g.add(ped)
    const door = this._bdoor('gable')
    door.position.set(0, 0.14, front + 0.01)
    g.add(door)
    // Two rows of framed windows on the front.
    for (const dx of [-0.5, 0.5]) {
      const w1 = this._bwindow('gable')
      w1.position.set(dx, 0.55, front + 0.01)
      g.add(w1)
    }
    for (const dx of [-0.5, 0, 0.5]) {
      const w2 = this._bwindow('gable', 'small')
      w2.position.set(dx, 0.92, front + 0.01)
      g.add(w2)
    }
    // --- Signature: twin chimneys + a rooftop cupola on the hipped roof. ---
    const apexY = wallTop + 0.62
    for (const dx of [-0.55, 0.55]) {
      const chim = this._bchimney()
      chim.position.set(dx, wallTop + 0.42, -0.18)
      chim.castShadow = true
      g.add(chim)
    }
    const cupola = this._cupola(roofColor)
    cupola.position.set(0, apexY - 0.06, 0)
    g.add(cupola)
    return g
  }

  _tower(roofColor) {
    const g = new THREE.Group()
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.5, 0.16, 14), this._flat(0xcfd2cb))
    base.position.y = 0.08
    base.castShadow = true
    g.add(base)
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 1.1, 14), this._bmat(BC.stone))
    body.position.y = 0.7
    body.castShadow = true
    g.add(body)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.05, 8, 18), this._bmat(0x9c958a))
    ring.position.y = 1.18
    ring.rotation.x = Math.PI / 2
    g.add(ring)
    // --- Signature: a ring of crenellations (battlements) atop the body. ---
    g.add(this._crenellations(0.4, 1.28, 10, BC.stone))
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.55, 14), this._bmat(roofColor ?? 0x9b7fd6, { flat: true }))
    roof.position.y = 1.62
    roof.castShadow = true
    g.add(roof)
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.3, 6), this._bmat(BC.trim))
    pole.position.y = 1.9
    g.add(pole)
    const flag = new THREE.Mesh(this._rbox(0.18, 0.12, 0.02, 0.02), this._bmat(0xe23a20))
    flag.position.set(0.1, 1.98, 0)
    g.add(flag)
    for (const a of [0, Math.PI * 0.66, Math.PI * 1.33]) {
      const win = this._b(0.12, 0.18, 0.06, 0, 0, 0, this._bmat(BC.glass))
      win.position.set(Math.sin(a) * 0.4, 0.8, Math.cos(a) * 0.4)
      win.lookAt(Math.sin(a) * 1, 0.8, Math.cos(a) * 1)
      g.add(win)
    }
    return g
  }

  _windmill() {
    const g = new THREE.Group()
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.44, 1.1, 14), this._stoneMat(0xf3ecd8))
    body.position.y = 0.55
    body.castShadow = true
    g.add(body)
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.42, 14), this._roofMat(0x9c6f4f))
    roof.position.y = 1.3
    roof.castShadow = true
    g.add(roof)
    const door = new THREE.Mesh(this._rbox(0.2, 0.34, 0.06, 0.03), this._flat(0x7a5232))
    door.position.set(0, 0.27, 0.4)
    g.add(door)
    // --- Signature: a railed balcony ring around the upper body. ---
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 16), this._flat(0x9c6f4f))
    deck.position.y = 0.82
    deck.castShadow = true
    g.add(deck)
    const rail = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.018, 6, 22), this._flat(0x6f4a2e))
    rail.position.y = 0.92
    rail.rotation.x = Math.PI / 2
    g.add(rail)
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      const post = new THREE.Mesh(this._rbox(0.02, 0.12, 0.02, 0.005), this._flat(0x6f4a2e))
      post.position.set(Math.sin(a) * 0.4, 0.87, Math.cos(a) * 0.4)
      g.add(post)
    }
    const blades = new THREE.Group()
    const hub = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), this._flat(0x6b5a44))
    blades.add(hub)
    for (let i = 0; i < 4; i++) {
      const blade = new THREE.Mesh(this._rbox(0.08, 0.55, 0.02, 0.01), this._flat(0xece2c8))
      blade.position.y = 0.3
      const arm = new THREE.Group()
      arm.add(blade)
      arm.rotation.z = (i * Math.PI) / 2
      blades.add(arm)
    }
    blades.position.set(0, 0.95, 0.46)
    g.add(blades)
    this.windmills.push(blades)
    return g
  }

  // Stacked rounded-box canopy (Tiny World Builder's tree style).
  _roundtree() {
    const g = new THREE.Group()
    const leaf = this._bmat(0x86d139)
    const leafDk = this._bmat(0x5fab26)
    const trunkH = 0.5
    const trunk = new THREE.Mesh(this._rbox(0.18, trunkH, 0.18, 0.03), this._bmat(0x5c3818))
    trunk.position.y = trunkH / 2
    trunk.castShadow = true
    g.add(trunk)
    const lowerH = 0.42
    const lowerY = trunkH + lowerH * 0.5 - 0.08
    const lower = new THREE.Mesh(this._rbox(0.62, lowerH, 0.62, 0.1), leaf)
    lower.position.y = lowerY
    lower.castShadow = true
    g.add(lower)
    const upperH = 0.32
    const upperY = lowerY + lowerH * 0.5 + upperH * 0.5 - 0.05
    const upper = new THREE.Mesh(this._rbox(0.42, upperH, 0.42, 0.08), leaf)
    upper.position.y = upperY
    upper.castShadow = true
    g.add(upper)
    const tip = new THREE.Mesh(this._rbox(0.24, 0.2, 0.24, 0.05), leafDk)
    tip.position.y = upperY + upperH * 0.5 + 0.07
    tip.castShadow = true
    g.add(tip)
    return g
  }

  _lamppost() {
    const g = new THREE.Group()
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.95, 8), this._flat(0x5b6470))
    post.position.y = 0.47
    post.castShadow = true
    g.add(post)
    const lampMat = new THREE.MeshStandardMaterial({
      color: 0xffe7a0, emissive: 0xffba55, emissiveIntensity: 0.2, roughness: 0.5
    })
    const head = new THREE.Mesh(this._rbox(0.22, 0.24, 0.22, 0.05), lampMat)
    head.position.y = 1.02
    g.add(head)
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.14, 6), this._flat(0x5b6470))
    cap.position.y = 1.2
    g.add(cap)
    const light = new THREE.PointLight(0xffc266, 0, 4.5, 2)
    light.position.set(0, 1.05, 0)
    g.add(light)
    // Track for the day/night cycle to ramp on/off.
    this.lamps.push({ mat: lampMat, light })
    return g
  }

  _bridge() {
    const g = new THREE.Group()
    const deck = new THREE.Mesh(this._rbox(0.95, 0.1, 0.62, 0.04), this._flat(0xc79a63))
    deck.position.y = 0.02
    deck.castShadow = true
    deck.receiveShadow = true
    g.add(deck)
    for (const z of [-0.27, 0.27]) {
      const rail = new THREE.Mesh(this._rbox(0.95, 0.04, 0.04, 0.02), this._flat(0xa9763f))
      rail.position.set(0, 0.2, z)
      g.add(rail)
      for (const x of [-0.4, 0, 0.4]) {
        const post = new THREE.Mesh(this._rbox(0.05, 0.2, 0.05, 0.02), this._flat(0xa9763f))
        post.position.set(x, 0.1, z)
        g.add(post)
      }
    }
    return g
  }

  _haybale() {
    const g = new THREE.Group()
    const bale = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.5, 14), this._flat(0xe6c558))
    bale.rotation.z = Math.PI / 2
    bale.position.y = 0.24
    bale.castShadow = true
    g.add(bale)
    for (const x of [-0.12, 0.12]) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.245, 0.015, 6, 16), this._flat(0xc9a73f))
      band.position.set(x, 0.24, 0)
      band.rotation.y = Math.PI / 2
      g.add(band)
    }
    return g
  }

  _bench() {
    const g = new THREE.Group()
    const seat = new THREE.Mesh(this._rbox(0.6, 0.06, 0.22, 0.02), this._flat(0xb07a45))
    seat.position.y = 0.24
    seat.castShadow = true
    g.add(seat)
    const back = new THREE.Mesh(this._rbox(0.6, 0.2, 0.05, 0.02), this._flat(0xb07a45))
    back.position.set(0, 0.36, -0.09)
    g.add(back)
    for (const x of [-0.25, 0.25]) {
      for (const z of [-0.08, 0.08]) {
        const leg = new THREE.Mesh(this._rbox(0.05, 0.24, 0.05, 0.01), this._flat(0x8a5a34))
        leg.position.set(x, 0.12, z)
        g.add(leg)
      }
    }
    return g
  }

  _flowerbed() {
    const g = new THREE.Group()
    const box = new THREE.Mesh(this._rbox(0.52, 0.18, 0.36, 0.04), this._flat(0xa9763f))
    box.position.y = 0.09
    box.castShadow = true
    g.add(box)
    const soil = new THREE.Mesh(this._rbox(0.44, 0.06, 0.28, 0.02), this._flat(0x6f4a2e))
    soil.position.y = 0.18
    g.add(soil)
    const colors = [0xff7aa0, 0xffd23f, 0xb98aff, 0xff9a4c]
    let i = 0
    for (const x of [-0.15, 0, 0.15]) {
      for (const z of [-0.08, 0.08]) {
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), this._flat(colors[i++ % colors.length]))
        head.position.set(x, 0.27, z)
        g.add(head)
      }
    }
    return g
  }

  _signpost() {
    const g = new THREE.Group()
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.65, 8), this._flat(0x8a5a34))
    post.position.y = 0.32
    post.castShadow = true
    g.add(post)
    const board = new THREE.Mesh(this._rbox(0.36, 0.18, 0.05, 0.03), this._flat(0xcb9a5f))
    board.position.set(0.05, 0.56, 0)
    board.rotation.y = 0.15
    board.castShadow = true
    g.add(board)
    return g
  }

  _tree() {
    const g = new THREE.Group()
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.5, 6), this._flat(0x7a4a2b))
    trunk.position.y = 0.25
    trunk.castShadow = true
    g.add(trunk)
    const colors = [0x3fa35a, 0x4cb86a, 0x2f8d4d]
    for (let i = 0; i < 3; i++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.46 - i * 0.1, 0.5, 7), this._flat(colors[i]))
      cone.position.y = 0.6 + i * 0.27
      cone.castShadow = true
      g.add(cone)
    }
    g.rotation.y = Math.random() * Math.PI
    return g
  }

  _crops() {
    const g = new THREE.Group()
    const colors = [0x6fc36f, 0xffb24c, 0xffd23f]
    let i = 0
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 3; c++) {
        const crop = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.24, 5), this._flat(colors[i++ % 3]))
        crop.position.set(-0.28 + c * 0.28, 0.12, -0.18 + r * 0.32)
        crop.castShadow = true
        g.add(crop)
      }
    }
    return g
  }

  _bush() {
    const g = new THREE.Group()
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.26, 0), this._flat(0x5fae50))
    b.position.y = 0.24
    b.castShadow = true
    g.add(b)
    return g
  }

  _flower(color) {
    const g = new THREE.Group()
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 4), this._flat(0x4f9e4a))
    stem.position.y = 0.11
    g.add(stem)
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 0), this._flat(color))
    head.position.y = 0.25
    g.add(head)
    return g
  }

  _mushroom() {
    const g = new THREE.Group()
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.16, 6), this._flat(0xf3ead2))
    stem.position.y = 0.08
    g.add(stem)
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      this._flat(0xe05a4a)
    )
    cap.position.y = 0.16
    g.add(cap)
    return g
  }

  _buildActors() {
    for (const pet of this.map.pets) {
      const actor = new PetActor(this, this.grid, pet)
      this.actors.push(actor)
      if (pet.primary) this.primaryActor = actor
    }
    if (!this.primaryActor) this.primaryActor = this.actors[0]
  }

  _buildAmbientParticles() {
    const count = 90
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 16
      positions[i * 3 + 1] = Math.random() * 7
      positions[i * 3 + 2] = (Math.random() - 0.5) * 16
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const mat = new THREE.PointsMaterial({
      color: 0xcbb98a,
      size: 0.07,
      transparent: true,
      opacity: 0.5,
      depthWrite: false
    })
    this.ambient = new THREE.Points(geo, mat)
    this.scene.add(this.ambient)
  }

  // --- Reactions / bursts ---------------------------------------------------

  spawnBurst(origin, color, count, up, yOffset = 0.4) {
    const positions = new Float32Array(count * 3)
    const velocities = []
    for (let i = 0; i < count; i++) {
      velocities.push(
        new THREE.Vector3(
          (Math.random() - 0.5) * 2.0,
          up + Math.random() * 1.8,
          (Math.random() - 0.5) * 2.0
        )
      )
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const mat = new THREE.PointsMaterial({
      color,
      size: 0.18,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
    const pts = new THREE.Points(geo, mat)
    pts.position.copy(origin)
    pts.position.y += yOffset
    this.scene.add(pts)
    this.bursts.push({ pts, velocities, life: 0, ttl: 1.4 })
  }

  // A little emoji that pops above the pet and floats up while fading.
  spawnEmoji(origin, emoji) {
    const size = 128
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')
    ctx.font = '96px serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(emoji, size / 2, size / 2 + 6)
    const tex = new THREE.CanvasTexture(canvas)
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false })
    const sprite = new THREE.Sprite(mat)
    sprite.scale.setScalar(0.7)
    sprite.position.copy(origin)
    sprite.position.y += 0.95
    this.scene.add(sprite)
    this.emojis.push({ sprite, tex, mat, life: 0, ttl: 1.5 })
  }

  setPetStats(stats) {
    if (this.primaryActor) this.primaryActor.setStats(stats)
  }
  playHappy() {
    if (this.primaryActor) this.primaryActor.playHappy()
  }
  playSad() {
    if (this.primaryActor) this.primaryActor.playSad()
  }

  // --- Loop -----------------------------------------------------------------

  _update(dt, t) {
    this._updateDayNight(dt)
    this._updateCrops(Date.now())

    for (const w of this.waters) w.material.opacity = 0.78 + Math.sin(t * 2 + w.position.x) * 0.08

    for (const wm of this.windmills) wm.rotation.z += dt * 1.1

    for (const f of this.flames) {
      const s = 1 + Math.sin(t * 13 + f.phase) * 0.13
      f.mesh.scale.set(1, s, 1)
      if (f.mesh2) f.mesh2.scale.set(1, s * 1.06, 1)
    }

    if (this.ambient) {
      const pos = this.ambient.geometry.attributes.position
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) + dt * 0.2
        if (y > 7) y = 0
        pos.setY(i, y)
      }
      pos.needsUpdate = true
    }

    if (!this.editMode) for (const actor of this.actors) actor.update(dt, t)

    for (let i = this.emojis.length - 1; i >= 0; i--) {
      const e = this.emojis[i]
      e.life += dt
      const f = e.life / e.ttl
      e.sprite.position.y += dt * 0.6
      e.sprite.material.opacity = Math.max(0, 1 - f)
      e.sprite.scale.setScalar(0.7 + f * 0.25)
      if (e.life >= e.ttl) {
        this.scene.remove(e.sprite)
        e.tex.dispose()
        e.mat.dispose()
        this.emojis.splice(i, 1)
      }
    }

    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i]
      b.life += dt
      const pos = b.pts.geometry.attributes.position
      for (let j = 0; j < b.velocities.length; j++) {
        const v = b.velocities[j]
        v.y -= dt * 3.2
        pos.setXYZ(j, pos.getX(j) + v.x * dt, pos.getY(j) + v.y * dt, pos.getZ(j) + v.z * dt)
      }
      pos.needsUpdate = true
      b.pts.material.opacity = Math.max(0, 1 - b.life / b.ttl)
      if (b.life >= b.ttl) {
        this.scene.remove(b.pts)
        b.pts.geometry.dispose()
        b.pts.material.dispose()
        this.bursts.splice(i, 1)
      }
    }

    this.controls.update()
  }

  start() {
    const loop = () => {
      this._raf = requestAnimationFrame(loop)
      const dt = Math.min(this.clock.getDelta(), 0.05)
      this._update(dt, this.clock.elapsedTime)
      this.renderer.render(this.scene, this.camera)
    }
    loop()
  }

  resize() {
    const w = window.innerWidth
    const h = window.innerHeight
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
  }

  dispose() {
    cancelAnimationFrame(this._raf)
    if (this.controls) this.controls.dispose()
    this.scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose()
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
        mats.forEach((m) => m.dispose())
      }
    })
    this.renderer.dispose()
  }
}
