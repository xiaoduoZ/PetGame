import * as THREE from 'three'

// Builds one cute, smooth-shaded "Mochi" creature. Each actor owns its own
// materials so multiple pets can react (color/expression) independently.
export function buildPetModel(scale = 1) {
  const group = new THREE.Group()

  const smooth = (color, opts = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...opts })

  const bodyMat = smooth(0xfff1d6)
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.7, 24, 18), bodyMat)
  body.scale.set(1, 0.86, 0.92)
  body.position.y = 0.05
  body.castShadow = true
  group.add(body)

  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.46, 18, 14), smooth(0xffffff))
  belly.scale.set(1, 0.8, 0.45)
  belly.position.set(0, -0.08, 0.52)
  group.add(belly)

  const earGeo = new THREE.SphereGeometry(0.2, 14, 12)
  const earL = new THREE.Mesh(earGeo, bodyMat)
  earL.scale.set(0.8, 1.1, 0.5)
  earL.position.set(-0.34, 0.64, 0)
  earL.rotation.z = 0.3
  earL.castShadow = true
  const earR = earL.clone()
  earR.position.x = 0.34
  earR.rotation.z = -0.3
  group.add(earL, earR)

  const innerGeo = new THREE.SphereGeometry(0.12, 12, 10)
  const innerMat = smooth(0xffc1c8)
  const innerL = new THREE.Mesh(innerGeo, innerMat)
  innerL.scale.set(0.7, 1.0, 0.4)
  innerL.position.set(-0.33, 0.64, 0.07)
  innerL.rotation.z = 0.3
  const innerR = innerL.clone()
  innerR.position.x = 0.33
  innerR.rotation.z = -0.3
  group.add(innerL, innerR)

  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x2a2433, roughness: 0.35 })
  const eyeGeo = new THREE.SphereGeometry(0.13, 16, 14)
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat)
  eyeL.position.set(-0.24, 0.14, 0.6)
  const eyeR = eyeL.clone()
  eyeR.position.x = 0.24
  group.add(eyeL, eyeR)

  const hiMat = new THREE.MeshBasicMaterial({ color: 0xffffff })
  const hiGeo = new THREE.SphereGeometry(0.045, 8, 8)
  const hiL = new THREE.Mesh(hiGeo, hiMat)
  hiL.position.set(-0.2, 0.19, 0.71)
  const hiR = hiL.clone()
  hiR.position.x = 0.28
  group.add(hiL, hiR)

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), smooth(0xc77a86))
  nose.position.set(0, 0.0, 0.69)
  group.add(nose)
  const blushMat = smooth(0xff9aa6, { transparent: true, opacity: 0.8 })
  const blushGeo = new THREE.CircleGeometry(0.09, 14)
  const blushL = new THREE.Mesh(blushGeo, blushMat)
  blushL.position.set(-0.4, -0.04, 0.55)
  blushL.rotation.y = -0.5
  const blushR = blushL.clone()
  blushR.position.x = 0.4
  blushR.rotation.y = 0.5
  group.add(blushL, blushR)

  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), bodyMat)
  tail.scale.set(0.7, 0.7, 1)
  tail.position.set(0, 0.05, -0.66)
  tail.castShadow = true
  group.add(tail)

  const footGeo = new THREE.SphereGeometry(0.16, 12, 10)
  const footL = new THREE.Mesh(footGeo, bodyMat)
  footL.scale.set(1, 0.55, 1.25)
  footL.position.set(-0.26, -0.6, 0.18)
  const footR = footL.clone()
  footR.position.x = 0.26
  group.add(footL, footR)

  group.scale.setScalar(scale)
  return { group, bodyMat, body, ears: [earL, earR], footLift: 0.6 * scale }
}

// Distinct reaction per interaction: motion profile + particle burst + emoji.
//  hopH/hopRate: bounce; spin: rad/s; wiggle: side-to-side yaw; nod: forward tilt;
//  squash: bounce squash; droop: sad sink.
export const REACTIONS = {
  water: { dur: 1.3, emoji: '💧', bursts: [{ c: 0x6ec6ff, n: 18, up: 1.6 }], hopRate: 7, hopH: 0.34, squash: 0.1 },
  exercise: {
    dur: 1.6, emoji: '🏃',
    bursts: [{ c: 0xffa94c, n: 16, up: 2.0 }, { c: 0xfff0a0, n: 8, up: 1.4 }],
    hopRate: 11, hopH: 0.5, spin: 1.6, squash: 0.14
  },
  study: { dur: 1.5, emoji: '📚', bursts: [{ c: 0xffd23f, n: 12, up: 1.2 }], nod: 0.24 },
  play: { dur: 1.7, emoji: '🎾', bursts: [{ c: 0x7bd86b, n: 18, up: 2.2 }], hopRate: 6, hopH: 0.72, spin: 2.4, squash: 0.12 },
  pet: { dur: 1.0, emoji: '❤️', bursts: [{ c: 0xff8fbf, n: 16, up: 1.6 }], hopRate: 9, hopH: 0.2, wiggle: 0.5, squash: 0.08 },
  happy: {
    dur: 1.4, emoji: '✨',
    bursts: [{ c: 0x7cf6c8, n: 18, up: 1.8 }, { c: 0xffd166, n: 8, up: 1.4 }],
    hopRate: 7, hopH: 0.45, squash: 0.12
  },
  sad: { dur: 1.9, emoji: '😢', bursts: [{ c: 0x6aa6ff, n: 10, up: 0.5 }], droop: true }
}

