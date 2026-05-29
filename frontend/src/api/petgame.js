import {
  TOKEN_URL,
  KC_CLIENT_ID,
  INTERACTION_BASE,
  PET_BASE,
  WORLD_BASE
} from './config.js'

// Thrown when the backend can't be reached, so the store can fall back to demo.
export class BackendUnreachable extends Error {}

async function fetchWithTimeout(url, options = {}, timeout = 6000) {
  const ctrl = new AbortController()
  const id = setTimeout(() => ctrl.abort(), timeout)
  try {
    return await fetch(url, { ...options, signal: ctrl.signal })
  } catch (e) {
    throw new BackendUnreachable(e.message)
  } finally {
    clearTimeout(id)
  }
}

export async function login(username, password) {
  const body = new URLSearchParams({
    client_id: KC_CLIENT_ID,
    username,
    password,
    grant_type: 'password'
  })
  const resp = await fetchWithTimeout(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    const err = new Error(`Login failed (${resp.status}): ${text || 'check credentials'}`)
    err.status = resp.status
    throw err
  }
  return await resp.json() // { access_token, refresh_token, expires_in, ... }
}

export async function refreshAccessToken(refreshToken) {
  const body = new URLSearchParams({
    client_id: KC_CLIENT_ID,
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  })
  const resp = await fetchWithTimeout(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    const err = new Error(`Refresh failed (${resp.status}): ${text}`)
    err.status = resp.status
    throw err
  }
  return await resp.json()
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

async function asJson(resp) {
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    const err = new Error(`HTTP ${resp.status}: ${text}`)
    err.status = resp.status
    throw err
  }
  const text = await resp.text()
  return text ? JSON.parse(text) : null
}

export async function getPet(token) {
  const resp = await fetchWithTimeout(`${PET_BASE}/api/v1/pet/me`, {
    headers: authHeaders(token)
  })
  return asJson(resp)
}

export async function spendCoins(token, amount) {
  const resp = await fetchWithTimeout(`${PET_BASE}/api/v1/pet/spend`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ amount })
  })
  return asJson(resp)
}

export async function earnCoins(token, coins, xp) {
  const resp = await fetchWithTimeout(`${PET_BASE}/api/v1/pet/earn`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ coins, xp })
  })
  return asJson(resp)
}

export async function getFarm(token) {
  const resp = await fetchWithTimeout(`${WORLD_BASE}/api/v1/farm/me`, {
    headers: authHeaders(token)
  })
  return asJson(resp)
}

export async function saveFarm(token, crops) {
  const resp = await fetchWithTimeout(`${WORLD_BASE}/api/v1/farm/me`, {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify({ crops })
  })
  return asJson(resp)
}

export async function completeInteraction(token, templateId) {
  const resp = await fetchWithTimeout(`${INTERACTION_BASE}/api/v1/interactions/complete`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ template_id: templateId })
  })
  return asJson(resp)
}

export async function checkMissed(token) {
  const resp = await fetchWithTimeout(
    `${INTERACTION_BASE}/api/v1/interactions/check-missed`,
    { method: 'POST', headers: authHeaders(token) }
  )
  return asJson(resp)
}

export async function getMap(token) {
  const resp = await fetchWithTimeout(`${WORLD_BASE}/api/v1/map/me`, {
    headers: authHeaders(token)
  })
  return asJson(resp)
}

export async function saveMap(token, data) {
  const resp = await fetchWithTimeout(`${WORLD_BASE}/api/v1/map/me`, {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify({ data })
  })
  return asJson(resp)
}
