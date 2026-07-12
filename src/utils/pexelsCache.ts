import { createHash } from "crypto";
import { connection } from "../queues/connection";
import type { PexelsVideo } from "../services/pexels.service";

const SEARCH_TTL_SEC = 60 * 60 * 24 * 7; // 7 days
const CLIP_TTL_SEC = 60 * 60 * 24 * 30; // 30 days

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

export function searchCacheKey(
  query: string,
  orientation = "portrait",
  size = "medium",
): string {
  const raw = `${normalizeQuery(query)}|${orientation}|${size}`;
  const hash = createHash("sha256").update(raw).digest("hex");
  return `pexels:search:v1:${hash}`;
}

export function clipCacheKey(videoId: number): string {
  return `pexels:clip:v1:${videoId}`;
}

export function brollCacheObjectKey(videoId: number): string {
  return `broll-cache/${videoId}.mp4`;
}

export async function getCachedSearch(
  query: string,
): Promise<PexelsVideo[] | null> {
  const raw = await connection.get(searchCacheKey(query));
  if (!raw) return null;
  return JSON.parse(raw) as PexelsVideo[];
}

export async function setCachedSearch(
  query: string,
  videos: PexelsVideo[],
): Promise<void> {
  await connection.set(
    searchCacheKey(query),
    JSON.stringify(videos),
    "EX",
    SEARCH_TTL_SEC,
  );
}

export async function getCachedClipObjectKey(
  videoId: number,
): Promise<string | null> {
  return connection.get(clipCacheKey(videoId));
}

export async function setCachedClipObjectKey(
  videoId: number,
  objectKey: string,
): Promise<void> {
  await connection.set(clipCacheKey(videoId), objectKey, "EX", CLIP_TTL_SEC);
}
