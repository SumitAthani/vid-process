# Multi-stage build for optimal image size and security
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Install build dependencies
COPY package*.json tsconfig.json ./
RUN npm ci

# Copy Prisma schema and config
COPY prisma.config.ts ./
COPY prisma ./prisma
ENV DATABASE_URL="postgresql://postgres:postgrespassword@postgres:5432/my_database"
RUN npx prisma generate

# Copy source code and build TypeScript to dist/
COPY src ./src
RUN npm run build

# Production runner stage
FROM node:20-bookworm-slim AS runner

WORKDIR /app

# Install system fonts, fontconfig, and chromium for libass subtitle burn-in and Remotion graphics
RUN apt-get update && apt-get install -y --no-install-recommends \
    fonts-dejavu-core \
    fonts-noto-core \
    fontconfig \
    ca-certificates \
    chromium \
 && rm -rf /var/lib/apt/lists/* \
 && fc-cache -f

ENV NODE_ENV=production
# Fonts for subtitle burn-in via libass on Linux
ENV SUBTITLE_FONTS_DIR=/usr/share/fonts
ENV SUBTITLE_FONT_NAME=DejaVuSans
# Remotion headless browser in Debian container
ENV REMOTION_CHROME_EXECUTABLE=/usr/bin/chromium

# Copy package definitions and install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy Prisma schema, config and generated client
COPY prisma.config.ts ./
COPY prisma ./prisma
ENV DATABASE_URL="postgresql://postgres:postgrespassword@postgres:5432/my_database"
RUN npx prisma generate

# Copy compiled JavaScript and Remotion source from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/remotion ./src/remotion

# Copy production startup script
COPY scripts/start-prod.sh ./scripts/start-prod.sh
RUN chmod +x ./scripts/start-prod.sh

EXPOSE 3000

CMD ["./scripts/start-prod.sh"]
