import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL },
  },
  log: ['error'],
})

// keep connection alive — Neon pauses on inactivity
async function keepAlive() {
  try { await prisma.$queryRaw`SELECT 1` } catch { /* silent */ }
}
setInterval(keepAlive, 4 * 60 * 1000) // ping every 4 minutes

export default prisma
