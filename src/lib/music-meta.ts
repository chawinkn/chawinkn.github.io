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

const normTitle = (title: string) =>
  title
    .toLowerCase()
    .replace(/\s*[(\[](?:feat|ft|with)\b[^)\]]*[)\]]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const sameTrack = (found: string | undefined, wanted: string) => {
  const a = normTitle(found ?? "");
  const b = normTitle(wanted);
  return a === b || a.startsWith(`${b} `);
};

async function itunesSearch(term: string, song: SongKey): Promise<any[]> {
  const res = await fetchOk(
    `https://itunes.apple.com/search?entity=song&limit=25&term=${encodeURIComponent(term)}`
  );
  if (!res) return [];
  const { results = [] } = await res.json();
  const artist = mainArtist(song.artist);
  return results.filter(
    (r: any) => r.artistName?.toLowerCase().includes(artist) && sameTrack(r.trackName, song.name)
  );
}

async function itunesMeta(song: SongKey): Promise<Meta | null> {
  const byArtist = await itunesSearch(`${song.name} ${song.artist}`, song);
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
  const query = encodeURIComponent(
    `recording:"${song.name.replace(/"/g, "")}" AND artist:"${artist.replace(/"/g, "")}"`
  );
  const run = musicBrainzQueue.then(async () => {
    const res = await fetchOk(
      `https://musicbrainz.org/ws/2/recording/?fmt=json&limit=10&query=${query}`,
      { headers: { "User-Agent": "chawinkn.com/1.0 (https://chawinkn.com)" } }
    );
    if (!res) return null;
    const { recordings = [] } = await res.json();
    const wantedAlbum = normTitle(song.album ?? "");
    const wantedName = normTitle(song.name);
    const score = (r: any) =>
      (wantedAlbum && normTitle(r.title) === wantedAlbum ? 8 : 0) +
      (r.status === "Official" ? 4 : 0) +
      (r["release-group"]?.["secondary-types"]?.length ? 0 : 2) +
      (r.exact ? 2 : 0) +
      (r["release-group"]?.["primary-type"] === "Album" ? 1 : 0);
    const matches = recordings
      .filter(
        (rec: any) =>
          sameTrack(rec.title, song.name) &&
          rec["artist-credit"]?.some((a: any) => a.name?.toLowerCase().includes(artist))
      )
      .flatMap((rec: any) =>
        (rec.releases ?? []).map((r: any) => ({ ...r, exact: normTitle(rec.title) === wantedName }))
      )
      .filter((r: any, i: number, all: any[]) => all.findIndex((x) => x.id === r.id) === i)
      .sort((a: any, b: any) => score(b) - score(a));
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
  const key = `${song.name}|${song.artist}|${song.album ?? ""}`;
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
