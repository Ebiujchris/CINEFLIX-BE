import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import prisma from '../lib/prisma.js'
import { requireUser } from '../middleware/userAuth.js'

const router = Router()
const SECRET = process.env.JWT_SECRET || 'cineflix-secret-change-me'

function publicUser(user) {
  return { id: user.id, email: user.email, name: user.name }
}

function tokenFor(user) {
  return jwt.sign({ id: user.id, email: user.email, name: user.name, role: 'user' }, SECRET, { expiresIn: '30d' })
}

function validatePassword(password) {
  return typeof password === 'string' && password.length >= 8
}

router.post('/signup', async (req, res) => {
  const name = String(req.body.name || '').trim()
  const email = String(req.body.email || '').trim().toLowerCase()
  const password = req.body.password
  if (!name || !email || !validatePassword(password)) {
    return res.status(400).json({ error: 'Name, email, and a password of at least 8 characters are required' })
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return res.status(409).json({ error: 'An account with that email already exists' })

  const user = await prisma.user.create({
    data: { name, email, passwordHash: await bcrypt.hash(password, 12) },
  })
  res.status(201).json({ token: tokenFor(user), user: publicUser(user) })
})

router.post('/login', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase()
  const password = req.body.password
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' })

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: 'Invalid email or password' })
  }
  res.json({ token: tokenFor(user), user: publicUser(user) })
})

router.get('/me', requireUser, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { id: true, email: true, name: true } })
  if (!user) return res.status(404).json({ error: 'Account not found' })
  res.json({ user })
})

router.get('/me/library', requireUser, async (req, res) => {
  const [watchlist, progress] = await Promise.all([
    prisma.watchlistItem.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' }, select: { contentId: true } }),
    prisma.watchProgress.findMany({ where: { userId: req.user.id }, orderBy: { updatedAt: 'desc' } }),
  ])
  res.json({ watchlist: watchlist.map(item => item.contentId), progress })
})

router.put('/me/watchlist/:contentId', requireUser, async (req, res) => {
  const contentId = req.params.contentId
  const content = await prisma.content.findFirst({ where: { id: contentId, isPublished: true }, select: { id: true } })
  if (!content) return res.status(404).json({ error: 'Content not found' })
  await prisma.watchlistItem.upsert({
    where: { userId_contentId: { userId: req.user.id, contentId } },
    create: { userId: req.user.id, contentId },
    update: {},
  })
  res.status(204).end()
})

router.delete('/me/watchlist/:contentId', requireUser, async (req, res) => {
  await prisma.watchlistItem.deleteMany({ where: { userId: req.user.id, contentId: req.params.contentId } })
  res.status(204).end()
})

router.put('/me/progress', requireUser, async (req, res) => {
  const contentId = String(req.body.contentId || '')
  const episodeId = req.body.episodeId ? String(req.body.episodeId) : ''
  const position = Math.max(0, Math.floor(Number(req.body.position) || 0))
  const duration = Math.max(0, Math.floor(Number(req.body.duration) || 0))
  if (!contentId) return res.status(400).json({ error: 'contentId is required' })

  const content = await prisma.content.findFirst({ where: { id: contentId, isPublished: true }, select: { id: true } })
  if (!content) return res.status(404).json({ error: 'Content not found' })

  const completed = duration > 0 && position >= Math.max(duration - 30, duration * 0.95)
  const progress = await prisma.watchProgress.upsert({
    where: { userId_contentId_episodeId: { userId: req.user.id, contentId, episodeId } },
    create: { userId: req.user.id, contentId, episodeId, position, duration, completed },
    update: { position, duration, completed },
  })
  res.json({ progress })
})

router.delete('/me/progress/:contentId', requireUser, async (req, res) => {
  await prisma.watchProgress.deleteMany({ where: { userId: req.user.id, contentId: req.params.contentId } })
  res.status(204).end()
})

export default router
