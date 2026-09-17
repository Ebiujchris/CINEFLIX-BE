import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dir, '../../data')
const CONTENT_FILE = join(DATA_DIR, 'content.json')
const USERS_FILE   = join(DATA_DIR, 'users.json')

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
}

function read(file) {
  ensureDir()
  if (!existsSync(file)) return []
  try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return [] }
}

function write(file, data) {
  ensureDir()
  writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

// ── Users ─────────────────────────────────────────────────────
export const users = {
  all:    ()      => read(USERS_FILE),
  find:   (email) => read(USERS_FILE).find(u => u.email === email),
  count:  ()      => read(USERS_FILE).length,
  create: (data)  => {
    const list = read(USERS_FILE)
    const user = { id: uid(), createdAt: new Date().toISOString(), ...data }
    list.push(user)
    write(USERS_FILE, list)
    return user
  },
}

// ── Content ───────────────────────────────────────────────────
export const content = {
  all: () => read(CONTENT_FILE),

  find: (id) => read(CONTENT_FILE).find(c => c.id === id || c.slug === id),

  list: ({ type, genre, search, isPublished, limit = 50, offset = 0 } = {}) => {
    let items = read(CONTENT_FILE)
    if (isPublished !== undefined) items = items.filter(c => c.isPublished === isPublished)
    if (type)   items = items.filter(c => c.type === type.toUpperCase())
    if (genre)  items = items.filter(c => (c.genre || '').toLowerCase().includes(genre.toLowerCase()))
    if (search) {
      const q = search.toLowerCase()
      items = items.filter(c =>
        c.title.toLowerCase().includes(q) ||
        (c.genre || '').toLowerCase().includes(q) ||
        (c.description || '').toLowerCase().includes(q)
      )
    }
    items = items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    return { items: items.slice(offset, offset + limit), total: items.length }
  },

  create: (data) => {
    const list = read(CONTENT_FILE)
    const item = {
      id: uid(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      videos: [],
      cast: [],
      tags: [],
      isPublished: false,
      ...data,
    }
    list.push(item)
    write(CONTENT_FILE, list)
    return item
  },

  update: (id, data) => {
    const list = read(CONTENT_FILE)
    const idx  = list.findIndex(c => c.id === id)
    if (idx === -1) return null
    list[idx] = { ...list[idx], ...data, updatedAt: new Date().toISOString() }
    write(CONTENT_FILE, list)
    return list[idx]
  },

  delete: (id) => {
    const list = read(CONTENT_FILE)
    const next = list.filter(c => c.id !== id)
    write(CONTENT_FILE, next)
    return next.length < list.length
  },

  addVideo: (contentId, videoData) => {
    const list = read(CONTENT_FILE)
    const idx  = list.findIndex(c => c.id === contentId)
    if (idx === -1) return null
    if (videoData.isPrimary) {
      list[idx].videos = (list[idx].videos || []).map(v => ({ ...v, isPrimary: false }))
    }
    const video = { id: uid(), createdAt: new Date().toISOString(), status: 'READY', ...videoData }
    list[idx].videos = [...(list[idx].videos || []), video]
    list[idx].updatedAt = new Date().toISOString()
    write(CONTENT_FILE, list)
    return video
  },

  removeVideo: (contentId, videoId) => {
    const list = read(CONTENT_FILE)
    const idx  = list.findIndex(c => c.id === contentId)
    if (idx === -1) return false
    list[idx].videos = (list[idx].videos || []).filter(v => v.id !== videoId)
    write(CONTENT_FILE, list)
    return true
  },
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export function makeSlug(title) {
  const base = slugify(title)
  const all  = read(CONTENT_FILE)
  if (!all.find(c => c.slug === base)) return base
  return `${base}-${Date.now().toString(36)}`
}
