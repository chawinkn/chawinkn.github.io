# chawinkn.com

Personal site of Chawin Chaisongkram (Kanoon), live at [chawinkn.com](https://chawinkn.com).

Built with [Astro](https://astro.build), React, and Tailwind CSS 4. Deployed to GitHub Pages.

## Pages

| Route       | Source                     | Content                                                   |
| :---------- | :------------------------- | :-------------------------------------------------------- |
| `/`         | `src/pages/index.astro`    | Intro and weekly Unsplash photos                          |
| `/projects` | `src/pages/projects.astro` | Projects with screenshot sliders                          |
| `/music`    | `src/pages/music.astro`    | Songs with album covers, a releases view, and a hero song |
| `/blogs`    | `src/pages/blogs.astro`    | Writing (none yet)                                        |

## Project Structure

```text
/
├── public/               static files, CV, favicons, music-add.html
├── src
│   ├── assets/projects/  project screenshots, optimized by astro:assets
│   ├── components/       shared Astro components
│   ├── data/             music.json (songs), projects.json (projects)
│   ├── layouts/          Layout.astro
│   ├── lib/music-meta.ts album cover and release lookup, run at build time
│   ├── pages/            routes
│   └── styles/           global.css, theme.css
└── .github/workflows/    ci.yml (pull request checks), astro.yml (Pages deploy)
```

## Commands

Run from the project root. Requires Node >= 22.12 and [Bun](https://bun.sh).

| Command                | Action                               |
| :--------------------- | :----------------------------------- |
| `bun install`          | Install dependencies                 |
| `bun dev`              | Start dev server at `localhost:4321` |
| `bun run build`        | Build production site to `./dist/`   |
| `bun preview`          | Preview build locally                |
| `bun run format`       | Format with Prettier                 |
| `bun run format:check` | Check formatting                     |
| `bun astro check`      | Type-check                           |

Husky runs Prettier on staged files before each commit. Pull requests into `main` run `format:check`, `astro check` and `astro build` (`.github/workflows/ci.yml`).

## Environment

| Variable              | Purpose                                                              |
| :-------------------- | :------------------------------------------------------------------- |
| `UNSPLASH_ACCESS_KEY` | Fetches weekly photos on `/`. Optional, section is empty without it. |

Set it in `.env` locally and as a repository secret for CI.

## Adding a song

Open `public/music-add.html` (served at `/music-add.html`, `noindex`) to pick lyrics, then paste the result into `src/data/music.json`:

```json
{
  "name": "Self Control",
  "artist": "Frank Ocean",
  "album": "Blonde",
  "favoriteLyrics": ["..."],
  "url": "https://www.youtube.com/watch?v=OxMLCkWm6Dc"
}
```

`album` is optional and only a hint. Covers, album names and releases come from iTunes (MusicBrainz as fallback) at build time, so there are no images to add. The build needs network access. A failed lookup leaves a blank cover and does not fail the build. Covers found only on MusicBrainz are saved to `dist/covers` during the build, or to the git-ignored `public/covers` in dev.

The hero song and lyric at the top of `/music` change at midnight and noon, Bangkok time.

## Adding project screenshots

Put the PNG in `src/assets/projects/` and reference it as `/projects/<file>.png` in `src/data/projects.json`. The slider serves it as webp with a `srcset`.

## Deployment

`.github/workflows/astro.yml` builds with Bun and deploys to GitHub Pages on push to `main`, on manual dispatch, and weekly on Monday at 00:10 Bangkok time so the weekly photos stay fresh.