// Distinct motion profile per directed action (performed AT the map feature).
// After the action ends, the celebratory REACTIONS hop+emoji fires.
//   tilt      = forward lean (head down)
//   nod       = repeated downward nod (study)
//   hops      = bouncy hops in place
//   spin      = rad/s yaw spin (exercise)
//   wiggle    = side-to-side yaw wiggle (play)
//   particle  = ambient particle color spawned every `particleEvery` seconds
export const ACTIONS = {
  drink: {
    dur: 1.5, tilt: 0.55, tiltOsc: 0.12, bobBase: -0.06, bobOsc: 0.03,
    oscRate: 10, particle: 0x6ec6ff, particleEvery: 0.18
  },
  exercise: {
    dur: 1.7, hops: true, hopH: 0.45, hopRate: 13, spin: 0.5,
    particle: 0xffa94c, particleEvery: 0.22
  },
  study: {
    dur: 1.9, nod: 0.32, oscRate: 5, bobBase: -0.02, bobOsc: 0.02,
    particle: 0xffd23f, particleEvery: 0.28
  },
  play: {
    dur: 1.7, hops: true, hopH: 0.7, hopRate: 7, wiggle: 0.45,
    particle: 0x7bd86b, particleEvery: 0.2
  }
}

// A pet that freely wanders the walkable area, with per-action reactions.
export default class PetActor {
  constructor(host, grid, opts = {}) {
    this.host = host
    this.grid = grid
    this.name = opts.name || 'Mochi'
    this.primary = !!opts.primary

    const built = buildPetModel(opts.scale ?? 0.5)
    this.group = built.group
    this.bodyMat = built.bodyMat
    this.body = built.body
    this.ears = built.ears
    this.standY = grid.tileTopY + built.footLift

    const w = grid.cellToWorld(opts.col, opts.row)
    this.group.position.set(w.x, this.standY, w.z)

    this.targetWorld = null
    this.idleTimer = 0.4 + Math.random() * 1.2
    this.walkPhase = Math.random() * Math.PI * 2
    this.facing = Math.random() * Math.PI * 2
    this.group.rotation.y = this.facing

    this.stats = { hp: 100, mood: 5, level: 1 }
    this.reactState = 'idle'
    this.reactTime = 0
    this.reactProfile = null
    this.wantTimer = 5 + Math.random() * 5

    // Directed-task state (walk to a target, then perform an action).
    this.path = null
    this.pathIndex = 0
    this.faceTarget = null
    this.pendingAction = null
    this.onComplete = null
    this.actionState = null

    this.host.scene.add(this.group)
  }

  // Perform an action animation in place (fallback when no map target is found).
  performAction(kind, onComplete) {
    this.actionState = { kind, time: 0, partTimer: 0 }
    this.onComplete = onComplete || null
    this.path = null
    this.pendingAction = null
    this.faceTarget = null
    this.targetWorld = null
    this.reactState = 'idle'
  }

  // Walk along a list of world points, then face a target and run an action.
  goTo(points, faceTarget, action, onComplete) {
    this.path = points.map((p) => new THREE.Vector3(p.x, this.standY, p.z))
    this.pathIndex = 0
    this.faceTarget = faceTarget || null
    this.pendingAction = action || null
    this.onComplete = onComplete || null
    this.actionState = null
    this.reactState = 'idle'
    this.targetWorld = null
  }

  setStats({ hp, mood, level }) {
    if (hp != null) this.stats.hp = hp
    if (mood != null) this.stats.mood = mood
    if (level != null) this.stats.level = level
  }

  react(kind) {
    const fx = REACTIONS[kind] || REACTIONS.happy
    this.reactProfile = fx
    this.reactState = 'react'
    this.reactTime = 0
    this.targetWorld = null // pause roaming to perform the reaction
    fx.bursts.forEach((b) => this.host.spawnBurst(this.group.position, b.c, b.n, b.up))
    if (fx.emoji) this.host.spawnEmoji(this.group.position, fx.emoji)
  }

