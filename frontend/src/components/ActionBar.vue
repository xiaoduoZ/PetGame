<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { store, interact, triggerMissed, logout, toggleEdit, toggleFarm } from '../store.js'

const tools = [
  { id: 'drink_water', icon: '💧', label: 'Water', key: '1' },
  { id: 'exercise_15m', icon: '🏃', label: 'Exercise', key: '2' },
  { id: 'study_25m', icon: '📚', label: 'Study', key: '3' },
  { id: 'play_10m', icon: '🎾', label: 'Play', key: '4' }
]

const selected = ref('study_25m')

function useTool(t) {
  selected.value = t.id
  interact(t.id)
}
function useMissed() {
  selected.value = 'missed'
  triggerMissed()
}
function onKey(e) {
  if (e.target.tagName === 'INPUT') return
  const t = tools.find((x) => x.key === e.key)
  if (t) useTool(t)
  else if (e.key.toLowerCase() === 'm') useMissed()
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="dock panel">
    <button
      v-for="t in tools"
      :key="t.id"
      class="act"
      :class="{ sel: selected === t.id }"
      :disabled="store.busy || store.taskActive"
      @click="useTool(t)"
    >
      <span class="ico">{{ t.icon }}</span>
      <span class="lbl">{{ t.label }}</span>
      <span class="kbd">{{ t.key }}</span>
    </button>

    <div class="divider"></div>

    <button
      class="act danger"
      :class="{ sel: selected === 'missed' }"
      :disabled="store.busy || store.taskActive"
      @click="useMissed()"
    >
      <span class="ico">⏰</span>
      <span class="lbl">Missed</span>
      <span class="kbd">M</span>
    </button>

    <button class="edit" :class="{ on: store.farmMode }" @click="toggleFarm()" title="Farm mode">🌱</button>
    <button class="edit" :class="{ on: store.editMode }" @click="toggleEdit()" title="Build mode">🧱</button>
    <button class="logout" @click="logout()" title="Log out">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none"
        stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <path d="M16 17l5-5-5-5" />
        <path d="M21 12H9" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.dock {
  position: fixed;
  bottom: 26px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  z-index: 5;
}
.act {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 74px;
  padding: 11px 6px 9px;
  border-radius: 18px;
  background: linear-gradient(180deg, #fffaf0, #ffedd0);
  border: 2px solid var(--line-strong);
  box-shadow: 0 5px 0 var(--line-strong);
  transition: transform 0.1s, box-shadow 0.1s, background 0.2s;
}
.act:hover:not(:disabled) {
  background: linear-gradient(180deg, #fff8e6, #ffe6b8);
}
.act:active:not(:disabled) {
  transform: translateY(4px);
  box-shadow: 0 1px 0 var(--line-strong);
}
.act.sel {
  background: linear-gradient(180deg, #d8f3cf, #b6e8a8);
  border-color: var(--xp-dark);
  box-shadow: 0 5px 0 var(--xp-dark);
}
.act.sel:active:not(:disabled) {
  box-shadow: 0 1px 0 var(--xp-dark);
}
.act:disabled {
  opacity: 0.5;
  cursor: default;
}
.ico {
  font-size: 24px;
}
.lbl {
  font-size: 12px;
  font-weight: 600;
  color: var(--ink);
}
.act .kbd {
  position: absolute;
  top: 5px;
  right: 6px;
}
.act.danger {
  background: linear-gradient(180deg, #ffd0a8, #ffb27a);
  border-color: #e0884a;
  box-shadow: 0 5px 0 #e0884a;
}
.act.danger.sel {
  background: linear-gradient(180deg, #ffbfb0, #ff9b86);
  border-color: var(--hp-dark);
  box-shadow: 0 5px 0 var(--hp-dark);
}
.act.danger:active:not(:disabled) {
  box-shadow: 0 1px 0 #e0884a;
}
.divider {
  width: 3px;
  height: 48px;
  border-radius: 3px;
  background: var(--line);
}
.edit,
.logout {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  background: linear-gradient(180deg, #fffaf0, #ffedd0);
  border: 2px solid var(--line-strong);
  box-shadow: 0 4px 0 var(--line-strong);
  font-size: 19px;
  color: var(--ink-soft);
  transition: transform 0.1s, box-shadow 0.1s, color 0.2s, background 0.2s;
}
.edit.on {
  background: linear-gradient(180deg, #d8f3cf, #b6e8a8);
  border-color: var(--xp-dark);
  box-shadow: 0 4px 0 var(--xp-dark);
}
.edit:active,
.logout:active {
  transform: translateY(3px);
  box-shadow: 0 1px 0 var(--line-strong);
}
.logout:hover {
  color: var(--hp-dark);
}
.logout:active {
  transform: translateY(3px);
  box-shadow: 0 1px 0 var(--line-strong);
}
</style>
