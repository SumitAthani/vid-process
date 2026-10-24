# Multi-stage build for optimal image size and security
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Install build dependencies
COPY package*.json tsconfig.json ./
RUN npm ci

# Copy Prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma generate

# Copy source code and build TypeScript to dist/
COPY src ./src
RUN npm run build

# Production runner stage
FROM node:20-bookworm-slim AS runner

WORKDIR /app

# Install system fonts and fontconfig for libass subtitle burn-in
RUN apt-get update && apt-get install -y --no-install-recommends \
    fonts-dejavu-core \
    fontconfig \
    ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && fc-cache -f

ENV NODE_ENV=production
# Fonts for subtitle burn-in via libass on Linux
ENV SUBTITLE_FONTS_DIR=/usr/share/fonts/truetype/dejavu
ENV SUBTITLE_FONT_NAME=DejaVuSans

# Copy package definitions and install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy Prisma schema and generated client
COPY prisma ./prisma
RUN npx prisma generate

# Copy compiled JavaScript from builder stage
COPY --from=builder /app/dist ./dist

# Copy production startup script
COPY scripts/start-prod.sh ./scripts/start-prod.sh
RUN chmod +x ./scripts/start-prod.sh

EXPOSE 3000

CMD ["./scripts/start-prod.sh"]
