import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

interface SongKey {
  name: string;
  artist: string;
  album?: string;
}

export type ReleaseType = "album" | "single" | "ep";

export interface Meta {
  cover: string | null;
  release: { id: string; name: string; type: ReleaseType | null; total: number | null };
}

const cache: Map<string, Meta> = ((globalThis as any).__musicMeta ??= new Map());
const TYPE_SUFFIX = /\s+-\s+(Single|EP)$/i;

export const smallCover = (url: string) =>
  url.replace("/400x400bb", "/200x200bb").replace("/front-500", "/front-250");

const mainArtist = (artist: string) =>
  artist
    .split(/\s+(?:ft\.?|feat\.?|&)\s+|,/i)[0]
    .trim()
    .toLowerCase();

async function fetchOk(url: string, init: RequestInit = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 1500));
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20000) }).catch(() => null);
    if (res?.ok) return res;
  }
  return null;
}

async function itunesMeta(song: SongKey): Promise<Meta | null> {
  const term = encodeURIComponent(`${song.name} ${song.artist}`);
  const res = await fetchOk(`https://itunes.apple.com/search?entity=song&limit=5&term=${term}`);
  if (!res) return null;
  const { results = [] } = await res.json();
  const artist = mainArtist(song.artist);
  const byArtist = results.filter((r: any) => r.artistName?.toLowerCase().includes(artist));
  const hit = byArtist.find((r: any) => r.collectionName === song.album) ?? byArtist[0];
  if (!hit) return null;
  const suffix = hit.collectionName.match(TYPE_SUFFIX)?.[1].toLowerCase();
  return {
    cover: hit.artworkUrl100?.replace("100x100bb", "400x400bb") ?? null,
    release: {
      id: `it:${hit.collectionId}`,
      name: hit.collectionName.replace(TYPE_SUFFIX, ""),
      type: (suffix ?? "album") as ReleaseType,
      total: hit.trackCount ?? null,
    },
  };
}

const COVER_DIR = join(process.cwd(), import.meta.env.DEV ? "public" : "dist", "covers");

async function saveCover(id: string) {
  const file = join(COVER_DIR, `mb-${id}.jpg`);
  if (!existsSync(file)) {
    const res = await fetchOk(`https://coverartarchive.org/release/${id}/front-500`);
    if (!res) return null;
    await mkdir(COVER_DIR, { recursive: true });
    await writeFile(file, Buffer.from(await res.arrayBuffer()));
  }
  return `/covers/mb-${id}.jpg`;
}

let musicBrainzQueue: Promise<unknown> = Promise.resolve();

function musicBrainzMeta(song: SongKey): Promise<Meta | null> {
  const artist = mainArtist(song.artist);
  const title = (song.album || song.name).replace(/"/g, "");
  const query = encodeURIComponent(`release:"${title}" AND artist:"${artist.replace(/"/g, "")}"`);
  const run = musicBrainzQueue.then(async () => {
    const res = await fetchOk(
      `https://musicbrainz.org/ws/2/release/?fmt=json&limit=5&query=${query}`,
      { headers: { "User-Agent": "chawinkn.com/1.0 (https://chawinkn.com)" } }
    );
    if (!res) return null;
    const { releases = [] } = await res.json();
    const matches = releases.filter((r: any) =>
      r["artist-credit"]?.some((a: any) => a.name?.toLowerCase().includes(artist))
    );
    let release = matches[0];
    let cover: string | null = null;
    for (const candidate of matches.slice(0, 3)) {
      const saved = await saveCover(candidate.id);
      if (saved) {
        release = candidate;
        cover = saved;
        break;
      }
    }
    if (!release) return null;
    const type = release["release-group"]?.["primary-type"]?.toLowerCase();
    return {
      cover,
      release: {
        id: `mb:${release.id}`,
        name: release.title,
        type: ["album", "single", "ep"].includes(type) ? (type as ReleaseType) : null,
        total: release["track-count"] ?? null,
      },
    };
  });
  musicBrainzQueue = run.catch(() => {}).then(() => new Promise((r) => setTimeout(r, 1100)));
  return run;
}

export async function getMeta(song: SongKey): Promise<Meta> {
  const key = `${song.name}|${song.artist}`;
  const cached = cache.get(key);
  if (cached) return cached;
  let meta = await itunesMeta(song).catch(() => null);
  if (!meta?.cover) {
    const fallback = await musicBrainzMeta(song).catch(() => null);
    if (fallback && (!meta || fallback.cover))
      meta = meta ? { ...meta, cover: fallback.cover } : fallback;
  }
  if (meta) {
    cache.set(key, meta);
    return meta;
  }
  const name = song.album || song.name;
  return { cover: null, release: { id: `json:${name}`, name, type: null, total: null } };
}
