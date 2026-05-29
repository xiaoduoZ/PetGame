<script setup>
import { computed } from 'vue'
import { store } from '../store.js'

const pet = computed(() => store.pet || {})
const hpPct = computed(() => Math.max(0, Math.min(100, pet.value.hp || 0)))
const xpInLevel = computed(() => (pet.value.xp || 0) % 100)
const moodFace = computed(() => {
  const m = pet.value.mood ?? 5
  if (m >= 5) return '😄'
  if (m >= 4) return '🙂'
  if (m >= 2) return '😐'
  if (m >= 1) return '😟'
  return '😢'
})
</script>

<template>
  <div class="hud panel">
    <div class="head">
      <div class="name">{{ pet.name || 'Mochi' }}</div>
      <div class="lvl">
        <span class="lvl-star">⭐</span>
        <span>Lv.{{ pet.level || 1 }}</span>
      </div>
    </div>

    <div class="meter">
      <div class="bubble hp">❤</div>
      <div class="track">
        <div class="fill hp" :style="{ width: hpPct + '%' }"></div>
      </div>
      <span class="val">{{ pet.hp ?? '–' }}</span>
    </div>

    <div class="meter">
      <div class="bubble xp">✦</div>
      <div class="track">
        <div class="fill xp" :style="{ width: xpInLevel + '%' }"></div>
      </div>
      <span class="val">{{ pet.xp ?? 0 }}</span>
    </div>

    <div class="chips">
      <div class="chip mood">
        <span class="chip-ico">{{ moodFace }}</span>
        <span class="chip-txt">Mood {{ pet.mood ?? '–' }}</span>
      </div>
      <div class="chip streak">
        <span class="chip-ico">🔥</span>
        <span class="chip-txt">Streak {{ pet.streak ?? 0 }}</span>
      </div>
    </div>
    <div class="coins">
      <span class="coin-ico">💰</span>
      <span class="coin-val">{{ pet.coins ?? 0 }}</span>
    </div>
  </div>
</template>

<style scoped>
.hud {
  position: fixed;
  top: 24px;
  left: 24px;
  width: 300px;
  padding: 20px 22px;
  z-index: 5;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 18px;
}
.name {
  font-size: 24px;
  font-weight: 700;
  color: var(--ink);
}
.lvl {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 15px;
  font-weight: 700;
  color: #6b4a16;
  background: linear-gradient(180deg, #ffe07a, var(--mood));
  padding: 5px 12px 5px 9px;
  border-radius: 16px;
  border: 2px solid var(--mood-dark);
  box-shadow: 0 3px 0 var(--mood-dark);
}
.lvl-star {
  font-size: 13px;
}
.meter {
  display: flex;
  align-items: center;
  gap: 11px;
  margin-bottom: 13px;
}
.bubble {
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 50%;
  font-size: 15px;
  color: #fff;
  border: 2px solid rgba(0, 0, 0, 0.12);
}
.bubble.hp {
  background: linear-gradient(180deg, #ff9aa0, var(--hp));
  box-shadow: 0 3px 0 var(--hp-dark);
}
.bubble.xp {
  background: linear-gradient(180deg, #9bdc8c, var(--xp));
  box-shadow: 0 3px 0 var(--xp-dark);
}
.track {
  position: relative;
  flex: 1;
  height: 16px;
  border-radius: 10px;
  background: var(--paper-inset);
  border: 2px solid var(--line-strong);
  overflow: hidden;
}
.fill {
  position: relative;
  height: 100%;
  border-radius: 8px 6px 6px 8px;
  transition: width 0.6s cubic-bezier(0.22, 1, 0.36, 1);
}
.fill::after {
  content: '';
  position: absolute;
  inset: 2px 2px auto 2px;
  height: 4px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.55);
}
.fill.hp {
  background: linear-gradient(180deg, #ff9aa0, var(--hp));
}
.fill.xp {
  background: linear-gradient(180deg, #9bdc8c, var(--xp));
}
.val {
  width: 34px;
  text-align: right;
  font-size: 15px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--ink-soft);
}
.chips {
  display: flex;
  gap: 10px;
  margin-top: 6px;
}
.coins {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  margin-top: 10px;
  padding: 6px 12px;
  border-radius: 14px;
  background: linear-gradient(180deg, #fff1b5, #ffd86b);
  border: 2px solid #d4a73a;
  box-shadow: 0 3px 0 #d4a73a;
}
.coin-ico {
  font-size: 18px;
}
.coin-val {
  font-size: 16px;
  font-weight: 700;
  color: #6b4a0a;
  font-variant-numeric: tabular-nums;
}
.chip {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 7px;
  background: var(--paper-2);
  border: 2px solid var(--line-strong);
  border-radius: 14px;
  padding: 8px 11px;
  box-shadow: 0 3px 0 rgba(180, 140, 90, 0.3);
}
.chip-ico {
  font-size: 17px;
}
.chip-txt {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
}
</style>
