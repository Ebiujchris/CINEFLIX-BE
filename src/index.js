import 'express-async-errors'
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import authRouter from './routes/auth.js'
import contentRouter from './routes/content.js'
import { errorHandler } from './middleware/errorHandler.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 4000

const normalizeOrigin = (value) => {
  if (!value) return ''
  try { return new URL(value).origin } catch { return value.replace(/\/+$/, '') }
}

const allowedOrigins = new Set([
  normalizeOrigin(process.env.FRONTEND_URL || 'http://localhost:5173'),
  normalizeOrigin(process.env.ADMIN_URL || 'http://localhost:5174'),
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://localhost:5173',
  'http://localhost:5174',
])

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.has(origin) || origin.endsWith('.vercel.app')) {
      cb(null, true)
      return
    }

    const error = new Error(`CORS blocked: ${origin}`)
    error.status = 403
    cb(error)
  },
  credentials: true,
}))
app.use(express.json())

app.get('/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }))

app.use('/api/auth',    authRouter)
app.use('/api/content', contentRouter)

app.use(errorHandler)

app.listen(PORT, () => console.log(`CINEFLIX API running on http://localhost:${PORT}`))
