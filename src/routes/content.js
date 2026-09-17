import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/'

async function tmdbRequest(path) {
  const token = process.env.TMDB_READ_ACCESS_TOKEN
  if (!token) {
    const error = new Error('TMDB_READ_ACCESS_TOKEN is not configured')
    error.status = 503
    throw error
  }
  const response = await fetch(`https://api.themoviedb.org/3${path}`, {
    headers: { Authorization: `Bearer ${token}`, accept: 'application/json' },
  })
  const data = await response.json()
  if (!response.ok) {
    const error = new Error(data.status_message || 'TMDB request failed')
    error.status = response.status
    throw error
  }
  return data
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function normalizeGenres(value) {
  const genres = Array.isArray(value) ? value : String(value || '').split(',')
  return [...new Set(genres.map(genre => String(genre).trim()).filter(Boolean))]
}

const episodeInclude = { episodes: { include: { videos: true }, orderBy: { episodeNumber: 'asc' } } }
const seasonInclude = { seasonsData: { include: episodeInclude, orderBy: { seasonNumber: 'asc' } } }

function normalizeSeasons(value) {
  return Array.isArray(value) ? value.map((season, seasonIndex) => ({
    seasonNumber: Number(season.seasonNumber) || seasonIndex + 1,
    title: season.title || null,
    episodes: Array.isArray(season.episodes) ? season.episodes.map((episode, episodeIndex) => ({
      episodeNumber: Number(episode.episodeNumber) || episodeIndex + 1,
      title: String(episode.title || '').trim(),
      description: String(episode.description || '').trim(),
      thumbnailUrl: episode.thumbnailUrl || null,
      duration: episode.duration || null,
      isPublished: episode.isPublished ?? true,
      video: episode.video || null,
    })) : [],
  })) : []
}

async function replaceSeasons(contentId, seasons) {
  await prisma.season.deleteMany({ where: { contentId } })
  const valid = normalizeSeasons(seasons).filter(s => s.episodes.length > 0)
  await Promise.all(valid.map(season =>
    prisma.season.create({ data: {
      contentId, seasonNumber: season.seasonNumber, title: season.title,
      episodes: { create: season.episodes.filter(e => e.title && e.description).map(e => ({
        episodeNumber: e.episodeNumber, title: e.title, description: e.description,
        thumbnailUrl:  e.thumbnailUrl || null, duration: e.duration || null,
        isPublished:   e.isPublished ?? true,
        videos: e.video && (e.video.embedUrl || e.video.playbackUrl) ? { create: {
          provider:    e.video.provider || 'YOUTUBE',
          embedUrl:    e.video.embedUrl || null,
          playbackUrl: e.video.playbackUrl || null,
          isPrimary: true, status: 'READY',
        } } : undefined,
      })) },
    } })
  ))
}

async function makeSlug(title) {
  const base = slugify(title)
  const existing = await prisma.content.findUnique({ where: { slug: base } })
  if (!existing) return base
  return `${base}-${Date.now().toString(36)}`
}

// ── PUBLIC ────────────────────────────────────────────────────

// GET /api/content/tmdb/:type/:id (admin import helper)
router.get('/tmdb/:type/:id', requireAuth, async (req, res) => {
  const type = req.params.type.toLowerCase() === 'tv' ? 'tv' : 'movie'
  const detail = await tmdbRequest(`/${type}/${req.params.id}?append_to_response=credits`)
  const seasonsData = type === 'tv'
    ? (await Promise.all((detail.seasons || []).filter(season => season.season_number > 0).map(async season => {
      const seasonDetail = await tmdbRequest(`/tv/${req.params.id}/season/${season.season_number}`)
      return {
        seasonNumber: season.season_number,
        title: season.name,
        episodes: (seasonDetail.episodes || []).map(episode => ({
          episodeNumber: episode.episode_number,
          title: episode.name,
          description: episode.overview || 'Episode description unavailable.',
          duration: episode.runtime ? `${episode.runtime}m` : '',
          thumbnailUrl: episode.still_path ? `${TMDB_IMAGE_BASE}w300${episode.still_path}` : '',
          isPublished: false,
        })),
      }
    }))).filter(season => season.episodes.length)
    : []

  res.json({
    tmdbId: String(detail.id),
    type: type === 'tv' ? 'SERIES' : 'MOVIE',
    title: detail.title || detail.name || '',
    description: detail.overview || 'Description unavailable.',
    longDescription: detail.overview || '',
    posterUrl: detail.poster_path ? `${TMDB_IMAGE_BASE}w500${detail.poster_path}` : '',
    backdropUrl: detail.backdrop_path ? `${TMDB_IMAGE_BASE}w1280${detail.backdrop_path}` : '',
    year: Number((detail.release_date || detail.first_air_date || '').slice(0, 4)) || null,
    duration: detail.runtime ? `${detail.runtime}m` : '',
    genre: (detail.genres || []).map(genre => genre.name).join(', '),
    rating: detail.adult ? '18+' : '13+',
    imdb: detail.vote_average ? detail.vote_average.toFixed(1) : '',
    director: (detail.credits?.crew || []).find(person => person.job === 'Director')?.name || '',
    cast: (detail.credits?.cast || []).slice(0, 12).map(person => person.name),
    seasons: type === 'tv' ? seasonsData.length : null,
    seasonsData,
  })
})

// GET /api/content
router.get('/', async (req, res) => {
  const { type, genre, search, limit = '50', offset = '0' } = req.query
  const where = {
    isPublished: true,
    ...(type  && { type: type.toUpperCase() }),
    ...(genre && { genre: { contains: genre, mode: 'insensitive' } }),
    ...(search && { OR: [
      { title:       { contains: search, mode: 'insensitive' } },
      { genre:       { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ]}),
  }
  const [items, total] = await Promise.all([
    prisma.content.findMany({
      where,
      include: { videos: { where: { isPrimary: true } }, ...seasonInclude },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit), skip: parseInt(offset),
    }),
    prisma.content.count({ where }),
  ])
  res.json({ items, total })
})

// GET /api/content/:id
router.get('/:id', async (req, res) => {
  const item = await prisma.content.findFirst({
    where: { OR: [{ id: req.params.id }, { slug: req.params.id }], isPublished: true },
    include: { videos: true, ...seasonInclude },
  })
  if (!item) return res.status(404).json({ error: 'Not found' })
  res.json(item)
})

// ── ADMIN ─────────────────────────────────────────────────────

// GET /api/content/admin/all
router.get('/admin/all', requireAuth, async (_req, res) => {
  const items = await prisma.content.findMany({
    include: { videos: true, ...seasonInclude },
    orderBy: { createdAt: 'desc' },
  })
  res.json({ items, total: items.length })
})

// POST /api/content
router.post('/', requireAuth, async (req, res) => {
  const {
    type, title, description, longDescription, posterUrl, backdropUrl, trailerUrl, tmdbId,
    year, duration, genre, rating, imdb, director, cast, tags, badge, seasons,
    isPublished, video, seasonsData,
  } = req.body
  if (!title || !description) return res.status(400).json({ error: 'title and description are required' })
  const genres = normalizeGenres(genre)
  if (genres.length < 3) return res.status(400).json({ error: 'At least 3 genres are required' })

  const slug = await makeSlug(title)
  const item = await prisma.content.create({
    data: {
      type: type?.toUpperCase() || 'MOVIE', title, slug, description,
      tmdbId: tmdbId || null,
      longDescription: longDescription || null,
      posterUrl: posterUrl || null, backdropUrl: backdropUrl || null,
      trailerUrl: trailerUrl || null,
      year: year ? parseInt(year) : null, duration: duration || null,
      genre: genres.join(', ') || null, rating: rating || null, imdb: imdb || null,
      director: director || null, cast: cast || [], tags: tags || [],
      badge: badge || null, seasons: seasons ? parseInt(seasons) : null,
      isPublished: isPublished ?? false,
      ...(video && { videos: { create: {
        provider: video.provider || 'YOUTUBE',
        embedUrl: video.embedUrl || null, playbackUrl: video.playbackUrl || null,
        externalId: video.externalId || null, isPrimary: true, status: 'READY',
      }}}),
    },
    include: { videos: true },
  })
  if (type?.toUpperCase() === 'SERIES') await replaceSeasons(item.id, seasonsData)
  const created = await prisma.content.findUnique({ where: { id: item.id }, include: { videos: true, ...seasonInclude } })
  res.status(201).json(created || item)
})

// PATCH /api/content/:id
router.patch('/:id', requireAuth, async (req, res) => {
  const {
    type, title, description, longDescription, posterUrl, backdropUrl, trailerUrl, tmdbId,
    year, duration, genre, rating, imdb, director, cast, tags, badge, seasons, isPublished,
    video, seasonsData,
  } = req.body
  if (genre !== undefined && normalizeGenres(genre).length < 3) {
    return res.status(400).json({ error: 'At least 3 genres are required' })
  }
  const item = await prisma.content.update({
    where: { id: req.params.id },
    data: {
      ...(type        !== undefined && { type: type.toUpperCase() }),
      ...(tmdbId     !== undefined && { tmdbId: tmdbId || null }),
      ...(title       !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(longDescription !== undefined && { longDescription }),
      ...(posterUrl   !== undefined && { posterUrl }),
      ...(backdropUrl !== undefined && { backdropUrl }),
      ...(trailerUrl  !== undefined && { trailerUrl }),
      ...(year        !== undefined && { year: year ? parseInt(year) : null }),
      ...(duration    !== undefined && { duration }),
      ...(genre       !== undefined && { genre: normalizeGenres(genre).join(', ') || null }),
      ...(rating      !== undefined && { rating }),
      ...(imdb        !== undefined && { imdb }),
      ...(director    !== undefined && { director }),
      ...(cast        !== undefined && { cast }),
      ...(tags        !== undefined && { tags }),
      ...(badge       !== undefined && { badge }),
      ...(seasons     !== undefined && { seasons: seasons ? parseInt(seasons) : null }),
      ...(isPublished !== undefined && { isPublished }),
    },
    include: { videos: true },
  })

  if (video !== undefined) {
    const primary = await prisma.contentVideo.findFirst({
      where: { contentId: req.params.id, isPrimary: true },
    })

    if (video && (video.embedUrl || video.playbackUrl)) {
      const videoData = {
        provider: video.provider || 'YOUTUBE',
        embedUrl: video.embedUrl || null,
        playbackUrl: video.playbackUrl || null,
        externalId: video.externalId || null,
        quality: video.quality || null,
        status: 'READY',
        isPrimary: true,
      }
      if (primary) {
        await prisma.contentVideo.update({ where: { id: primary.id }, data: videoData })
      } else {
        await prisma.contentVideo.create({ data: { ...videoData, contentId: req.params.id } })
      }
    } else {
      await prisma.contentVideo.deleteMany({ where: { contentId: req.params.id, isPrimary: true } })
    }
  }

  if (type?.toUpperCase() === 'SERIES' && seasonsData !== undefined) await replaceSeasons(req.params.id, seasonsData)

  const refreshed = await prisma.content.findUnique({
    where: { id: req.params.id },
    include: { videos: true },
  })
  res.json(refreshed || item)
})

// DELETE /api/content/:id
router.delete('/:id', requireAuth, async (req, res) => {
  await prisma.content.delete({ where: { id: req.params.id } })
  res.json({ success: true })
})

// POST /api/content/:id/videos
router.post('/:id/videos', requireAuth, async (req, res) => {
  const { provider, embedUrl, playbackUrl, externalId, quality, isPrimary } = req.body
  if (!provider) return res.status(400).json({ error: 'provider is required' })
  if (isPrimary) {
    await prisma.contentVideo.updateMany({ where: { contentId: req.params.id }, data: { isPrimary: false } })
  }
  const video = await prisma.contentVideo.create({
    data: {
      contentId: req.params.id, provider: provider.toUpperCase(),
      embedUrl: embedUrl || null, playbackUrl: playbackUrl || null,
      externalId: externalId || null, quality: quality || null,
      isPrimary: isPrimary ?? false, status: 'READY',
    },
  })
  res.status(201).json(video)
})

// DELETE /api/content/:id/videos/:videoId
router.delete('/:id/videos/:videoId', requireAuth, async (req, res) => {
  await prisma.contentVideo.delete({ where: { id: req.params.videoId } })
  res.json({ success: true })
})

export default router
