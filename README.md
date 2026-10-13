# AAK Movies

AAK Movies is a responsive movie and television discovery experience built with React, TypeScript, Vite, and React Router. It preserves the supplied AAK logo, frosted light-default theme, selectable accent colors, and AMOLED night mode.

## Local setup

Requirements: Node.js 20.19 or newer and npm.

1. Run `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Add a TMDB Read Access Token to `TMDB_READ_ACCESS_TOKEN` in `.env.local`.
4. Run `npm run dev` and open the local URL printed by Vite.

The Vite proxy sends TMDB credentials in `Authorization: Bearer`. `VITE_TMDB_API_KEY` is supported only as a local fallback, is sent by the local proxy, and is not bundled into browser code. Never put a Read Access Token in a `VITE_` variable or commit credentials. `.env.local` is ignored by Git.

## Environment variables

- `TMDB_READ_ACCESS_TOKEN`: server-only token for the Vite proxy and Vercel functions.
- `VITE_TMDB_API_KEY`: optional public TMDB v3 key for local development only.
- `VITE_SITE_URL`: optional real HTTPS origin; route canonical and Open Graph URL tags remain omitted until configured.
- `ENABLE_AUTHORIZED_ADDON_LOOKUPS`: server-only gate. Keep unset or `false` unless permissions and the exact provider configuration have been reviewed.
- `TORRENTIO_MANIFEST_URL`: server-only HTTPS manifest URL on `torrentio.strem.fun` ending in `/manifest.json`.
- `HDHUB_MANIFEST_URL`: server-only HTTPS configured manifest URL on `hdhub.thevolecitor.qzz.io` ending in `/manifest.json`. Use the provider's configuration flow; do not expose credential-bearing URLs.
- `AUTHORIZED_EMBED_HOSTS`: optional comma-separated exact HTTPS hostnames that the operator has approved for embed playback.

The addon route returns HTTP 503 when lookups are disabled or the required configuration is missing. A complete enabled setup also needs `TMDB_READ_ACCESS_TOKEN` so a TMDB movie or series can be mapped to an IMDb ID. Configure these only after the operator has reviewed the provider permissions. No server lookup gate is enabled by default.

`.env.example` contains placeholders only. Never add credentials, private addon configuration, or service-role keys to client code.

## Routes

- `/` — provider logo strip, Continue Watching, featured title, and movie/TV discovery rows.
- `/discover` — All, Movies, Anime, and TV Shows; search, genre/year/language sorting, provider, and availability filters.
- `/discover?media=movie|tv|all` — select a content category.
- `/discover?provider=ID&region=BD` — provider-filter route. The interface uses BD as its internal default market and does not expose a Region selector.
- `/providers` — worldwide, unfiltered movie and TV provider records returned by TMDB. The directory does not claim to include providers beyond the supported TMDB dataset; providers without a usable logo path use the app's existing non-logo fallback.
- `/install` — PWA installation help and the browser install prompt when supported.
- `/movie/:id` — movie details, cast, trailer, recommendations, and playback choices.
- `/tv/:id` — TV series details, season and episode selection, and playback choices.
- `/tv/:id/season/:seasonNumber` — season episode guide.
- `/watch/movie/:id` — movie playback choices.
- `/watch/tv/:id/:seasonNumber/:episodeNumber` — legacy episode route redirected to the series page.
- `/watch/:id` — legacy movie alias.
- `/sources` — built-in addon declarations and the user-supplied manifest registry.
- `/live-tv` — empty-by-default registry for authorized channels.
- `/library`, `/profile`, `/admin`, `/about`, `/contact`, `/privacy`, `/terms`, `/copyright`.

## TMDB data and attribution

The server proxy supports TMDB v3 trending, movie and TV search, movie and TV popular/top-rated catalogs, movie and TV discovery, genre lists, title details, external IDs, TV seasons and episodes, provider directories, and per-title provider availability. Movie and TV metadata remain distinct in the internal media model.

Provider logos and availability are sourced from TMDB and share one deduplicated movie/TV provider catalog between the homepage and `/providers`. The directory calls the provider endpoints without a `watch_region` filter, includes records even when TMDB has no logo path, and uses the same safe logo URL mapping and fallback renderer as the homepage. TMDB's supported dataset is the limit of this directory; it does not guarantee every provider worldwide. Bangladesh (BD) remains the internal default market for title availability searches, and a directory listing or logo does not mean a service carries every title there.

TMDB Watch Provider availability is powered by JustWatch. Acknowledgement and links are provided in the UI as required by the [TMDB movie provider reference](https://developer.themoviedb.org/reference/movie-watch-providers) and [TMDB TV provider reference](https://developer.themoviedb.org/reference/tv-series-watch-providers). The About page includes TMDB's logo and the required non-endorsement notice: this product uses the TMDB API but is not endorsed or certified by TMDB. Review current TMDB terms, attribution, branding, and licensing requirements before commercial release.

For production diagnostics, `/api/tmdb/status` reveals only whether the server token is present; it does not reveal the token or prove that TMDB accepts it. Verify a real metadata route too. HTTP 401/403 indicate rejected or denied credentials, 429 indicates rate limiting, 503 indicates missing server configuration, and 502 indicates that the proxy could not reach TMDB. Vercel environment changes require a new deployment.

## Players, addons, and progress limits

The title screen has exactly two choices:

1. **AAK Player** — default external iframe. Nxsha is the configured provider. Movie URL: `https://web.nxsha.app/embed/movie/{TMDB_MOVIE_ID}?color=orange`. TV URL: `https://web.nxsha.app/embed/tv/{TMDB_TV_ID}/{SEASON_NUMBER}/{EPISODE_NUMBER}`. The homepage trailer uses YouTube's IFrame Player API: artwork stays visible until a `PLAYING` event, and an `ENDED` state advances the banner. Browser autoplay restrictions can leave a play control visible. These events describe the embedded YouTube player state; they do not verify Nxsha playback.
2. **Torrent** — addon source discovery. It shows independent Torrentio and HdHub sections. User-supplied direct media URL entry is not available; an addon-returned compatible HTTPS video file can use the native player.

