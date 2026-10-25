#!/bin/sh
set -e

echo "=== Running Database Migrations ==="
npx prisma migrate deploy

echo "=== Starting BullMQ Background Workers (Unified Runner) ==="
node dist/workers/index.js &

echo "=== Starting Express API Server on port ${PORT:-3000} ==="
exec node dist/index.js
