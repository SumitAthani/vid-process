#!/bin/sh
set -e

echo "=== Running Database Migrations ==="
npx prisma migrate deploy

echo "=== Starting BullMQ Background Workers ==="
node dist/workers/transcribe.worker.js &
node dist/workers/keyword-extraction.worker.js &
node dist/workers/broll.worker.js &
node dist/workers/crop.worker.js &
node dist/workers/render.worker.js &

echo "=== Starting Express API Server on port ${PORT:-3000} ==="
exec node dist/index.js
