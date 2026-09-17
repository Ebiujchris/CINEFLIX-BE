# Cineflix backend database foundation

This repository now contains the PostgreSQL/Prisma foundation for Cineflix movie metadata and permitted video playback sources.

## Configure Neon locally

1. Copy `.env.example` to `.env`.
2. Set `DATABASE_URL` to your Neon connection string.
3. Run:

```bash
npm install
npm run db:generate
npm run db:push
```

Use `npm run db:studio` to inspect the database locally.

The connection string belongs only in `.env` or your deployment secret manager. Never commit it or expose it in frontend code. For production, use a separate Neon role with the minimum required permissions and signed playback URLs for protected videos.

## TMDB credentials

After generating a new TMDB credential, set these values in `.env`:

```env
TMDB_READ_ACCESS_TOKEN="your_tmdb_v4_read_access_token"
TMDB_API_KEY="your_tmdb_v3_api_key"
```

Keep both credentials private. The Read Access Token is preferred for backend requests; the API key is retained for integrations that require TMDB v3 authentication.