<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { SEED_LIST, CROPS, cropStage } from '../three/farmData.js'
import { store, selectSeed } from '../store.js'

const coins = computed(() => store.pet?.coins ?? 0)
// Tick so growth timers in the panel refresh.
const now = ref(Date.now())
let timer = null
onMounted(() => {
  timer = setInterval(() => (now.value = Date.now()), 1000)
})
onBeforeUnmount(() => clearInterval(timer))

const planted = computed(() =>
  store.crops.map((c) => {
    const def = CROPS[c.type]
    const stage = cropStage(c, now.value)
    const remain = Math.max(0, Math.ceil(def.growSec - (now.value - c.plantedAt) / 1000))
    return { ...c, def, stage, ripe: stage >= 1, remain }
  })
)
const ripeCount = computed(() => planted.value.filter((p) => p.ripe).length)

function fmt(sec) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return m > 0 ? `${m}m${s.toString().padStart(2, '0')}s` : `${s}s`
}
</script>

<template>
  <div v-if="store.farmMode" class="farm panel">
    <div class="row head">
      <span class="title">🌱 Farm</span>
      <span class="purse">💰 {{ coins }}</span>
    </div>

    <div class="section-label">Seeds — tap a plot to plant</div>
    <div class="seeds">
      <button
        v-for="s in SEED_LIST"
        :key="s.type"
        class="seed"
        :class="{ on: store.farmSeed === s.type, broke: coins < s.seedCost }"
        :disabled="coins < s.seedCost"
        @click="selectSeed(s.type)"
      >
        <img v-if="store.thumbnails['crop:' + s.type]" class="thumb" :src="store.thumbnails['crop:' + s.type]" :alt="s.label" />
        <span v-else class="ico">{{ s.icon }}</span>
        <span class="lbl">{{ s.label }}</span>
        <span class="meta">💰{{ s.seedCost }} · {{ fmt(s.growSec) }}</span>
        <span class="yield">→ 💰{{ s.coins }} +{{ s.xp }}xp</span>
      </button>
    </div>

    <div class="section-label">
      Field ({{ planted.length }})<span v-if="ripeCount" class="ripe-badge">{{ ripeCount }} ripe!</span>
    </div>
    <div class="field">
      <div v-if="!planted.length" class="empty">
        Pick a seed, then tap grass or soil to plant. Crops grow in real time —
        tap a ripe one to harvest 💰.
      </div>
      <div v-for="(p, i) in planted" :key="i" class="crop-row" :class="{ ripe: p.ripe }">
        <span class="cico">{{ p.def.icon }}</span>
        <span class="cname">{{ p.def.label }}</span>
        <div class="bar">
          <div class="fill" :style="{ width: Math.round(p.stage * 100) + '%' }"></div>
        </div>
        <span class="cstat">{{ p.ripe ? 'Ripe ✓' : fmt(p.remain) }}</span>
      </div>
    </div>

    <p class="tip">Drag empty space to pan · scroll to zoom. Pet keeps roaming while you farm.</p>
  </div>
</template>

<style scoped>
.farm {
  position: fixed;
  top: 50%;
  right: 24px;
  transform: translateY(-50%);
  width: 264px;
  max-height: 86vh;
  overflow-y: auto;
  padding: 16px 16px 14px;
  z-index: 6;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.title {
  font-size: 16px;
  font-weight: 700;
  color: var(--ink);
}
.purse {
  font-size: 14px;
  font-weight: 700;
  color: #6b4a0a;
  background: linear-gradient(180deg, #fff1b5, #ffd86b);
  border: 2px solid #d4a73a;
  border-radius: 12px;
  padding: 2px 9px;
}
.section-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--ink-soft);
  text-transform: uppercase;
  letter-spacing: 0.4px;
  margin: 12px 0 7px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.ripe-badge {
  font-size: 10px;
  color: #2f7d3f;
  background: #d9f3d0;
  border: 1px solid #8fce7e;
  border-radius: 8px;
  padding: 1px 6px;
  text-transform: none;
}
.seeds {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 7px;
}
.seed {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  padding: 8px 4px 6px;
  background: var(--paper-2);
  border: 2px solid transparent;
  border-radius: 12px;
  transition: border-color 0.15s, background 0.15s;
}
.seed:hover:not(:disabled) {
  background: #fff3da;
}
.seed.on {
  border-color: var(--xp-dark);
  background: #e7f7df;
}
.seed.broke {
  opacity: 0.45;
  cursor: not-allowed;
}
.seed .ico {
  font-size: 20px;
}
.seed .thumb {
  width: 38px;
  height: 38px;
  object-fit: contain;
  image-rendering: auto;
}
.seed .lbl {
  font-size: 12px;
  font-weight: 700;
  color: var(--ink);
}
.seed .meta {
  font-size: 9px;
  color: var(--ink-soft);
}
.seed .yield {
  font-size: 9px;
  font-weight: 700;
  color: var(--xp-dark);
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.empty {
  font-size: 11.5px;
  font-weight: 500;
  color: var(--ink-soft);
  line-height: 1.5;
}
.crop-row {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 11px;
}
.cico {
  font-size: 15px;
}
.cname {
  width: 58px;
  font-weight: 700;
  color: var(--ink);
}
.bar {
  flex: 1;
  height: 8px;
  border-radius: 5px;
  background: var(--paper-inset);
  border: 1.5px solid var(--line-strong);
  overflow: hidden;
}
.fill {
  height: 100%;
  background: linear-gradient(90deg, #9bdc8c, var(--xp-dark));
  transition: width 1s linear;
}
.crop-row.ripe .cname {
  color: var(--xp-dark);
}
.cstat {
  width: 46px;
  text-align: right;
  font-weight: 700;
  color: var(--ink-soft);
  font-variant-numeric: tabular-nums;
}
.crop-row.ripe .cstat {
  color: var(--xp-dark);
}
.tip {
  font-size: 10px;
  font-weight: 500;
  color: var(--ink-soft);
  line-height: 1.4;
  margin-top: 10px;
  text-align: center;
}
</style>
