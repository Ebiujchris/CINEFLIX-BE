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

const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:5173',
  process.env.ADMIN_URL    || 'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
]
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) cb(null, true)
    else {
      const error = new Error(`CORS blocked: ${origin}`)
      error.status = 403
      cb(error)
    }
  },
  credentials: true,
}))
app.use(express.json())

app.get('/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }))

app.use('/api/auth',    authRouter)
app.use('/api/content', contentRouter)

app.use(errorHandler)

app.listen(PORT, () => console.log(`CINEFLIX API running on http://localhost:${PORT}`))