The supplied Torrentio and HdHub JSON files are manifest descriptors, not running addon servers or stream results. Local lookups currently return HTTP 503 because `ENABLE_AUTHORIZED_ADDON_LOOKUPS=true` and the provider-specific `TORRENTIO_MANIFEST_URL` / `HDHUB_MANIFEST_URL` values are not configured. `TMDB_READ_ACCESS_TOKEN` is present locally. The route reads `/manifest.json`, validates `types`, `resources`, and supported ID prefixes, then requests the Stremio stream resource. A manifest HTTP 200 only confirms metadata, not that stream requests work. Torrentio declares scraped torrent sources and remains disabled by default. HdHub requires a configured manifest URL generated by its setup flow. This project has not confirmed authorized, live stream results for either service.

Movie addon requests use `/stream/movie/{imdbId}.json`. TV requests use the series IMDb ID plus season and episode, as `/stream/series/{imdbSeriesId}:{season}:{episode}.json`; an episode ID is never substituted for its series ID. The format follows the official [Stremio Addon SDK protocol and stream-handler documentation](https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/api/requests/defineStreamHandler.md). Requests run independently and have timeouts, HTTP/JSON validation, rate-limit handling, and distinct empty/error states.

Magnet/torrent results are never passed to the HTML video element or resolved by this app. A source requiring a streaming backend needs a separate authorized service. Addon-returned native playback accepts HTTPS MP4, WebM, and Ogg media only. A webpage, iframe, addon manifest, or torrent reference is not a direct video file.

Continue Watching stores observed progress in local browser storage on this device for compatible native-video playback from an addon. It deduplicates per movie or series/season/episode, records position and duration, and removes entries when the video ends or reaches 95%. The same content resumes after the user selects a compatible addon source again; source URLs are not saved. The AAK Player iframe is cross-origin and exposes no reliable progress events, so its position is not tracked. There is no account or database, so progress does not sync between devices. Watchlist titles are currently held for the active visit; theme, current accent, and the last custom accent preference are local to this browser when storage is available.

## Installable web app

The app includes a branded web manifest, square icons generated from the supplied AAK logo, and a service worker. The worker caches same-origin shell and static resources only. It bypasses API responses, external requests, and video/media content. Navigation is network-first with a cached app-shell fallback. A waiting update is offered and reloads only after the user chooses Update and reload.

The header download action opens `/install`. Supported browsers may expose a native PWA prompt; iOS users can follow Safari's Share then Add to Home Screen steps. Installed status is shown only when the browser reports standalone mode or fires its install event. No APK has been built or is provided. Online TMDB data and playback require connectivity.

## SEO, robots, and sitemap

Route changes set page titles, descriptions, Open Graph metadata, and Twitter summaries. Canonical and `og:url` tags are emitted only when `VITE_SITE_URL` is configured as a real HTTPS origin. `public/robots.txt` allows indexing but does not name a sitemap because a production domain is not assumed. After selecting a domain, generate an absolute sitemap for public routes and add its URL to `public/robots.txt`.

## Vercel deployment

Use Vite, `npm run build`, and `dist` as the output directory. `vercel.json` keeps the SPA fallback separate from `/api` serverless routes. Add `TMDB_READ_ACCESS_TOKEN` to the Vercel project's Production environment, then create a deployment. Do not use a `VITE_` variable for the token. Add `VITE_SITE_URL` only after the public HTTPS domain is known. Confirm `/api/tmdb/status` and a real `/api/tmdb/proxy?path=...` response after deployment. Addon variables are independent and must not be enabled unless reviewed and configured.

## Checks

- `npm run typecheck` — TypeScript project check.
- `npm run lint` — currently runs the TypeScript project check.
- `npm run test` — Node built-in mocked API, addon protocol, player mapping, progress policy, and theme checks.
- `npm run build` — production TypeScript check and Vite output.

Mocked tests do not establish live provider availability. Browser visual and installation checks require an installed browser automation environment; report those separately from build and unit checks.
