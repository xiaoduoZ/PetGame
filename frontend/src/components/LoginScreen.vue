<script setup>
import { ref } from 'vue'
import { store, doLogin } from '../store.js'

const username = ref('demo')
const password = ref('demo')

async function submit() {
  await doLogin(username.value, password.value)
}
</script>

<template>
  <div class="login-wrap">
    <div class="panel card">
      <div class="brand">
        <span class="paw">🐾</span>
        <h1>PetGame</h1>
        <p class="sub">Mochi Island · a living microservice playground</p>
      </div>

      <form @submit.prevent="submit">
        <label>
          <span>Username</span>
          <input v-model="username" autocomplete="username" />
        </label>
        <label>
          <span>Password</span>
          <input v-model="password" type="password" autocomplete="current-password" />
        </label>

        <button class="primary" :disabled="store.loading">
          {{ store.loading ? 'Connecting…' : 'Enter Island' }}
        </button>

        <p v-if="store.error" class="err">{{ store.error }}</p>
        <p class="hint">
          Connects to Keycloak &amp; the live services first. If they're offline,
          you'll drop into a faithful demo automatically.
        </p>
      </form>
    </div>
  </div>
</template>

<style scoped>
.login-wrap {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  z-index: 10;
}
.card {
  width: 380px;
  max-width: 90vw;
  padding: 36px 32px;
}
.brand {
  text-align: center;
  margin-bottom: 24px;
}
.paw {
  font-size: 46px;
  display: inline-block;
  animation: bob 2.4s ease-in-out infinite;
}
@keyframes bob {
  0%,
  100% {
    transform: translateY(0) rotate(-4deg);
  }
  50% {
    transform: translateY(-8px) rotate(4deg);
  }
}
.brand h1 {
  font-size: 38px;
  font-weight: 700;
  letter-spacing: 0.5px;
  margin-top: 6px;
  color: var(--wood-dark);
}
.sub {
  color: var(--ink-soft);
  font-size: 14px;
  font-weight: 500;
  margin-top: 6px;
}
form {
  display: flex;
  flex-direction: column;
  gap: 15px;
}
label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--ink-soft);
}
input {
  background: #fffdf7;
  border: 2px solid var(--line-strong);
  border-radius: 14px;
  padding: 12px 14px;
  color: var(--ink);
  font-family: var(--font);
  font-weight: 600;
  font-size: 16px;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}
input:focus {
  border-color: var(--xp-dark);
  box-shadow: 0 0 0 3px rgba(123, 200, 108, 0.25);
}
.primary {
  margin-top: 8px;
  padding: 14px;
  border-radius: 16px;
  font-size: 17px;
  font-weight: 700;
  color: #2c5520;
  background: linear-gradient(180deg, #a6e294, var(--xp));
  border: 2px solid var(--xp-dark);
  box-shadow: 0 5px 0 var(--xp-dark);
  transition: transform 0.1s, box-shadow 0.1s, filter 0.2s;
}
.primary:hover:not(:disabled) {
  filter: brightness(1.04);
}
.primary:active:not(:disabled) {
  transform: translateY(4px);
  box-shadow: 0 1px 0 var(--xp-dark);
}
.primary:disabled {
  opacity: 0.6;
  cursor: default;
}
.err {
  color: var(--hp-dark);
  font-size: 13px;
  font-weight: 600;
}
.hint {
  color: var(--ink-soft);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.55;
}
</style>
