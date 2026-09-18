import 'express-async-errors'
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import authRouter from './routes/auth.js'
import userRouter from './routes/users.js'
import contentRouter from './routes/content.js'
import { errorHandler } from './middleware/errorHandler.js'

dotenv.config()

const app = express()

app.use(cors({
  origin: (origin, cb) => {
    // allow all vercel.app domains + localhost
    if (
      !origin ||
      origin.endsWith('.vercel.app') ||
      origin.startsWith('http://localhost') ||
      origin.startsWith('http://127.0.0.1')
    ) {
      return cb(null, true)
    }
    cb(new Error(`CORS blocked: ${origin}`))
  },
  credentials: true,
}))

// handle preflight for all routes
app.options('*', cors())

app.use(express.json())

app.get('/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }))

app.use('/api/auth',    authRouter)
app.use('/api/users',   userRouter)
app.use('/api/content', contentRouter)

app.use(errorHandler)

// local dev
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 4000
  app.listen(PORT, () => console.log(`CINEFLIX API running on http://localhost:${PORT}`))
}

// Vercel serverless export
export default app
