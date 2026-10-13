# AAK Movies

AAK Movies is a responsive film and television discovery app built with React, TypeScript, Vite, and React Router. It retains the supplied AAK logo, frosted-glass light theme, and AMOLED night toggle.

## Run locally

Use Node.js 20.19+ and npm:

```bash
npm install
Copy-Item .env.example .env.local # PowerShell
npm run dev
```

On macOS/Linux, copy the template with `cp .env.example .env.local`.

### Environment variables

- `VITE_TMDB_READ_ACCESS_TOKEN`: uses TMDB's v4 Read Access Token with `Authorization: Bearer`. Vite client variables are compiled into browser JavaScript. Use this only for local demonstrations; do not put a private production token in a `VITE_` variable. For a public deployment, proxy TMDB requests through a server endpoint that keeps the token private.
- `VITE_TMDB_API_KEY`: public v3 API key fallback, read only in Vite development mode. It is also visible to the browser; use only a key suitable for local client demos.
- `VITE_SITE_URL`: optional real HTTPS production origin used to create route canonical URLs and `og:url`. Leave blank on local previews. No canonical domain is assumed by default.

The blank `.env.example` values are placeholders. Never commit `.env`, `.env.local`, or real API credentials.

## Routes

- `/` home and trending movies/TV series
- `/discover` discovery with Movies, TV Shows, and All; search, genre, year, language, and sort controls
- `/movie/:id` movie details, cast, trailer, recommendations, and movie playback link
- `/tv/:id` TV series details, season list, cast, and trailer
- `/tv/:id/season/:seasonNumber` season episode guide
- `/watch/movie/:id` movie-only Nxsha iframe integration (`/watch/:id` remains a movie alias)
- `/watch/tv/:id/:seasonNumber/:episodeNumber` explicit no-provider state for TV episodes
- `/player` personal direct-media HTML5 player
- `/sources` local HTTPS Stremio-compatible manifest registry
- `/library`, `/profile`, `/admin`, `/about`, `/contact`, `/privacy`, `/terms`, `/copyright`

TMDB-backed routes call `/trending/all/day`, `/search/movie`, `/search/tv`, `/search/multi`, `/movie/:id`, `/tv/:id`, and `/tv/:id/season/:seasonNumber`. Internal catalog records carry `media_type` so a TV ID is never routed into the movie endpoint. When no credential is set, movie discovery/details use a small local demo catalog; TV search and metadata show an empty/configuration state. Demo titles do not display fabricated ratings.

## Playback and manifest limits

- Nxsha remains the movie iframe source with the configured `https://web.nxsha.app/embed/movie/{providerId}?color=orange` template. The explicit mapper currently maps a movie's TMDB ID to the template ID; provider support and permission are unverified. It rejects TV records, and the app does not claim iframe errors are reliably detectable. The “Player not loading?” control provides a manual fallback.
- TV episode playback remains unavailable until an authorized provider has an explicit episode ID mapping. A show/episode TMDB ID is never sent to the movie iframe endpoint.
- `/player` accepts direct HTTPS paths ending in MP4, WebM, or Ogg extensions. A webpage/embed page, torrent, or manifest is not a direct video file. Browser media errors display a fallback. Use only media you have the right to play.
- `/sources` validates HTTPS manifest JSON shape and stores declared name, ID, types, and resources in local browser storage. Browser CORS may prevent inspection. It is a registry only; it does not resolve streams, scrape sources, or process torrents.
- The admin page is a shell. Authentication, server-side roles, persistence, and privileged operations are not configured. Do not expose it with write access until those protections exist.
- The library is in-memory for the current visit. Authentication and synced watchlists are not connected.

## TMDB attribution and licensing

Movie/TV information and artwork are provided by TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB. Before public or commercial deployment, review the current TMDB API terms, attribution and branding rules, rate limits, and applicable licensing requirements. Do not invent or imply provider ratings or metadata when a field is absent.

## SEO and deployment

Route changes update document titles, descriptions, and Open Graph title/description/type. Canonical URLs and `og:url` are emitted only when `VITE_SITE_URL` is set to a real HTTPS domain. `public/robots.txt` allows crawling; after choosing a production domain, generate and publish a sitemap, then add its absolute URL to `robots.txt`. Configure Open Graph image URLs for the production origin if social previews require absolute URLs.

Vercel settings: framework Vite, build command `npm run build`, output directory `dist`, Node.js 20.19 or later. Add an SPA rewrite so React Router deep links serve `index.html`. Keep the TMDB Read Access Token server-side in production and proxy requests; never set it as a public `VITE_` value in a public deployment.

## Checks

```bash
npm run typecheck
npm run build
```

There is no dedicated test runner configured. These checks run the TypeScript project build and Vite production bundle.
