# Feature: Installable PWA

**From build-plan:** feature 21
**Status:** complete

## Goal

Make CineMood installable on a phone passed around the room at movie night:
a web app manifest and on-brand icon set so "Add to Home Screen" produces a
real app icon and standalone window, plus a service worker that precaches the
app shell (so the installed app opens even with no signal) and caches poster
images that were already loaded (so a session someone already opened still
shows posters offline).

## In scope

- An on-brand app icon (neon play-mark on the `--surface` dark background,
  magenta-to-cyan gradient) rendered as: browser-tab icon, Apple touch icon,
  and the 192/512 PNGs a Web App Manifest needs for Android installability.
- `src/app/manifest.ts` (Next's manifest file convention): name, short_name,
  description, `start_url`, `display: "standalone"`, `background_color`/
  `theme_color` from the existing dark tokens, and the icon set above.
- `theme-color` and Apple web-app metadata wired into the root layout so iOS
  Safari's "Add to Home Screen" and the Android install banner both pick up
  the right chrome color and standalone mode.
- A Serwist-based service worker (`src/app/sw.ts`) that precaches the app
  shell, serves `/~offline` for a document request that can't reach the
  network, and cache-first's poster images from `image.tmdb.org` so posters
  already seen stay visible offline.
- A small on-brand `/~offline` fallback page.

## Out of scope

- Web push notifications - not in the plan's feature 21 description, and it
  needs VAPID keys and a subscriptions table that don't exist. A distinct
  future feature if ever wanted.
- Background sync, periodic sync, or any other advanced PWA API beyond
  install + offline shell + cached posters.
- Caching API responses (search, recommendations) for offline use - those
  need a live session and the network anyway; only the already-rendered
  shell and poster images are cached.
- An install-prompt UI component (custom "Add to Home Screen" button/banner)
  - browsers already show their own install affordance once the manifest and
  service worker are present; a custom prompt is a nice-to-have the plan
  doesn't ask for.
- Changing `next.config.ts` image handling, or any other unrelated file.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - On-brand app icons** - one master SVG (play-mark, magenta
  `#FF2E9A` -> cyan `#22E6FF` gradient, centered on the `#131024` surface
  color, full-bleed square so it also satisfies Android's maskable safe
  zone) rasterized with `sharp` (already a transitive dependency, confirmed
  installed) into `src/app/icon.png` (48x48, tab favicon), `src/app/
  apple-icon.png` (180x180), `public/icons/icon-192.png` (192x192), and
  `public/icons/icon-512.png` (512x512). The source SVG is committed at
  `public/icons/mark.svg` so the art is re-editable, not just the raster
  output. Removes the stale default `src/app/favicon.ico` (Next's generic
  starter icon) in favor of the on-brand `icon.png`. *Done when:* `npm run
  build` succeeds, and the built `<head>` includes `<link rel="icon"
  href="/icon...">` and `<link rel="apple-touch-icon" ...>` pointing at the
  new art (checked via `curl localhost:3000` against `next start` or a
  screenshot of the browser tab).
- [x] **Step 2 - Web app manifest + theme metadata** - `src/app/manifest.ts`
  returning `name: "CineMood"`, `short_name: "CineMood"`, `description`
  matching the existing root-layout metadata, `start_url: "/"`, `display:
  "standalone"`, `background_color: "#08070f"`, `theme_color: "#08070f"`,
  and an `icons` array listing the 192 PNG (`sizes: "192x192"`), the 512 PNG
  (`sizes: "512x512"`), and the 512 PNG again with `purpose: "maskable"`
  (Next's `Manifest` type only accepts one `purpose` literal per entry, so
  a combined `"any maskable"` string doesn't typecheck - the same art is
  listed twice instead of shipping a third PNG). Add `appleWebApp: {title:
  "CineMood", statusBarStyle: "black-translucent"}` to the `metadata`
  export, and a separate `viewport: Viewport = {themeColor: "#08070f",
  colorScheme: "dark"}` export, in `src/app/layout.tsx` - this Next version
  moved `themeColor`/`colorScheme` out of `metadata` into their own
  `viewport` export (Next's Metadata API generates the `<meta
  name="theme-color">` and Apple web-app `<meta>` tags from these, no
  manual `<head>` edits). *Done when:*
  `npm run build` succeeds, `/manifest.webmanifest` (or whatever path Next
  serves it at) returns valid JSON with the icon set, and the rendered
  `<head>` carries the manifest link plus theme-color/apple-mobile-web-app
  meta tags.
- [x] **Step 3 - Offline shell + cached posters (Serwist service worker)** -
  add `serwist`, `@serwist/turbopack`, and `esbuild` as dependencies -
  **not** `@serwist/next`, which wraps `next.config` with a webpack plugin
  and errors out under Turbopack (this project's default bundler, per
  `npm run build`'s `▲ Next.js 16.3.3 (Turbopack)` banner; confirmed by
  actually hitting that build error first). `@serwist/turbopack` instead
  compiles the service worker through a Route Handler. Added: `next.config.ts`
  wrapped with `withSerwist` from `@serwist/turbopack`; the route handler
  `src/app/serwist/[path]/route.ts` (`createSerwistRoute({swSrc:
  "src/app/sw.ts", additionalPrecacheEntries: [{url: "/~offline", revision}],
  useNativeEsbuild: true})`, revision from `git rev-parse HEAD`, falling back
  to a random id for a git-less build context); `src/app/sw.ts` (a `Serwist`
  instance with `precacheEntries: self.__SW_MANIFEST`, `skipWaiting: true,
  clientsClaim: true, navigationPreload: true`, a `tmdb-posters` cache-first
  runtime-caching rule for `image.tmdb.org` ahead of `@serwist/turbopack`'s
  `defaultCache`, and a `fallbacks` entry serving `/~offline` for any
  document request that can't reach the network); `<SerwistProvider
  swUrl="/serwist/sw.js">` wrapping the root layout's body (registers the
  worker client-side); and a small on-brand `src/app/~offline/page.tsx`
  (matches the existing empty-state pattern used on `/sessions`). No
  `tsconfig.json` or `.gitignore` changes needed in this mode - the compiled
  worker is served at request time by the route handler, not written to
  `public/`. *Done when:* `npm run build` succeeds and lists `/serwist/sw.js`
  and `/~offline` as build routes (confirmed); against `next start`, `curl`
  evidence confirms `/serwist/sw.js` serves with `service-worker-allowed: /`
  and `content-type: application/javascript`, its precache manifest lists
  the app-shell chunks plus the `/~offline` entry, its runtime-caching rules
  mention `tmdb-posters`/`image.tmdb.org`, `/~offline` renders the on-brand
  copy, and the homepage HTML embeds the `/serwist/sw.js` registration call
  (confirmed via curl - see review packet). Full interactive proof (DevTools
  > Application shows the worker activated; reloading with DevTools Network
  set to Offline serves the cached shell; a previously loaded poster still
  renders offline) needs a real browser, which this environment can't drive
  (no Playwright in this project) - that walkthrough is the manual follow-up
  in the review packet, not something this step could self-certify.

## Testing

No new parsers, formatters, validators, or server actions - this feature is
entirely static config (manifest, icons) and a declarative service-worker
cache configuration, both integration-level surfaces per
`coding-standards.md`'s testing scope rule. Verified with the build plus
manual/DevTools evidence per step, not unit tests.