  playHappy() {
    this.react('happy')
  }
  playSad() {
    this.react('sad')
  }

  _chooseWant() {
    // Pet's current "thought" — drives the floating thought bubble.
    const night = this.host.isNight && this.host.isNight()
    if (night) return '💤'
    if (this.stats.hp < 60) return '💧'
    if (this.stats.mood < 3) return '🎾'
    // Ambient daydream — happens occasionally during a content day.
    if (Math.random() < 0.45) {
      return ['🌼', '🦋', '✨', '🍀'][Math.floor(Math.random() * 4)]
    }
    return null
  }

  _wellbeing() {
    const hp = THREE.MathUtils.clamp(this.stats.hp / 100, 0, 1)
    const mood = THREE.MathUtils.clamp(this.stats.mood / 5, 0, 1)
    return hp * 0.6 + mood * 0.4
  }

  _pathClear(x0, z0, x1, z1) {
    const g = this.grid
    const dx = x1 - x0
    const dz = z1 - z0
    const len = Math.hypot(dx, dz)
    const steps = Math.max(1, Math.ceil(len / 0.2))
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      if (!g.isWorldWalkable(x0 + dx * t, z0 + dz * t)) return false
    }
    return true
  }

  _pickTarget() {
    const g = this.grid
    const px = this.group.position.x
    const pz = this.group.position.z
    for (let i = 0; i < 16; i++) {
      const ang = Math.random() * Math.PI * 2
      const dist = 0.9 + Math.random() * 2.8
      const x = THREE.MathUtils.clamp(px + Math.sin(ang) * dist, g.minWorld.x, g.maxWorld.x)
      const z = THREE.MathUtils.clamp(pz + Math.cos(ang) * dist, g.minWorld.z, g.maxWorld.z)
      if (!g.isWorldWalkable(x, z)) continue
      if (!this._pathClear(px, pz, x, z)) continue
      this.targetWorld = new THREE.Vector3(x, this.standY, z)
      return
    }
    this.idleTimer = 0.5
  }

  update(dt, t) {
    const wb = this._wellbeing()
    this.bodyMat.color.copy(new THREE.Color(0x9fb0d0)).lerp(new THREE.Color(0xfff1d6), wb)
    const droop = (1 - wb) * 0.45
    this.ears[0].rotation.z = 0.3 - droop
    this.ears[1].rotation.z = -0.3 + droop

    let bob = Math.sin(t * 2.2 + this.walkPhase) * 0.04
    let squashY = 1

    if (this.reactState === 'react') {
      const pr = this.reactProfile
      this.reactTime += dt
      const p = this.reactTime
      const k = Math.max(0, 1 - p / pr.dur) // fade out over the reaction
      if (pr.hopH) bob += Math.abs(Math.sin(p * pr.hopRate)) * pr.hopH * k
      if (pr.squash) squashY = 1 + pr.squash * Math.abs(Math.sin(p * (pr.hopRate || 6))) * k
      if (pr.droop) {
        bob -= 0.1 * k
        squashY = 1 - 0.08 * k
      }
      if (pr.spin) this.group.rotation.y += dt * pr.spin * 6 * k
      if (pr.wiggle) this.group.rotation.y = this.facing + Math.sin(p * 16) * pr.wiggle * k
      const targetTilt = pr.nod ? Math.sin(p * 6) * pr.nod * k : 0
      this.group.rotation.x = THREE.MathUtils.lerp(this.group.rotation.x, targetTilt, 0.3)
      if (p > pr.dur) {
        this.reactState = 'idle'
        this.group.rotation.x = 0
      }
    } else if (this.actionState) {
      // Performing a directed action at the target spot.
      this.actionState.time += dt
      this.actionState.partTimer = (this.actionState.partTimer || 0) + dt
      const p = this.actionState.time
      const A = ACTIONS[this.actionState.kind] || { dur: 1.2 }

      // Keep the pet facing whatever we walked up to (drink: the water).
      if (!A.spin && !A.wiggle) this.group.rotation.y = this.facing

      // Forward lean / nod.
      let tiltTarget = 0
      if (A.tilt != null) tiltTarget = A.tilt + Math.sin(p * (A.oscRate || 10)) * (A.tiltOsc || 0)
      else if (A.nod) tiltTarget = Math.max(0, Math.sin(p * (A.oscRate || 5))) * A.nod
      this.group.rotation.x = THREE.MathUtils.lerp(this.group.rotation.x, tiltTarget, 0.3)

      // Motion: bob/hops/spin/wiggle from the profile.
      if (A.bobBase != null) bob = A.bobBase + Math.sin(p * (A.oscRate || 10)) * (A.bobOsc || 0)
      if (A.hops) bob = Math.abs(Math.sin(p * A.hopRate)) * A.hopH
      if (A.spin) this.group.rotation.y += dt * A.spin * 6
      if (A.wiggle) this.group.rotation.y = this.facing + Math.sin(p * 16) * A.wiggle

      // Periodic themed particles.
      if (A.particle && this.actionState.partTimer >= (A.particleEvery || 0.25)) {
        if (this.actionState.kind === 'drink' && this.faceTarget) {
          // Splashes leap from the water surface itself, not the pet.
          this.host.spawnBurst(this.faceTarget, A.particle, 3, 0.6, 0)
        } else {
          this.host.spawnBurst(this.group.position, A.particle, 3, 0.6)
        }
        this.actionState.partTimer = 0
      }

      if (p > A.dur) {
        this.group.rotation.x = 0
        const cb = this.onComplete
        this.actionState = null
        this.onComplete = null
        if (cb) cb()
      }
    } else if (this.path) {
      this.group.rotation.x = THREE.MathUtils.lerp(this.group.rotation.x, 0, 0.2)
      const pos = this.group.position
      const pt = this.path[this.pathIndex]
      const dx = pt.x - pos.x
      const dz = pt.z - pos.z
      const dist = Math.hypot(dx, dz)
      if (dist < 0.05) {
        this.pathIndex++
        if (this.pathIndex >= this.path.length) {
          this.path = null
          if (this.faceTarget) {
            this.facing = Math.atan2(this.faceTarget.x - pos.x, this.faceTarget.z - pos.z)
            this.group.rotation.y = this.facing
          }
          if (this.pendingAction) {
            this.actionState = { kind: this.pendingAction, time: 0 }
            this.pendingAction = null
            // Initial arrival splash: themed colour, from the water for drink.
            const A = ACTIONS[this.actionState.kind] || {}
            const isDrink = this.actionState.kind === 'drink' && this.faceTarget
            this.host.spawnBurst(
              isDrink ? this.faceTarget : this.group.position,
              A.particle || 0xffe089,
              5, 0.6,
              isDrink ? 0 : 0.4
            )
          } else {
            const cb = this.onComplete
            this.onComplete = null
            if (cb) cb()
          }
        }
      } else {
        const step = Math.min(1.9 * dt, dist)
        pos.x += (dx / dist) * step
        pos.z += (dz / dist) * step
        this.facing = Math.atan2(dx, dz)
        this.walkPhase += dt * 12
        bob = Math.abs(Math.sin(this.walkPhase)) * 0.08
        let dyaw = this.facing - this.group.rotation.y
        while (dyaw > Math.PI) dyaw -= Math.PI * 2
        while (dyaw < -Math.PI) dyaw += Math.PI * 2
        this.group.rotation.y += dyaw * Math.min(1, dt * 10)
      }
    } else {
      this.group.rotation.x = THREE.MathUtils.lerp(this.group.rotation.x, 0, 0.2)
      if (this.targetWorld) {
        const pos = this.group.position
        const dx = this.targetWorld.x - pos.x
        const dz = this.targetWorld.z - pos.z
        const dist = Math.hypot(dx, dz)
        const speed = 1.6
        if (dist < 0.05) {
          this.targetWorld = null
          this.idleTimer = 0.3 + Math.random() * 1.6
        } else {
          const step = Math.min(speed * dt, dist)
          pos.x += (dx / dist) * step
          pos.z += (dz / dist) * step
          this.facing = Math.atan2(dx, dz)
          this.walkPhase += dt * 11
          bob = Math.abs(Math.sin(this.walkPhase)) * 0.08
        }
      } else {
        this.idleTimer -= dt
        if (this.idleTimer <= 0) this._pickTarget()
      }
      // Smoothly turn toward the travel direction (only while roaming).
      let dyaw = this.facing - this.group.rotation.y
      while (dyaw > Math.PI) dyaw -= Math.PI * 2
      while (dyaw < -Math.PI) dyaw += Math.PI * 2
      this.group.rotation.y += dyaw * Math.min(1, dt * 9)
    }

    this.group.position.y = this.standY + bob
    this.body.scale.y = THREE.MathUtils.lerp(this.body.scale.y, 0.86 * squashY, 0.3)

    // Thought bubbles when the pet is idle (not reacting, walking, or busy).
    if (this.reactState === 'idle' && !this.actionState && !this.path) {
      this.wantTimer -= dt
      if (this.wantTimer <= 0) {
        this.wantTimer = 7 + Math.random() * 5
        const want = this._chooseWant()
        if (want) this.host.spawnEmoji(this.group.position, want)
      }
    }
  }
}
