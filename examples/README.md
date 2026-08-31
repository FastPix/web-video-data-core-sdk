# FastPix Video Data — Examples

Integration examples for [`@fastpix/video-data-core`](../README.md) across plain
HTML5, Next.js, and React + Vite. Replace `YOUR_WORKSPACE_KEY` in each example with
your own workspace key from the [FastPix dashboard](https://dashboard.fastpix.com).

| Example | What it shows | Run |
| --- | --- | --- |
| [`html5-demo/`](html5-demo/) | Plain `<video>`, native HLS + hls.js + dash.js | `npm run build` (repo root) then `npx serve .` from repo root, open `/examples/html5-demo/` |
| [`nextjs/`](nextjs/) | Client-only init under SSR (App Router) | `cd examples/nextjs && npm i && npm run dev` |
| [`react-vite/`](react-vite/) | Attach in effect, destroy on unmount (StrictMode) | `cd examples/react-vite && npm i && npm run dev` |

## HLS / DASH support matrix

The Data SDK is player-agnostic — it just needs the player instance — so HLS and
DASH both work in every example here (HLS.js and DASH.js are plain JS libraries).

| | Native `<video>` (no library) | hls.js | dash.js |
| --- | --- | --- | --- |
| HLS | ✅ Safari / iOS only | ✅ everywhere | — |
| DASH | ❌ no native DASH anywhere | — | ✅ everywhere |

Note: no browser plays DASH natively, so dash.js is always required. The
library-free path in `html5-demo/` is therefore HLS-only ([`native-hls.html`](html5-demo/native-hls.html)).

> The `fp-player` web component already ships the Data SDK built in, so it is
> intentionally not shown here — these examples cover attaching to third-party
> players (hls.js, dash.js) instead.
