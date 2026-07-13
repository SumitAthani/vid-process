# vid-process

![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![BullMQ](https://img.shields.io/badge/BullMQ-Redis-DC382D?logo=redis&logoColor=white)

A Node.js/TypeScript backend that converts a talking-head source video into an Instagram/TikTok-ready **9:16 reel** with burned-in subtitles and AI-selected B-roll overlays — fully automated via an async queue pipeline.

---

## What it does

1. **Transcribes** the source video using OpenAI Whisper, producing a transcript and SRT/VTT subtitle files
2. **Extracts B-roll keywords** from the transcript using an LLM, generating a timed manifest of "hot keys"
3. **Fetches stock footage** matching those keywords from Pexels
4. **Crops/pads** the primary video to 9:16 (1080×1920)
5. **Composes** the B-roll overlays onto the cropped video with fade transitions
6. **Burns subtitles** into the final MP4 via FFmpeg/libass

The operator surface is the HTTP API plus [Bull Board](http://localhost:3000/bull/admin/queues). There is no frontend in this repo — clients integrate via presigned upload → create job → poll (or webhook). A planned UI is described in [`docs/FRONTEND_PRD.md`](docs/FRONTEND_PRD.md).

---

## Pipeline

```mermaid
flowchart TB
  subgraph parallel [Start in parallel]
    T[transcription]
    C[crop]
  end
  T --> K[keyword-extraction]
  K --> B[broll]
  B --> R[render]
  C --> R
  R --> L["compose layouts"]
  L --> F["burn subtitles / final reel"]
```

Transcription and crop run in parallel. The render step waits for both tracks before composing layouts and burning in subtitles.

---

## Tech stack

- **API** — Express 4, Zod validation
- **Queue / workers** — BullMQ + Redis (ioredis)
- **Database** — PostgreSQL via Prisma 7
- **Object storage** — MinIO (S3-compatible)
- **Video processing** — FFmpeg + ffprobe (static, libass-enabled)
- **AI / transcription** — OpenAI (Whisper + chat completions)
- **Stock footage** — Pexels API
- **Logging** — Pino + pino-http
- **Queue monitor** — Bull Board

---

## Prerequisites

- **Node.js** 20+
- **Docker** and **Docker Compose** (for Redis, PostgreSQL, MinIO)
- **OpenAI API key**
- **Pexels API key**
- On Linux: a font directory for subtitle burn-in (e.g. `/usr/share/fonts/truetype/dejavu`). The bundled FFmpeg static binary includes libass — no system FFmpeg required.

---

## Getting started

### 1. Clone and install

```bash
git clone https://github.com/your-username/vid-process.git
cd vid-process
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in the required values (see [Environment variables](#environment-variables) below).

### 3. Start infrastructure

```bash
docker-compose up -d
```

This starts MinIO (ports 9000/9001), Redis (6379), and PostgreSQL (5432).

### 4. Run database migrations

```bash
npx prisma migrate deploy
```

### 5. Start the API and workers

```bash
# Development (API + all workers with hot reload)
npm run dev:all

# Or run separately
npm run dev          # API only
npm run worker:all   # All workers
```

The API is available at `http://localhost:3000`. Bull Board is at `http://localhost:3000/bull/admin/queues`.

---

## Environment variables

### Required

| Variable | Description |
|---|---|
| `REDIS_HOST` | Redis hostname |
| `REDIS_PORT` | Redis port |
| `DATABASE_URL` | PostgreSQL connection URL (e.g. `postgresql://user:pass@localhost:5432/mydb`) |
| `MINIO_ENDPOINT` | MinIO hostname |
| `MINIO_PORT` | MinIO API port |
| `MINIO_ACCESS_KEY` | MinIO access key |
| `MINIO_SECRET_KEY` | MinIO secret key |
| `OPEN_AI_API_KEY` | OpenAI API key (Whisper + chat completions) |
| `PEXELS_API_KEY` | Pexels API key |
| `MIN_REQUIRED_HOTKEYS` | Minimum number of B-roll hot keys the LLM must return |
| `MAX_ALLOWED_HOTKEYS` | Maximum number of B-roll hot keys the LLM may return |

### Optional (with defaults)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP server port |
| `NODE_ENV` | `development` | `development` / `production` / `test` |
| `LOG_LEVEL` | `info` | Pino log level |
| `MINIO_USE_SSL` | `false` | Use TLS for MinIO connection |
| `PEXELS_CONCURRENCY` | `3` | Parallel Pexels download slots (max 10) |
| `BROLL_MIN_ON_SCREEN_SEC` | `2.5` | Minimum B-roll clip on-screen duration (seconds) |
| `BROLL_MAX_ON_SCREEN_SEC` | `4` | Maximum B-roll clip on-screen duration (seconds) |
| `CROP_WIDTH` | `1080` | Output video width (px) |
| `CROP_HEIGHT` | `1920` | Output video height (px) |
| `CROP_STRATEGY` | `center` | `center` (smart crop) or `pad` (letterbox/pillarbox) |
| `CROP_PAD_BACKGROUND` | `blur` | Pad background style: `black`, `white`, or `blur` |
| `LAYOUT_TRANSITION_MS` | `250` | B-roll fade transition duration (ms) |
| `SUBTITLE_FONT_SIZE` | `48` | Subtitle font size (24–96) |
| `SUBTITLE_MARGIN_V` | `360` | Subtitle vertical margin (px) |
| `SUBTITLE_MARGIN_L` | `80` | Subtitle left margin (px) |
| `SUBTITLE_MARGIN_R` | `140` | Subtitle right margin (px) |
| `SUBTITLE_FONT_NAME` | `Arial` | Font name for subtitle burn-in |
| `SUBTITLE_FONTS_DIR` | `/System/Library/Fonts/Supplemental` | Directory containing font files for libass. On Linux, set to e.g. `/usr/share/fonts/truetype/dejavu` |
| `JOB_WEBHOOK_URL` | _(empty)_ | Global webhook URL called on job completion/failure |
| `JOB_WEBHOOK_TIMEOUT_MS` | `5000` | Outbound webhook request timeout (ms) |
| `FFMPEG_PATH` | _(bundled static)_ | Override path to FFmpeg binary |
| `FFPROBE_PATH` | _(bundled static)_ | Override path to ffprobe binary |

---

## API reference

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Returns Redis, MinIO, and Postgres health status |
| `POST` | `/api/upload/presigned-upload` | Returns a presigned MinIO PUT URL for uploading a source video |
| `POST` | `/api/jobs` | Create and enqueue a processing job |
| `GET` | `/api/jobs/:id` | Get job status and presigned artifact URLs |
| `GET` | `/bull/admin/queues` | Bull Board queue monitor UI |

### Typical integration flow

```
POST /api/upload/presigned-upload  →  PUT <presignedUrl> (upload video)
POST /api/jobs { objectName, ... } →  { id: "job_abc" }
GET  /api/jobs/job_abc             →  { status: "completed", finalVideoUrl: "..." }
```

### `POST /api/jobs` body

| Field | Type | Required | Description |
|---|---|---|---|
| `objectName` | string | yes | MinIO object key from the presigned upload |
| `cropStrategy` | `center` \| `pad` | no | Override global crop strategy |
| `subtitleFontSize` | number | no | Override subtitle font size |
| `webhookUrl` | string | no | Per-job webhook URL (overrides global) |
| _(see PRD for full schema)_ | | | |

---

## Running workers

Workers are long-running BullMQ consumers. Run them all together or individually:

```bash
npm run worker:all             # All workers via concurrently

npm run worker:transcribe      # Transcription worker
npm run worker:keyword         # Keyword extraction worker
npm run worker:broll           # B-roll fetch worker
npm run worker:crop            # Crop worker
npm run worker:render          # Render / subtitle burn-in worker
```

---

## Storage layout

Three MinIO buckets are created automatically on startup:

| Bucket | Contents |
|---|---|
| `raw-videos` | Uploaded source videos |
| `intermediate-assets` | Extracted audio, transcripts, cropped video, B-roll clips, layout video |
| `final-videos` | Finished 9:16 reel with burned-in subtitles |

---

## Project structure

```
src/
├── index.ts                  # Express entry point
├── config/env.ts             # Zod-validated environment config
├── flows/video.flow.ts       # BullMQ parent/child pipeline definition
├── workers/                  # One worker file per queue step
│   ├── transcribe.worker.ts
│   ├── keyword-extraction.worker.ts
│   ├── broll.worker.ts
│   ├── crop.worker.ts
│   └── render.worker.ts
├── services/                 # Business logic (FFmpeg, OpenAI, Pexels, MinIO, …)
├── routes/                   # Express route handlers
├── queues/                   # BullMQ queue/connection setup
├── types/                    # Shared TypeScript types
└── utils/                    # Helpers (crop, subtitle formatting, layout graph, …)
prisma/
├── schema.prisma             # Job model and step statuses
└── migrations/
docker-compose.yml            # MinIO, Redis, PostgreSQL
```

---

## Documentation

- [`docs/PRD.md`](docs/PRD.md) — full backend specification (pipeline, API contract, data model, error handling)
- [`docs/FRONTEND_PRD.md`](docs/FRONTEND_PRD.md) — planned product UI spec
