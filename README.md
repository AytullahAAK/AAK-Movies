# AAK Movies

AAK Movies is a responsive movie and TV discovery site built with React, TypeScript, Vite, and React Router. It retains the AAK logo, light-default frosted-glass styling, and persistent AMOLED night mode.

## Run locally

Requires Node.js 20.19+ and npm:

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

macOS/Linux:

```sh
npm install
cp .env.example .env.local
npm run dev
```

## Environment variables

- `TMDB_READ_ACCESS_TOKEN`: TMDB Read Access Token. The local Vite proxy and Vercel serverless function send it as a server-side `Authorization: Bearer` value. It is not read by browser code.
- `VITE_TMDB_API_KEY`: optional public v3 key for local development only when no Read Access Token is set. The local proxy adds it server-side. Do not use it to expose a private credential in a public client bundle.
- `VITE_SITE_URL`: optional real HTTPS production origin. Route canonicals and `og:url` are omitted when it is absent or appears to be a reserved/local host.

`.env.example` contains placeholders only. Keep real values in ignored `.env.local` and deployment environment settings. Never commit tokens or keys.

## Routes

- `/` — featured titles, trending movies and series, collections
- `/discover?media=movie|tv|all` — search, type switch, genre, year, language, and sort filters
- `/movie/:id` — movie metadata, cast, trailer, and recommendations
- `/tv/:id` — TV metadata, seasons, cast, trailer, and recommendations
- `/tv/:id/season/:seasonNumber` — season episode guide, including season zero when TMDB provides it
- `/watch/movie/:id` — movie playback selector; Nxsha is selected by default
- `/watch/tv/:id/:seasonNumber/:episodeNumber` — episode playback selector, season/episode selection, and adjacent-episode navigation
- `/watch/:id` — existing movie alias
- `/player` — Universal Player for direct video and built-in manifest metadata
- `/sources` — built-in declarations and user-supplied HTTPS manifest registry
- `/library`, `/profile`, `/admin`, `/about`, `/contact`, `/privacy`, `/terms`, `/copyright`

## TMDB integration

The same-origin proxy supports `/trending/all/day`, `/search/movie`, `/search/tv`, `/search/multi`, movie and TV detail routes, TV season routes, genre lists, and video metadata appended to detail requests. The internal media model uses `media_type: 'movie' | 'tv'`; TV records preserve `name`, `first_air_date`, `number_of_seasons`, and `number_of_episodes`. Season and episode metadata comes from TMDB. Demo movie data is used when no credential is configured, with no fabricated ratings.

TMDB supplies metadata and artwork; it does not guarantee playable video. Movie and TV information and images are provided by TMDB. AAK Movies uses the TMDB API but is not endorsed or certified by TMDB. Before public or commercial use, review TMDB's current API terms, attribution and branding requirements, rate limits, and licensing rules.

## Playback and manifest limits

The title watch screens expose exactly two primary choices:

1. **Nxsha Player** — selected by default. Movie URLs use `https://web.nxsha.app/embed/movie/{TMDB_MOVIE_ID}?color=orange`. TV episodes use `https://web.nxsha.app/embed/tv/{TMDB_TV_ID}/{SEASON_NUMBER}/{EPISODE_NUMBER}` without the movie color parameter. The mapping is explicit and rejects invalid IDs and episode numbers. Nxsha support, permission, supported IDs, mobile behavior, and actual playback have **not been verified**. An iframe `load` event only means a document responded; browser iframe errors do not reliably reveal player or media failures. The player offers a manual retry/fallback state.
2. **Universal Player** — accepts direct HTTPS MP4, WebM, and Ogg file URLs in a native HTML5 player, with browser controls and playback-speed selection. A normal webpage, iframe URL, torrent reference, or manifest is not a direct video file. Actual support still depends on the browser, host, media format, and access policy.

The two supplied manifests are registered as sanitized declarations inside Universal Player and `/sources`:

- **Torrentio** (`com.stremio.torrentio.addon`, `0.0.15`) declares `stream` for `movie`, `series`, and `anime`, with `tt` and `kitsu` ID prefixes at the resource level; manifest types are `movie`, `series`, `anime`, and `other`. It is configurable and says configuration is not required.
- **HdHub** (`com.stremio.HdHub`, `1.0.7`) declares `stream` and `catalog`, types `movie`, `series`, and `HdHub`, and ID prefixes `tt`, `tmdb:`, and `kitsu:`. It is marked configurable; the manifest does not state whether configuration is required.

The JSON files provide no addon base URL or configuration schema. Torrentio's description identifies scraped torrent streams; HdHub's authorization and usable endpoint are not established by its JSON. Therefore these entries display their declared capabilities only: they do not send catalog or stream requests, convert TMDB IDs, resolve torrents, or play returned streams. No endpoint, URL, or signature has been invented or copied into browser code. User-supplied manifest URLs in `/sources` are validated as HTTPS JSON metadata and stored in local browser storage; CORS may block inspection. A manifest registry is not a stream integration.

## SEO, robots, and sitemap

Route changes set a title, description, Open Graph title/description/type, and Twitter title/description. Canonical and `og:url` values are only emitted when `VITE_SITE_URL` is configured as a non-reserved HTTPS host. After choosing the production domain, generate a sitemap for the routes you want indexed and add its absolute URL to `public/robots.txt`. The current robots file allows crawling but does not name a sitemap because no production domain is assumed.

## Vercel deployment

Use Vite as the framework, `npm run build` as the build command, and `dist` as the output directory. Configure `TMDB_READ_ACCESS_TOKEN` as a server-side Vercel environment variable and set `VITE_SITE_URL` to the real HTTPS site origin. The `/api/tmdb/[...path].ts` function keeps the Read Access Token server-side. Ensure deep links fall back to the SPA while `/api/tmdb/*` continues to route to the function. Do not set the Read Access Token under a `VITE_` name.

## Checks

```sh
npm run typecheck
npm run build
```

`npm run lint` currently runs the TypeScript project check. The repository does not configure a separate automated test runner. External iframe playback and provider authorization need independent verification before being described as operational.

## Commit and push

```sh
git status
git add src api README.md .env.example vite.config.ts tsconfig.app.json tsconfig.node.json
git commit -m "Add TV episode playback and universal player"
git push
```
