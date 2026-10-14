# Remote streaming backend: deployment and readiness guide

## Current state

There is no remote streaming engine in this repository and no remote stream-service client in the Vercel API. `api/addons/[provider].ts` performs a short manifest and stream lookup, maps TMDB IDs, and classifies the returned entries. It does not relay video, run a torrent engine, or provide a streaming endpoint. `UniversalPlayerPanel` keeps direct video, permitted embeds, external links, and torrent metadata in separate playback paths. A torrent entry remains unsupported until a lawful, compatible service exists.

Local configuration is intentionally disabled: `ENABLE_AUTHORIZED_ADDON_LOOKUPS` is `false`, and `TORRENTIO_MANIFEST_URL` and `HDHUB_MANIFEST_URL` are not configured. No production Vercel settings were inspected or changed. The `/api/addons/{provider}` route currently has no user authentication or shared rate limiter; leaving lookups disabled is essential until those protections and provider authorization are in place.

The built-in registry describes Torrentio as returning scraped torrent listings. That is not evidence of rights to stream the listed works. HdHub's authorization for this deployment has not been established either. A Stremio manifest or a successful stream-list response is discovery metadata, not permission to redistribute or proof that a browser can play the result. Therefore neither provider has been connected to a streaming engine, and no real stream endpoint was queried for this task.

## Recommended architecture after authorization

```text
Signed-in browser
  -> AAK Vercel API: verify session, enforce per-user rate limits, validate title/episode
       -> approved addon/provider over HTTPS: manifest and stream metadata only
       -> issue short-lived, scoped playback capability
            -> separate HTTPS container/VM service: authorized incremental media delivery
                 -> browser media element using HTTPS and byte ranges
```

