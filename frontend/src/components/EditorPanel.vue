<script setup>
import { computed } from 'vue'
import { TILE_PALETTE, PROP_PALETTE } from '../three/mapData.js'
import {
  store,
  selectTool,
  setEditColor,
  rotateTool,
  expandGrid,
  saveMap,
  resetMap,
  recenterView
} from '../store.js'

const coins = computed(() => store.pet?.coins ?? 0)
function canAfford(p) {
  return coins.value >= (p.price || 0)
}

const COLORS = ['#7fb0e0', '#e39a86', '#a48fd6', '#8fce7e', '#ffd23f', '#ef7a86', '#fdfaf0', '#5b6470']

const sel = computed(() => store.editTool)
function isSel(kind, value) {
  return sel.value.kind === kind && sel.value.value === value
}
</script>

<template>
  <div v-if="store.editMode" class="editor panel">
    <div class="row head">
      <span class="title">🧱 Build Mode</span>
      <span class="purse">💰 {{ coins }}</span>
    </div>

    <div class="section-label">Ground</div>
    <div class="grid tiles">
      <button
        v-for="t in TILE_PALETTE"
        :key="t.glyph"
        class="cell"
        :class="{ on: isSel('tile', t.glyph) }"
        @click="selectTool({ kind: 'tile', value: t.glyph })"
      >
        <img v-if="store.thumbnails['tile:' + t.glyph]" class="thumb" :src="store.thumbnails['tile:' + t.glyph]" :alt="t.label" />
        <span v-else class="ico">{{ t.icon }}</span>
        <span class="lbl">{{ t.label }}</span>
      </button>
      <button class="cell erase" :class="{ on: sel.kind === 'erase' }" @click="selectTool({ kind: 'erase', value: 'erase' })">
        <span class="ico">🧽</span>
        <span class="lbl">Erase</span>
      </button>
    </div>

    <div class="section-label">Objects</div>
    <div class="grid props">
      <button
        v-for="p in PROP_PALETTE"
        :key="p.type"
        class="cell prop"
        :class="{ on: isSel('prop', p.type), broke: !canAfford(p) }"
        :disabled="!canAfford(p)"
        @click="selectTool({ kind: 'prop', value: p.type, w: p.w, h: p.h, scale: p.scale, recolor: p.recolor, price: p.price })"
      >
        <img v-if="store.thumbnails['prop:' + p.type]" class="thumb" :src="store.thumbnails['prop:' + p.type]" :alt="p.label" />
        <span v-else class="ico">{{ p.icon }}</span>
        <span class="lbl">{{ p.label }}</span>
        <span class="price">💰{{ p.price }}</span>
      </button>
    </div>

    <div class="section-label">Building colour</div>
    <div class="colors">
      <button
        v-for="c in COLORS"
        :key="c"
        class="swatch"
        :class="{ on: store.editColor.toLowerCase() === c.toLowerCase() }"
        :style="{ background: c }"
        @click="setEditColor(c)"
      ></button>
      <input class="picker" type="color" :value="store.editColor" @input="setEditColor($event.target.value)" />
    </div>

    <div class="row controls">
      <button class="ctrl" @click="rotateTool()">⟳ Rotate</button>
      <button class="ctrl" @click="recenterView()">⊕ Recenter</button>
      <button class="ctrl" @click="resetMap()">↺ Reset</button>
    </div>
    <p class="tip">Drag empty space to pan · right-drag to rotate · scroll to zoom</p>

    <div class="section-label">Expand map</div>
    <div class="expand">
      <button class="ctrl sm" @click="expandGrid('top')">↑</button>
      <div class="mid">
        <button class="ctrl sm" @click="expandGrid('left')">←</button>
        <button class="ctrl sm" @click="expandGrid('right')">→</button>
      </div>
      <button class="ctrl sm" @click="expandGrid('bottom')">↓</button>
    </div>

    <button class="save" :disabled="store.mapSaving" @click="saveMap()">
      {{ store.mapSaving ? 'Saving…' : store.mapDirty ? '💾 Save world' : '✓ Saved' }}
    </button>
    <p class="hint">Tap a tile/object then click the map to place. Drag empty space to rotate the view.</p>
  </div>
</template>

<style scoped>
.editor {
  position: fixed;
  top: 50%;
  right: 24px;
  transform: translateY(-50%);
  width: 250px;
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
.cell.prop {
  position: relative;
  padding-bottom: 13px;
}
.cell .price {
  position: absolute;
  bottom: 2px;
  right: 4px;
  font-size: 9.5px;
  font-weight: 700;
  color: #8a6a16;
}
.cell.broke {
  opacity: 0.4;
  cursor: not-allowed;
}
.section-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--ink-soft);
  text-transform: uppercase;
  letter-spacing: 0.4px;
  margin: 12px 0 7px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}
.cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 7px 2px 5px;
  background: var(--paper-2);
  border: 2px solid transparent;
  border-radius: 12px;
  transition: border-color 0.15s, background 0.15s;
}
.cell:hover {
  background: #fff3da;
}
.cell.on {
  border-color: var(--xp-dark);
  background: #e7f7df;
}
.cell.erase.on {
  border-color: var(--hp-dark);
  background: #ffe2e2;
}
.ico {
  font-size: 19px;
}
.thumb {
  width: 42px;
  height: 42px;
  object-fit: contain;
}
.lbl {
  font-size: 9.5px;
  font-weight: 600;
  color: var(--ink);
}
.colors {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.swatch {
  width: 24px;
  height: 24px;
  border-radius: 8px;
  border: 2px solid rgba(0, 0, 0, 0.12);
}
.swatch.on {
  border-color: var(--ink);
  box-shadow: 0 0 0 2px var(--paper), 0 0 0 4px var(--ink-soft);
}
.picker {
  width: 28px;
  height: 24px;
  padding: 0;
  border: none;
  background: none;
}
.controls {
  gap: 8px;
  margin-top: 12px;
}
.ctrl {
  flex: 1;
  padding: 9px;
  font-size: 13px;
  font-weight: 700;
  color: var(--ink);
  background: var(--paper-2);
  border: 2px solid var(--line-strong);
  border-radius: 12px;
  box-shadow: 0 3px 0 var(--line-strong);
}
.ctrl:active {
  transform: translateY(2px);
  box-shadow: 0 1px 0 var(--line-strong);
}
.expand {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.expand .mid {
  display: flex;
  gap: 40px;
}
.ctrl.sm {
  flex: none;
  width: 40px;
  padding: 7px 0;
}
.save {
  width: 100%;
  margin-top: 14px;
  padding: 12px;
  font-size: 15px;
  font-weight: 700;
  color: #2c5520;
  background: linear-gradient(180deg, #a6e294, var(--xp));
  border: 2px solid var(--xp-dark);
  border-radius: 14px;
  box-shadow: 0 4px 0 var(--xp-dark);
}
.save:active:not(:disabled) {
  transform: translateY(3px);
  box-shadow: 0 1px 0 var(--xp-dark);
}
.save:disabled {
  opacity: 0.6;
}
.hint {
  font-size: 10.5px;
  font-weight: 500;
  color: var(--ink-soft);
  line-height: 1.5;
  margin-top: 10px;
}
.tip {
  font-size: 10px;
  font-weight: 500;
  color: var(--ink-soft);
  line-height: 1.4;
  margin-top: 8px;
  text-align: center;
}
</style>
