import jwt from 'jsonwebtoken'

export function requireUser(req, res, next) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Sign in required' })
  }

  try {
    const token = header.slice(7)
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'cineflix-secret-change-me')
    if (payload.role !== 'user') return res.status(401).json({ error: 'Invalid user session' })
    req.user = payload
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' })
  }
}
