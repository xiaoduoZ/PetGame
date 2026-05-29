<script setup>
import { computed } from 'vue'
import { store } from './store.js'
import PetCanvas from './components/PetCanvas.vue'
import LoginScreen from './components/LoginScreen.vue'
import StatHud from './components/StatHud.vue'
import ActionBar from './components/ActionBar.vue'
import EventFlow from './components/EventFlow.vue'
import EditorPanel from './components/EditorPanel.vue'
import FarmPanel from './components/FarmPanel.vue'

const loggedIn = computed(() => !!store.token)
</script>

<template>
  <PetCanvas v-if="loggedIn" />

  <transition name="fade">
    <LoginScreen v-if="!loggedIn" />
  </transition>

  <template v-if="loggedIn">
    <StatHud />
    <EventFlow v-if="!store.editMode && !store.farmMode" />
    <EditorPanel />
    <FarmPanel />
    <ActionBar />
    <div v-if="store.error" class="toast panel">{{ store.error }}</div>
  </template>
</template>

<style scoped>
.toast {
  position: fixed;
  bottom: 120px;
  left: 50%;
  transform: translateX(-50%);
  padding: 13px 22px;
  color: var(--hp-dark);
  font-weight: 600;
  font-size: 14px;
  z-index: 20;
}
</style>
