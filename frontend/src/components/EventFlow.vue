<script setup>
import { computed } from 'vue'
import { store, STAGES } from '../store.js'

const nodes = [
  { key: 'interaction-service', label: 'interaction', port: ':8001', ico: '📡' },
  { key: 'rabbitmq', label: 'RabbitMQ', port: 'events', ico: '🐇' },
  { key: 'pet-service', label: 'pet', port: ':8002', ico: '🐾' }
]

const activeStage = computed(() => (store.flow ? store.flow.stage : -1))
const flowing = computed(() => !!store.flow)
const routingKey = computed(() => (store.flow ? store.flow.event.event_type : null))
const packetLeft = computed(() =>
  store.flow ? (store.flow.stage / (STAGES.length - 1)) * 100 : 0
)

function deltaText(e) {
  const parts = []
  if (e.hp_delta != null) parts.push(`HP ${e.hp_delta >= 0 ? '+' : ''}${e.hp_delta}`)
  if (e.xp_reward != null) parts.push(`XP +${e.xp_reward}`)
  if (e.mood_delta != null) parts.push(`Mood ${e.mood_delta}`)
  return parts.join(' · ')
}
function shortType(t) {
  return (t || '').replace('interaction.', '')
}
function timeText(ts) {
  return new Date(ts).toLocaleTimeString([], { hour12: false })
}
</script>

<template>
  <div class="flow panel">
    <div class="flow-head">
      <span class="title">🌿 Service Flow</span>
      <span class="mode" :class="store.mode">
        {{ store.mode === 'live' ? 'LIVE' : 'DEMO' }}
      </span>
    </div>

    <div class="pipeline">
      <div class="rail">
        <div class="rail-fill" :class="{ on: flowing }"></div>
        <div v-if="flowing" class="packet" :style="{ left: packetLeft + '%' }"></div>
      </div>

      <div class="nodes">
        <div
          v-for="(n, i) in nodes"
          :key="n.key"
          class="node"
          :class="{ active: activeStage === i, past: flowing && activeStage > i }"
        >
          <div class="node-ico">{{ n.ico }}</div>
          <div class="node-label">{{ n.label }}</div>
          <div class="node-port">{{ n.port }}</div>
        </div>
      </div>

      <div class="routing" :class="{ show: flowing }">
        <code>{{ routingKey || ' ' }}</code>
      </div>
    </div>

    <div class="log">
      <div v-if="!store.events.length" class="empty">
        Tap an action to watch an event hop along the path 🐾
      </div>
      <transition-group name="logitem">
        <div
          v-for="e in store.events"
          :key="e.event_id || e.at"
          class="log-row"
          :class="{
            ok: e.event_type === 'interaction.ok',
            missed: e.event_type === 'interaction.missed',
            done: e.event_type === 'interaction.completed'
          }"
        >
          <span class="dot"></span>
          <span class="etype">{{ shortType(e.event_type) || e.note }}</span>
          <span v-if="e.template_id" class="tmpl">{{ e.template_id }}</span>
          <span class="delta">{{ deltaText(e) }}</span>
          <span class="ts">{{ timeText(e.at) }}</span>
        </div>
      </transition-group>
    </div>
  </div>
</template>

<style scoped>
.flow {
  position: fixed;
  top: 24px;
  right: 24px;
  width: 350px;
  padding: 20px 22px 18px;
  z-index: 5;
}
.flow-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
.title {
  font-size: 17px;
  font-weight: 700;
  color: var(--ink);
}
.mode {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.5px;
  padding: 3px 11px;
  border-radius: 12px;
  border: 2px solid;
}
.mode.live {
  color: #2f7d3f;
  background: #d9f3d0;
  border-color: #8fce7e;
}
.mode.demo {
  color: #9c6010;
  background: #ffe7bd;
  border-color: var(--mood-dark);
}
.pipeline {
  position: relative;
  margin-bottom: 16px;
}
.rail {
  position: absolute;
  top: 23px;
  left: 30px;
  right: 30px;
  height: 4px;
  border-radius: 3px;
  background-image: linear-gradient(90deg, var(--line-strong) 60%, transparent 0);
  background-size: 12px 4px;
  background-repeat: repeat-x;
}
.rail-fill {
  position: absolute;
  inset: 0;
  border-radius: 3px;
  background: var(--leaf);
  opacity: 0;
  transition: opacity 0.3s;
}
.rail-fill.on {
  opacity: 0.85;
}
.packet {
  position: absolute;
  top: 50%;
  width: 18px;
  height: 18px;
  margin-left: -9px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #fff6c0, var(--mood));
  border: 2px solid var(--mood-dark);
  box-shadow: 0 0 12px 3px rgba(255, 194, 61, 0.7);
  transform: translateY(-50%);
  transition: left 0.6s cubic-bezier(0.5, 0, 0.5, 1);
}
.nodes {
  display: flex;
  justify-content: space-between;
  position: relative;
}
.node {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 84px;
  text-align: center;
}
.node-ico {
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  font-size: 23px;
  border-radius: 16px;
  background: linear-gradient(180deg, #fffaf0, #ffe9c6);
  border: 2px solid var(--line-strong);
  box-shadow: 0 4px 0 var(--line-strong);
  transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
}
.node.active .node-ico {
  border-color: var(--xp-dark);
  background: linear-gradient(180deg, #eafbe2, #c6efb6);
  box-shadow: 0 4px 0 var(--xp-dark), 0 0 18px rgba(123, 200, 108, 0.7);
  transform: translateY(-3px) scale(1.08);
}
.node.past .node-ico {
  border-color: var(--xp-dark);
  box-shadow: 0 4px 0 var(--xp-dark);
}
.node-label {
  font-size: 12px;
  font-weight: 700;
  margin-top: 9px;
  color: var(--ink);
}
.node-port {
  font-size: 10px;
  color: var(--ink-soft);
}
.routing {
  text-align: center;
  font-size: 11px;
  margin-top: 12px;
  height: 16px;
  opacity: 0;
  transition: opacity 0.3s;
}
.routing.show {
  opacity: 1;
}
.routing code {
  color: var(--xp-dark);
  background: #eafbe2;
  padding: 2px 8px;
  border-radius: 8px;
  font-weight: 600;
}
.log {
  border-top: 2px dashed var(--line);
  padding-top: 12px;
  max-height: 188px;
  overflow-y: auto;
}
.empty {
  font-size: 13px;
  color: var(--ink-soft);
  line-height: 1.5;
  text-align: center;
  padding: 10px 4px;
}
.log-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 0;
  font-size: 12px;
  border-bottom: 1px solid var(--line);
}
.dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--leaf);
  border: 1.5px solid var(--xp-dark);
  flex-shrink: 0;
}
.log-row.missed .dot {
  background: var(--hp);
  border-color: var(--hp-dark);
}
.log-row.ok .dot {
  background: var(--line);
  border-color: var(--line-strong);
}
.etype {
  font-weight: 700;
  text-transform: capitalize;
  color: var(--ink);
}
.log-row.missed .etype {
  color: var(--hp-dark);
}
.tmpl {
  color: var(--wood);
  font-size: 11px;
  font-weight: 600;
}
.delta {
  color: var(--ink-soft);
  margin-left: auto;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.ts {
  color: var(--ink-soft);
  font-size: 10px;
  opacity: 0.7;
  width: 52px;
  text-align: right;
}
.logitem-enter-active {
  transition: all 0.4s ease;
}
.logitem-enter-from {
  opacity: 0;
  transform: translateX(20px);
}
</style>
