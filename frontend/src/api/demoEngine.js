// A faithful in-browser clone of the backend rules, used when the real
// services are unreachable. Mirrors pet-service/app/mq_consumer.py exactly so
// the demo behaves like the real thing.

const STORAGE_KEY = 'petgame.demo.pet'
const MAP_KEY = 'petgame.demo.map'
const FARM_KEY = 'petgame.demo.farm'

function uuid() {
  return (crypto.randomUUID && crypto.randomUUID()) || `demo-${Date.now()}-${Math.random()}`
}

function freshPet(userId) {
  return {
    id: 1,
    user_id: userId,
    name: 'Mochi',
    hp: 100,
    xp: 0,
    level: 1,
    mood: 5,
    streak: 0,
    coins: 200
  }
}

function load(userId) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const p = JSON.parse(raw)
      if (p.user_id === userId) return p
    }
  } catch (e) {
    /* ignore */
  }
  const p = freshPet(userId)
  save(p)
  return p
}

function save(pet) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pet))
}

export const demo = {
  login(username) {
    return `demo-token.${btoa(username || 'demo')}.local`
  },

  getPet(userId) {
    return { ...load(userId) }
  },

  complete(userId, templateId) {
    const event = {
      event_id: uuid(),
      event_type: 'interaction.completed',
      user_id: userId,
      template_id: templateId,
      completed_at: new Date().toISOString(),
      hp_delta: 5,
      xp_reward: 10,
      coin_reward: 5
    }
    const pet = load(userId)
    pet.hp += event.hp_delta
    pet.xp += event.xp_reward
    pet.coins = (pet.coins || 0) + event.coin_reward
    pet.level = Math.floor(pet.xp / 100) + 1
    save(pet)
    return {
      id: Math.floor(Math.random() * 100000),
      user_id: userId,
      template_id: templateId,
      completed_at: event.completed_at,
      day_key: event.completed_at.slice(0, 10),
      published_event: event
    }
  },

  checkMissed(userId) {
    // The demo has no persistent daily log, so treat "missed" as the punitive
    // path to let users see the negative branch of the flow.
    const day_key = new Date().toISOString().slice(0, 10)
    const event = {
      event_id: uuid(),
      event_type: 'interaction.missed',
      user_id: userId,
      day_key,
      hp_delta: -10,
      mood_delta: -1
    }
    const pet = load(userId)
    pet.hp = Math.max(0, pet.hp + event.hp_delta)
    pet.mood = Math.max(0, pet.mood + event.mood_delta)
    pet.streak = 0
    save(pet)
    return { user_id: userId, day_key, missed: true, published_event: event }
  },

  spendCoins(userId, amount) {
    const pet = load(userId)
    if ((pet.coins || 0) < amount) {
      const e = new Error('insufficient coins')
      e.status = 402
      throw e
    }
    pet.coins -= amount
    save(pet)
    return { ...pet }
  },

  earnCoins(userId, coins, xp) {
    const pet = load(userId)
    pet.coins = (pet.coins || 0) + Math.max(0, coins || 0)
    pet.xp = (pet.xp || 0) + Math.max(0, xp || 0)
    pet.level = Math.floor(pet.xp / 100) + 1
    save(pet)
    return { ...pet }
  },

  getMap() {
    try {
      const raw = localStorage.getItem(MAP_KEY)
      return raw ? JSON.parse(raw) : null
    } catch (e) {
      return null
    }
  },

  saveMap(data) {
    localStorage.setItem(MAP_KEY, JSON.stringify(data))
  },

  getFarm() {
    try {
      const raw = localStorage.getItem(FARM_KEY)
      return raw ? JSON.parse(raw) : []
    } catch (e) {
      return []
    }
  },

  saveFarm(crops) {
    localStorage.setItem(FARM_KEY, JSON.stringify(crops))
  },

  reset() {
    localStorage.removeItem(STORAGE_KEY)
  }
}
