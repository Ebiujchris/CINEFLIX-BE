export function errorHandler(err, _req, res, _next) {
  console.error(err)
  const status = err.status || err.statusCode || (err.code === 'P1001' || err.code === 'P2021' ? 503 : 500)
  res.status(status).json({ error: err.message || 'Internal server error' })
}