Keep the Vercel API for short metadata lookups and authorization. Run any long-lived engine outside Vercel. Vercel documents finite function durations (currently up to 5 minutes on Hobby and up to 30 minutes in beta on Pro/Enterprise with Fluid Compute); those limits include streamed responses. That is not a persistent daemon and is a poor fit for a long-lived peer engine or an unbounded video relay. See [Vercel Function limits](https://vercel.com/docs/functions/limitations).

The remote service should only accept a signed, short-lived job created by the Vercel API for a source that has already passed a documented rights review. Do not accept a browser-supplied URL, magnet, info hash, arbitrary manifest, or arbitrary host. Bind the capability to a user, media item, selected source, expiry, and a concurrency quota. Keep the service's administrative/engine interface on a private network; only the scoped media endpoint should be reachable by a playback client.

Before a source can be used, the operator must establish that the service and hosting provider permit this exact authorized content-delivery use. In particular, this guide does not authorize Torrentio's scraped results or HdHub results. If a source is not documented as authorized, it must stay disabled.

### Required controls for a future service

- Require a verified Supabase session (or equivalent account identity) at the AAK API. Add a shared, durable rate-limit store; an in-memory counter is ineffective across serverless instances.
- Validate positive TMDB IDs and bounded season/episode values. Use IMDb IDs only when the live addon's stream resource declares `tt`; preserve `seriesId:season:episode` for TV. Never use an episode ID in place of the series ID.
- Restrict requests to exact provider hosts and approved paths. Reject redirects or revalidate every redirect destination. Resolve and reject private, loopback, link-local, reserved, and multicast addresses at connection time; use an egress firewall as a second SSRF barrier.
- Do not expose configured manifest URLs, provider credentials, service tokens, info hashes, or internal diagnostics to the browser or logs. Do not log query strings that may contain signed configuration.
- Limit request bodies, title lookup rates, active sessions, download buffers, selected file size, process count, idle time, and total session duration. Return a useful `429`/`503` without blocking the rest of the website.
- Support `HEAD`, `Range`, `206`, `Content-Range`, and `Accept-Ranges` only when the authorized engine and selected media file can honor them. Confirm the actual container/codec before offering playback. Never label a source 4K unless its response and playback support establish that.
- Abort the engine when the client disconnects, expire abandoned sessions, and remove temporary data. Add a periodic cleanup watchdog because process shutdown hooks are not guaranteed.
- Serve HTTPS, allow CORS only from the configured AAK origin, and keep engine control endpoints private. Set quotas and alerts for bandwidth, disk, CPU, memory, failed authorization, and active stream counts.

## Environment configuration

The checked-in `.env.example` contains names with blank values only. Existing server-side settings are:

| Variable | Where | Purpose |
| --- | --- | --- |
| `TMDB_READ_ACCESS_TOKEN` | Vercel server environment | Maps a TMDB title to IMDb IDs for addons that require `tt` IDs. |
| `ENABLE_AUTHORIZED_ADDON_LOOKUPS` | Vercel server environment | Must remain `false` until source permissions, authenticated access, and rate limiting are reviewed. |
| `TORRENTIO_MANIFEST_URL` | Vercel server environment | Provider-generated configured manifest URL; never a browser value. Do not set for scraped results absent explicit authorization. |
| `HDHUB_MANIFEST_URL` | Vercel server environment | Provider-generated configured manifest URL; authorization is still unverified. |
| `AUTHORIZED_EMBED_HOSTS` | Vercel server environment | Exact HTTPS hostnames permitted for addon embed classification. |
| `REMOTE_STREAM_SERVICE_URL` | Reserved for Vercel server environment | Placeholder only. The current application does not read it. |
| `REMOTE_STREAM_SERVICE_TOKEN` | Reserved for Vercel server environment | Placeholder for a future server-to-server credential. The current application does not read it. Never put it in a `VITE_` variable. |

The future remote service will need its own matching `AAK_STREAM_SERVICE_TOKEN`, an exact allowed AAK origin, and an authorization policy configured in that service's secret manager. The Vercel-side `REMOTE_STREAM_SERVICE_TOKEN` value would be shared only server-to-server. No remote service token or provider credential exists in this repository, and adding these two placeholders does not enable any requests.

## Hosting options and sizing estimate

Treat this as a planning estimate, not a purchase recommendation. Start with a persistent container/VM around 2 vCPU, 4 GiB RAM, a small temporary disk sized to the authorized engine's file-selection and buffering behavior, and a hard cap of one or two concurrent sessions. Load-test actual codecs, seek behavior, and mobile networks before increasing it. Do not cache full titles by default. Bandwidth will usually dominate compute: every hour watched is approximately the source bitrate multiplied by 0.45 GB per Mbps-hour (for example, a 5 Mbps stream is about 2.25 GB/hour before protocol overhead).

- **Persistent VM:** The current Hetzner CPX22 listing is about `$22.99/month` (or `€19.49/month`) in Germany/Finland, excluding IPv4 and VAT. That is a compute floor only; check included transfer, regional price, IPv4, tax, and the provider's acceptable-use terms before choosing it. This is the simplest operational fit for a continuously running engine, but you own patching, firewalling, monitoring, and recovery. [Hetzner's current price table](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/)
- **Managed container service:** Render supports a paid disk-backed web/private service or background worker, but a disk-backed service is single-instance and cannot autoscale across instances. Its current public pricing lists persistent disks at `$0.25/GB-month` and outbound bandwidth at `$0.15/GB` beyond the plan allowance; check the current compute plan and included bandwidth before estimating total cost. [Render persistent disk constraints](https://render.com/docs/disks), [Render pricing](https://render.com/pricing)
- **Vercel Functions:** Keep these for authentication and metadata. Even with longer current limits, functions are bounded invocations and not a persistent torrent engine; large sustained egress can also be expensive and should not be routed through this app layer. [Vercel limits](https://vercel.com/docs/functions/limitations)

The VM estimate excludes egress beyond included transfer, backups, monitoring, domain/TLS services, and support. One hundred hours of 5 Mbps viewing would transfer roughly 225 GB; a small compute bill can therefore coexist with a large bandwidth bill. Confirm that the chosen host explicitly permits the authorized peer/networking and streaming workload before provisioning it.

## Deployment sequence (blocked pending authorization and approval)

1. Record the rights basis, approved titles/catalog, allowed source provider, and hosting-provider policy. Keep the addon lookup flag off if any of those are missing.
2. Select a provider that permits the exact workload and supports long-lived containers, HTTPS, egress controls, health checks, resource quotas, and the required temporary storage. Decide whether inbound peer ports are required and supported; do not assume an HTTP-only container host can provide them.
3. Implement the remote service in a separate reviewed service repository. Expose only `/healthz` and the narrowly scoped media-session API; keep engine control private. Add readiness checks that fail when auth, storage, or limits are not initialized.
4. Deploy to a non-production environment with test media that you own or are authorized to distribute. Configure TLS, secrets, firewall/egress policy, concurrency limits, disk quota, session TTL, and monitoring before exposing the endpoint publicly.
5. Add the Vercel adapter only after the service contract and authentication are implemented. Store its HTTPS origin and server-to-server token in Vercel's server-side environment settings. Never configure these as `VITE_*` values. Do not change production Vercel settings until separately authorized.
6. Add authentication/rate limiting to addon lookup before enabling any provider. Set a manifest URL only after permission and provider configuration are confirmed. Keep service URLs and configuration tokens out of client code.
7. Test a licensed movie and a licensed TV episode from a second device with no local Stremio instance. Confirm correct identifier and `season:episode`, actual selected media file, HTTPS playback, byte-range seeking, client cancellation, cleanup after abandonment, and expected 401/403/429/502 behavior. Inspect server metrics, not just a successful manifest response.

## What is needed before visitors can use it

1. Written authorization for the specific catalog and proof that the provider and host permit the intended streaming/peer-to-peer use.
2. A chosen and approved persistent host, its cost/bandwidth limits, and a deployed remote service.
3. A rights-reviewed source integration; Torrentio's scraped listings must not be enabled on the basis of this code alone. HdHub's rights and configured endpoint also need verification.
4. Server-side service secrets and hostnames, added only after the future adapter exists.
5. Authenticated addon access, shared rate limiting, SSRF-safe egress checks, and session/resource cleanup tests.
6. Live movie and TV playback verification from desktop, mobile browser, and installed PWA.

Until those items are addressed, the app can display configured addon metadata and mock-tested classifications, but it cannot remotely stream torrent sources. No real provider results or remote playback are claimed here.
