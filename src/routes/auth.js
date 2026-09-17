import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import prisma from '../lib/prisma.js'

const router = Router()
const SECRET = process.env.JWT_SECRET || 'cineflix-secret-change-me'

// POST /api/auth/setup — create first admin only
router.post('/setup', async (req, res) => {
  const count = await prisma.adminUser.count()
  if (count > 0) return res.status(403).json({ error: 'Admin already exists' })

  const { email, password, name } = req.body
  if (!email || !password || !name)
    return res.status(400).json({ error: 'email, password and name are required' })

  const passwordHash = await bcrypt.hash(password, 12)
  const admin = await prisma.adminUser.create({ data: { email, passwordHash, name } })
  res.status(201).json({ id: admin.id, email: admin.email, name: admin.name })
})

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body
  if (!email || !password)
    return res.status(400).json({ error: 'email and password required' })

  const admin = await prisma.adminUser.findUnique({ where: { email } })
  if (!admin) return res.status(401).json({ error: 'Invalid credentials' })

  const valid = await bcrypt.compare(password, admin.passwordHash)
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' })

  const token = jwt.sign(
    { id: admin.id, email: admin.email, name: admin.name },
    SECRET,
    { expiresIn: '7d' }
  )
  res.json({ token, admin: { id: admin.id, email: admin.email, name: admin.name } })
})

export default router
