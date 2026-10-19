# Layout editor

A browser-based 3D editor for laying out electrical-room equipment on a 20 m × 12 m floor. The clearance check and the bill of materials update as you edit; it works with mouse or keyboard, in English and Vietnamese, can run embedded in another web application on a different origin, and has a simulated assistant that proposes fixes. Built with React 19, TypeScript, three.js (React Three Fiber), zustand and Vite.

**Contents:** [Quick start](#quick-start) · [URL options](#url-options) · [Scripts](#scripts) · [Features](#features) · [Using the editor](#using-the-editor) · [Architecture](#architecture) · [3D model optimisation](#3d-model-optimisation) · [Performance](#performance) · [Assumptions](#assumptions) · [Limitations](#limitations-and-known-issues) · [Reset](#reset) · [Licences](#licences-and-credits) · [AI assistance](#ai-assistance)

## Quick start

Prerequisites:

- **Node.js** 22.22.2+ on the 22 line, 24.15+ on the 24 line (`.nvmrc` says 24) or 26+, as `engines` in `package.json` allows. With nvm, run `nvm install` in the repository folder.
- **pnpm 10.33.2** (`packageManager`). `corepack enable` provides it; if your Node has no `corepack` command, run `npm install -g pnpm@10.33.2`.
- **Ports 5173 and 4173 free.** The dev and preview servers use strict ports and exit if the port is taken, because embedded mode and its CSP header expect these exact origins.
- A browser with WebGL 2. Without it the 3D view shows a message and the panels keep working.

In the cloned folder:

```sh
corepack enable
pnpm install
pnpm dev
```

| Page                    | URL                              |
| ----------------------- | -------------------------------- |
| Editor                  | http://localhost:5173/           |
| Embedded-mode host page | http://127.0.0.1:5173/host.html  |
| 3D model benchmark      | http://localhost:5173/bench.html |

The server listens on 127.0.0.1. `localhost` and `127.0.0.1` reach it as two different origins, which the host page needs to frame the editor cross-origin. The editor opens on a sample room with 12 items and one clearance issue, and autosaves your edits in the browser (see [Reset](#reset)).

## URL options

| Option            | Effect                                                                                                                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `?seed=N`         | A generated layout with N items (larger values give 2,000; the same N gives the same layout). Not saved. `?seed=0` is an empty room                                                    |
| `?perf=1`         | Performance overlay (frame rate, frame time, draw calls, triangles, JS heap, GPU, canvas size and more) and continuous rendering. The gauge button in the view controls toggles it too |
| `?instancing=off` | One mesh per item instead of one instanced mesh per item type, to compare draw calls                                                                                                   |
| `?embed=1`        | Embedded mode: waits for the host's `init` message, so open it through the host page                                                                                                   |

Options combine, for example http://localhost:5173/?seed=500&perf=1&instancing=off.

The benchmark page takes `?model=raw|opt|lod1|lod2` (`opt` is LOD0), `&copies=1|100|1000`, `&instancing=on|off` and `&lang=vi`, and starts measuring when it loads. The raw model (43 MB) is not committed: run `pnpm assets:fetch` before using `model=raw`.

## Scripts

| Command                                                           | What it does                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                                                        | Dev server on port 5173                                                                                                                                                                                                                                                                                                                                  |
| `pnpm check`                                                      | Typecheck, lint, format check, unit tests, then the production build with its bundle-size guard (no browser tests)                                                                                                                                                                                                                                       |
| `pnpm test`                                                       | Unit and component tests (Vitest, jsdom); `pnpm test:watch` re-runs them on change                                                                                                                                                                                                                                                                       |
| `pnpm test:e2e`                                                   | Browser tests in headless Chromium at 1920 × 1080 (Playwright, axe-core); starts the dev server if none is running. First run `pnpm exec playwright install chromium` (on Linux add `--with-deps`). 23 slow benchmark variants need `QA_BENCH_ALL=1`; options and production-build runs: [ARCHITECTURE.md §12.2](docs/ARCHITECTURE.md#122-browser-tests) |
| `pnpm build`                                                      | Typecheck, then build to `dist/`                                                                                                                                                                                                                                                                                                                         |
| `pnpm preview`                                                    | Serve `dist/` at http://localhost:4173/. A production build trusts no host page unless `VITE_HOST_ORIGINS` is set, so for embedded mode run both `pnpm build` and `pnpm preview` with `VITE_HOST_ORIGINS=http://127.0.0.1:4173`, then open http://127.0.0.1:4173/host.html                                                                               |
| `pnpm typecheck`, `pnpm lint`, `pnpm format`, `pnpm format:check` | The single steps                                                                                                                                                                                                                                                                                                                                         |
| `pnpm assets:fetch`                                               | Download the raw model into `public/models/raw/` (git-ignored) and verify its SHA-256; on macOS arm64, also unpack KTX-Software into `assets-src/tools/`                                                                                                                                                                                                 |
| `pnpm assets:optimize`                                            | Rebuild the three committed model files from the raw model                                                                                                                                                                                                                                                                                               |
| `pnpm assets:inspect`                                             | Regenerate the statistics in [docs/model-optimisation.md](docs/model-optimisation.md)                                                                                                                                                                                                                                                                    |
| `pnpm measure:fps <out.json>`                                     | Editor frame rate at 500 items with instancing on and off, capped and uncapped; `--base=<url>` picks the server (default http://127.0.0.1:5173). Apple GPUs only (ANGLE Metal), see [Performance](#performance)                                                                                                                                          |
| `pnpm measure:bench <out.json>`                                   | Cold-load and frame times of every model variant on the benchmark page, with the same options and GPU check                                                                                                                                                                                                                                              |
| `pnpm measure:domain`                                             | Times the domain code in Node (clearance check, bill of materials, a move, clearing, draft load and undo) at 500 to 10,000 items                                                                                                                                                                                                                         |

## Features

Required:

| Requirement                                                                          | How to try it                                                                                                                                                          |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Floor of 20 m × 12 m on a 0.5 m grid, and an item palette                            | The palette on the left has four: cabinet, drive, transformer, UPS                                                                                                     |
| Grid-snapped placement from the palette; selecting, moving, rotating, deleting       | Click a palette tile (or press 1–4), then the floor. Click an item to select it, drag to move it (it snaps and stays in the room), R rotates by 90°, Delete removes it |
| Undo and redo of all edits                                                           | Ctrl/⌘+Z and Ctrl/⌘+Shift+Z (or Ctrl/⌘+Y), or the top-bar buttons, labelled with the edit ("Undo: Move CAB-01"). A drag is one step; 200 steps are kept                |
| Item list and properties panel, selection synced in both directions with the 3D view | Placed items (left) and Properties (right): selecting anywhere selects everywhere, and property edits are undoable                                                     |
| Live 0.6 m clearance rule whose message names both items                             | Red in 3D, "Too close" in the list, and under Rule check: "TR-01 and UPS-01 are 0.50 m apart (minimum 0.60 m)". Live while you drag                                    |
| Bill of materials derived from the layout; English/Vietnamese switch                 | The table under the 3D view; the EN/VI switch in the top bar also changes number formats and `<html lang>`                                                             |
| README with run steps, the frame rate measured at 500 items and the hardware         | [Quick start](#quick-start) and [Performance](#performance)                                                                                                            |

Plus items:

| Plus item                                                                                          | How to try it                                                                                                                           |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| A heavy glTF model optimised, with before and after numbers and the draw calls saved by instancing | [3D model optimisation](#3d-model-optimisation), the benchmark page, and `?instancing=off` in the editor                                |
| Editing from the keyboard, announced to screen readers                                             | [Keyboard](#keyboard); a live region announces each result in the current language; single-key shortcuts can be turned off (WCAG 2.1.4) |
| Simulated assistant whose proposed change is previewed before it is applied                        | [Assistant](#assistant)                                                                                                                 |
| The editor framed by a host page on another origin                                                 | [Embedded mode](#embedded-mode)                                                                                                         |
| Copy and paste                                                                                     | Ctrl/⌘+C, then Ctrl/⌘+V pastes at the nearest free spot to the pointer; Ctrl/⌘+D duplicates. All undoable                               |

## Using the editor

**Mouse and touch.** Click a palette tile, then the floor, to place an item; Shift+click keeps placing until Esc. Click an item to select it and drag it to move it; clicking empty floor clears the selection. Drag the floor to orbit, right-drag to pan, scroll or pinch to zoom (in the stacked layout, 900 px wide or less, hold Ctrl or ⌘ while scrolling). The controls at the top right of the 3D view switch between the 3D and Top views, zoom, turn the view, focus on the selection and toggle the performance overlay.

### Keyboard

Press `?`, or the keyboard button in the top bar, for the full list; single-key shortcuts can be turned off there.

| Keys                         | Action                                                                        |
| ---------------------------- | ----------------------------------------------------------------------------- |
| 1–4                          | Start placing a cabinet, drive, transformer or UPS                            |
| Arrows, Shift+arrows         | Move the selection or the placement preview by one or two cells (Up is north) |
| R, Shift+R                   | Rotate clockwise, counter-clockwise                                           |
| Enter, Shift+Enter           | Place; place and keep placing                                                 |
| Delete or Backspace          | Delete the selection                                                          |
| Ctrl/⌘+Z                     | Undo (during a drag it only cancels the drag)                                 |
| Ctrl/⌘+Shift+Z or Ctrl/⌘+Y   | Redo                                                                          |
| Ctrl/⌘+C, Ctrl/⌘+V, Ctrl/⌘+D | Copy, paste near the pointer, duplicate                                       |
| `[` and `]`                  | Select the previous or next item                                              |
| F                            | Point the camera at the selection                                             |
| `+` or `=`, `-`              | Zoom in, zoom out                                                             |
| Esc                          | Cancel the drag, else the placement, else clear the selection                 |

In the item list, Up, Down, Home and End select, Enter shows the item in the 3D view and Delete removes it; while you are placing, the arrow keys and Enter move and place the preview instead. The X and Z fields in Properties step by 0.5 m.

### Assistant

Click **Assistant** in the top bar, then pick a suggestion or type "fix clearance", "summarise" or "how many cabinets?" in English or Vietnamese. For a fix, the reply streams in and the moves are previewed as violet ghosts in the 3D view. **Accept** applies them as one undo step, **Reject** clears them, and a proposal whose items have changed or whose target spots are no longer clear cannot be applied. The assistant is simulated: replies are scripted from your layout in the browser, and nothing is sent anywhere.

### Embedded mode

Open http://127.0.0.1:5173/host.html. A fictional host application frames the editor from http://localhost:5173/?embed=1 and sends it the user, the project, the language, a token valid for 120 s and a theme with `postMessage`. The host's console shows the connection, the token's expiry (**Rotate token now**, or untick **Renew tokens automatically** to watch it expire), language and theme switches, the bill of materials the editor reports back, and a log of every message. Inside the frame, a badge shows the token's lifetime and **Send BOM to quote**.

Both sides check each message's origin and source, and `ready` is never posted to `*`. The editor trusts the host origins in `VITE_HOST_ORIGINS` (comma-separated, read when the server starts and at build time). The dev server defaults to http://127.0.0.1:5173 and http://127.0.0.1:4173; a production build without the variable trusts no host, so give `pnpm build` and `pnpm preview` the same value. The servers send the list in a `Content-Security-Policy: frame-ancestors` header. Details: [ARCHITECTURE.md §8](docs/ARCHITECTURE.md#8-embedding).

## Architecture

- `src/domain`: plain TypeScript with no React or three.js: catalogue, grid and snapping, ops and history, the clearance rule, bill of materials, seeding, serialisation.
- `src/state`: one zustand store. Every edit is a transaction of ops with computed inverses, which gives undo and redo; assistant proposals use the same ops. Violations and the bill of materials are memoised selectors, never stored.
- `src/viewport`: the React Three Fiber scene, loaded after the panels. One instanced mesh per item type, picking against the domain model, and a frame drawn only when something changes.
- `src/features` (panels, shortcuts, assistant), `src/ui` (primitives on Base UI), `src/i18n`, `src/embed` and `src/host` (the zod-validated protocol and the demo host), `src/bench` and `scripts/` (the benchmark page, the model pipeline and the measurement scripts), `src/test` (test setup and the domain benchmark).

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) walks through the code: state and edit model, the data flow of one edit, rendering and draw calls, interaction, embedding, accessibility, tests and package choices. The system design document is submitted separately as a PDF.

## 3D model optimisation

The Khronos sample model A Beautiful Game (a chess set with 1.5 million triangles and 33 JPEG textures) goes through a glTF-Transform pipeline: dedup, instancing of repeated meshes, weld, simplification with meshoptimizer that also weighs the normals, KTX2 textures, quantisation and Meshopt compression. The three resulting levels of detail are committed.

|                                                                                                                           | Raw (as downloaded)     | LOD0 (optimised)        | LOD1                    | LOD2                    |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ----------------------- | ----------------------- | ----------------------- |
| File size                                                                                                                 | 42.98 MB (40.99 MiB)    | 5.57 MB (−87.0 %)       | 1.76 MB (−95.9 %)       | 0.71 MB (−98.4 %)       |
| Triangles per copy                                                                                                        | 1,499,072               | 144,218 (9.6 %)         | 95,352 (6.4 %)          | 68,326 (4.6 %)          |
| Draw calls per copy, as stored in the file                                                                                | 49                      | 15 (10 instanced)       | 15 (10 instanced)       | 15 (10 instanced)       |
| Texture bytes                                                                                                             | 18.93 MB                | 5.18 MB                 | 1.45 MB                 | 0.44 MB                 |
| GPU texture memory (estimate)                                                                                             | 738.20 MB               | 16.78 MB (−97.7 %)      | 4.02 MB                 | 1.05 MB                 |
| Draw calls for 100 copies, instancing off / on: in the file, calculated (per frame with the glass's extra pass, measured) | 4,900 / 49 (8,200 / 82) | 1,500 / 15 (2,800 / 28) | 1,500 / 15 (2,800 / 28) | 1,500 / 15 (2,800 / 28) |
| Model pixels that visibly change colour against raw, at design size                                                       | —                       | 5.7 %                   | 8.7 %                   | 11.6 %                  |

Renders from one camera: [raw](docs/images/model-raw.png), [LOD0](docs/images/model-lod0.png), [LOD1](docs/images/model-lod1.png), [LOD2](docs/images/model-lod2.png); LOD1 and LOD2 are shown at twice and four times their design size, so their differences are magnified. Method, settings and visual checks: [docs/model-optimisation.md](docs/model-optimisation.md).

## Performance

**Measured on:** MacBook Pro (Mac14,9) with an Apple M2 Pro (10-core CPU, 16-core GPU) and 16 GB of memory, macOS 27.0.1 (26A434), on AC power. WebGL renderer: `ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Pro, Unspecified Version)`. Browser: Chromium 156.0.8078.4 as bundled with Playwright 1.64.1 (a Google Chrome for Testing build), headless, with `--use-angle=metal`. Viewport 1920 × 1080; canvas 1,308 × 772 px in the editor and 1,480 × 985 px on the benchmark page; device pixel ratio 1. Display: the built-in screen is set to 120 Hz (it was asleep when checked after the runs), but headless Chromium paces frames with its own synthetic 60 Hz clock, so the screen played no part.

An M2 Pro is far faster than the integrated graphics the design targets (50 fps at 1080p), so these numbers compare instancing on and off and the model variants; they do not show how the editor runs on that target. The production build (`pnpm build`) was served by `vite preview` and measured with `pnpm measure:fps` and `pnpm measure:bench`, which stop unless WebGL runs on the Apple GPU through ANGLE Metal. No other test or benchmark was running when each run started, but everyday apps stayed open (IDEs, a desktop browser and a virtual machine; 1-minute load average 1.3 to 3.6, read at the start and end of each run). Summaries: [docs/measurements/](docs/measurements/).

Editor with 500 items (`?seed=500&perf=1`): two runs, each timing 10 s with the camera still and 10 s while orbiting, after a 3 s warm-up; the ranges cover all four windows.

|                                                      | Instancing on    | Instancing off (`&instancing=off`) |
| ---------------------------------------------------- | ---------------- | ---------------------------------- |
| Frame rate, capped (headless vsync, synthetic 60 Hz) | **60 fps**       | **60 fps**                         |
| Frame rate, uncapped (mean, GPU work included)       | **725–747 fps**  | **554–604 fps**                    |
| Frame time, uncapped, average (calculated)           | **1.34–1.38 ms** | **1.66–1.81 ms**                   |
| Draw calls                                           | 10               | 506                                |
| Triangles                                            | 112,828          | 112,828                            |

Capped runs read 60 fps (59.98 to 60.01) in every window because headless Chromium's vsync is a synthetic 60 Hz clock, not the screen. Uncapped runs turn vsync and Chromium's frame-rate limit off, and their frame rate is the harness's GPU-inclusive mean: frames divided by a window that starts and ends with a GPU read-back. The average frame time is 1000 divided by that rate. No 95th percentile is given for the editor: the harness times single frames on the requestAnimationFrame clock, and uncapped the page ran ahead of the GPU (the closing read-back waited 0.9 to 1.9 s with instancing on and 24 to 26 ms with it off), so single intervals leave GPU work out. Draw calls and triangles depend on the scene, not the GPU, and were read from the performance overlay. With 500 items the room cannot meet the 0.6 m rule, so most of this scene is red by design.

Benchmark page, uncapped: load time is a cold-cache load from navigation start to the first frame with the model drawn, so it includes loading the page, downloading the model and decoding it; median of 5 runs, each in a new browser context with the HTTP cache disabled; the contexts share one browser, so compiled shaders can carry over between runs. The model came from the same machine with no network throttling, so download time barely counts (at 10 Mbps the transfer alone would take 34.38 s for raw and 4.45 s for LOD0, calculated). Frame time covers 5 s of rendering after a 1 s warm-up, with the GPU drained every frame and 100 copies, enough load for the differences to show. The raw model is not part of the build; it was copied into a copy of `dist/` only for measuring.

| Model | File size | Load time, median of 5 | Frame time avg / p95, 100 copies, instancing on |
| ----- | --------- | ---------------------- | ----------------------------------------------- |
| Raw   | 42.98 MB  | **1,230.5 ms**         | **105.35 / 106.50 ms**                          |
| LOD0  | 5.57 MB   | **509.1 ms**           | **13.41 / 14.10 ms**                            |
| LOD1  | 1.76 MB   | **453.8 ms**           | **10.52 / 11.10 ms**                            |
| LOD2  | 0.71 MB   | **427.9 ms**           | **8.79 / 9.40 ms**                              |

100 LOD0 copies with instancing on and off: **13.41 / 14.10 ms and 21.36 / 22.20 ms**, with 28 and 2,800 draw calls, including the extra transmission pass that three.js adds for the glass pieces; 1,000 copies: 104.22 / 105.20 ms and 189.66 / 193.40 ms, with 28 and 28,000. Every configuration is listed in [docs/model-optimisation.md](docs/model-optimisation.md#browser-measurements).

To repeat the measurements on an Apple-silicon Mac: run `pnpm build`, copy `public/models/raw/` into `dist/models/` if you fetched the raw model, start `pnpm preview`, then run `pnpm measure:fps fps.json --base=http://127.0.0.1:4173` and `pnpm measure:bench bench.json --base=http://127.0.0.1:4173`.

## Assumptions

1. Clearance is the shortest edge-to-edge distance between two footprints. Less than 0.6 m breaks the rule; exactly 0.6 m passes. Overlaps are allowed but always break it.
2. Items rotate in 90° steps, and every footprint is a multiple of 0.5 m, so edges always sit on grid lines.
3. The origin is the north-west corner: x runs east (0–20 m), z runs south (0–12 m), and positions are footprint centres.
4. Snapping puts footprint edges on grid lines, and items cannot leave the room.
5. Equipment is drawn as simple procedural shapes merged per type, not glTF models; the glTF optimisation is shown on a sample model on the benchmark page.
6. Part numbers and prices are illustrative. Prices are in USD in both languages; number formats follow the language.
7. The Vietnamese strings are machine-assisted translations.
8. The layout autosaves to `localStorage` per project (and per host user when embedded), so a refresh keeps your work; `?seed=N` sessions are not saved.
9. Tags such as `CAB-01` are unique, ignoring case, so a rule message is never ambiguous.
10. Undo keeps the last 200 edits.
11. Arrow keys move items in room directions (Up is north), not relative to the camera.
12. With 500 items the room cannot satisfy the clearance rule (only about 120 small items can), so that scene is for measuring frame rate.
13. The separate design document describes the full production system; this editor is a working slice of it.

## Limitations and known issues

- No backend: drafts stay in the browser's `localStorage`, per origin and project, with no sync or multi-user editing. Two tabs on one project follow each other's saves; a tab with unsaved edits stops saving when another tab saves, and asks for a reload.
- The assistant is simulated, understands a few requests (fix clearance, summarise, count items) and forgets the conversation on reload.
- In embedded mode the token is received, refreshed and expired, but never used, because the editor makes no API calls.
- A host page that sizes the frame from the editor's `resize` messages can make it taller but never shorter again, so a host should give the frame a fixed height, as the demo host page does.
- The `frame-ancestors` header comes from the Vite servers. In production the web server has to send it, for example from `public/_headers` (Netlify and Cloudflare Pages format) with the host origins added.
- The editor itself does not use the optimised model or switch levels of detail.
- Automated browser tests run in headless Chromium only. Trackpad pinch, Safari gestures and touch are synthesised there, and screen-reader announcements are checked in the page, not with a real screen reader.
- `pnpm assets:fetch` unpacks KTX-Software only on macOS arm64. Elsewhere, install KTX-Software 4.4 or later and set `KTX_BIN`, or `pnpm assets:optimize` falls back to WebP textures.
- The browser console shows one deprecation warning, `THREE.Clock`, which comes from React Three Fiber 9.8.2's own code.
- Smaller code-level limits: [ARCHITECTURE.md §14](docs/ARCHITECTURE.md#14-known-limits).

## Reset

- **Clear layout** in the top bar removes every item in one undoable step. The empty layout is then saved, so a reload keeps the room empty.
- To get the sample layout back, run `localStorage.removeItem('layout-editor:v1:draft:demo')` in the browser console on http://localhost:5173 and reload. Clearing the site data for `localhost:5173` also resets the language, the single-key shortcut switch and the collapsed bill of materials (all keys start with `layout-editor:v1:`).
- `?seed=N` sessions neither load nor save the draft; `?seed=0` is an empty room.
- `localhost` and `127.0.0.1` keep separate drafts. In embedded mode the draft is keyed by the host's user and project ids (`layout-editor:v1:draft:nw-u-1042:nw-prj-2041`) and kept in the frame's storage.

## Licences and credits

- **3D model** (benchmark page only), as given in [public/models/a-beautiful-game/README.md](public/models/a-beautiful-game/README.md):
  - Source: [KhronosGroup/glTF-Sample-Assets, Models/ABeautifulGame](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/edc7c9e67c639d230715049ee31f9a96a6babbbe/Models/ABeautifulGame), commit `edc7c9e67c639d230715049ee31f9a96a6babbbe`.
  - Licence: [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/).
  - Credit: © 2020 ASWF, MaterialX Project (original model by Moeen Sayed and Mujtaba Sayed for SideFX), © 2022 Ed Mackey (conversion to glTF), CC BY 4.0.
  - Changes: geometry simplified with meshoptimizer, repeated meshes turned into GPU instances, textures resized and re-encoded as KTX2 (Basis Universal), vertex data quantised and Meshopt-compressed with glTF-Transform. Each file carries the credit in its `asset.copyright` field.
- **Fonts:** IBM Plex Sans and IBM Plex Mono, © IBM Corp., SIL Open Font License 1.1, self-hosted through Fontsource.
- **Runtime packages** (MIT): React, three.js, React Three Fiber, drei, zustand, Base UI, TanStack Query, TanStack Virtual, Sonner, zod, i18next, react-hotkeys-hook, clsx.
- **Tooling:** Vite, Vitest, ESLint, Prettier, jsdom, glTF-Transform, meshoptimizer (MIT); TypeScript, Playwright, sharp (Apache-2.0); axe-core for Playwright (MPL-2.0). Versions are pinned in `package.json`.
- The benchmark page decodes KTX2 textures with the [Basis Universal](https://github.com/BinomialLLC/basis_universal) transcoder (Apache-2.0) that ships with three.js; the build copies it unchanged into `dist/assets/`.

## AI assistance

Built by Avijit Dey with Claude Code and Claude Opus 5.5 (Anthropic). Claude wrote the code, tests and documentation; I directed and managed the work throughout. I set the requirements and constraints, made the product and technology decisions, decided how the work was split across AI agents and that every check was done by a team of agents that reviewed each other's findings, tested the app myself between phases and reported the bugs I found. [docs/AI-WORKFLOW.md](docs/AI-WORKFLOW.md) explains how the agents were organised and checked, with the key prompts.
