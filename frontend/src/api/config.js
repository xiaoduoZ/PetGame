export const KC_BASE = import.meta.env.VITE_KC_BASE || 'http://localhost:8080'
export const KC_REALM = import.meta.env.VITE_KC_REALM || 'petgame'
export const KC_CLIENT_ID = import.meta.env.VITE_KC_CLIENT_ID || 'petgame-api'

export const INTERACTION_BASE =
  import.meta.env.VITE_INTERACTION_BASE || 'http://localhost:8001'
export const PET_BASE = import.meta.env.VITE_PET_BASE || 'http://localhost:8002'
export const WORLD_BASE = import.meta.env.VITE_WORLD_BASE || 'http://localhost:8003'

export const TOKEN_URL = `${KC_BASE}/realms/${KC_REALM}/protocol/openid-connect/token`
