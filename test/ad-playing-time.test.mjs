// view_ad_playing_time: time ad frames were actually playing. View 1 reports
// the ad's position (hls.js / dash.js) and is measured from that; view 2 never
// does (a wrapper) and falls back to the wall clock while an ad is rendered
// and not paused. Driven through configure()/dispatch() with no DOM. Run after
// `npm run build`:
//
//   node test/ad-playing-time.test.mjs

import assert from "node:assert/strict";
import { createRequire } from "node:module";

globalThis.window = globalThis;

const posts = [];
globalThis.fetch = async (_url, options) => {
  posts.push(...JSON.parse(options.body).events);
  return { ok: true };
};

const require = createRequire(import.meta.url);
const core = require("../dist/index.cjs");
const fp = core.default ?? core;

const KEY = "ad-playing-time-test";
let paused = false;

fp.configure(KEY, {
  debug: false,
  configDomain: "example.test",
  data: { workspace_id: "ws-test", video_id: "vid-1", player_name: "test" },
  fetchPlayheadTime: () => 0,
  fetchStateData: () => ({ player_is_paused: paused }),
});

const send = (name, payload) => fp.dispatch(KEY, name, payload);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const tick = (position, duration) => send("adprogress", { position, duration });
const ticks = (from, to, duration, step = 0.25) => {
  for (let p = from; p <= to + 1e-9; p += step) tick(Number(p.toFixed(4)), duration);
};
const open = (id) => send("adbreakstart", { view_ad_break_id: id, view_ad_break_position: "midroll" });
const play = (id, index) =>
  send("adplay", { view_ad_break_id: id, view_ad_asset_id: `${id}-${index}`, view_ad_asset_index: index });
const ended = (id, index) =>
  send("adended", { view_ad_break_id: id, view_ad_asset_id: `${id}-${index}` });

send("playerReady");
send("play");
send("playing");

// ---------------------------------------------------------------------------
// View 1: position reports.
// ---------------------------------------------------------------------------

// Ad A, 10 s. Loading: the position sits at 0 across several reports. Then it
// plays to 4 s, stalls (same position again), plays on to 9.9 s, and the
// engine ends it: the 0.1 s after the last report is credited as played out.
open("A");
play("A", 0);
tick(0, 10);
tick(0, 10);
tick(0, 10);
send("playing");
ticks(0, 4, 10);
tick(4, 10);
tick(4, 10);
tick(4, 10);
ticks(4, 9.9, 10, 0.1);
ended("A", 0);
// Ad B, 15 s, cut by the break's playout limit at 13 s: 13 s, no end credit.
play("A", 1);
send("playing");
ticks(0, 13, 15);
ended("A", 1);
send("adbreakend", {});
// Content resumes; the trailing window after adbreakend adds nothing
send("playing");
await sleep(700);

// Ad C: the first report is already at 6 s (a resume into the middle of the
// ad after a seek), so nothing before it is credited; then 2 s of playback.
open("C");
play("C", 0);
send("playing");
ticks(6, 8, 10);
ended("C", 0);
send("adbreakend", {});
send("playing");
await sleep(600);

const EXPECTED_VIEW_1 = 10000 + 13000 + 2000;

// ---------------------------------------------------------------------------
// View 2: no position reports; the wall clock while an ad is on screen.
// ---------------------------------------------------------------------------
send("videoChange", { video_id: "vid-2" });
send("play");
send("playing");

open("W");
play("W", 0);
await sleep(400); // waiting for the first frame: not ad time
send("playing"); // first frame
const renderedAt = Date.now();
await sleep(600);
paused = true;
send("pause"); // viewer pauses the ad
await sleep(400); // not ad time
paused = false;
send("playing");
await sleep(500);
const endedAt = Date.now();
ended("W", 0);
send("adbreakend", {});
send("playing");
await sleep(700); // the trailing window and content after it: not ad time
const shown = endedAt - renderedAt - 400;

// ---------------------------------------------------------------------------
// View 3: skips. hls.js raises the same asset-ended event for a skipped ad as
// for one that played out; the player UI dispatches adskipped first. The
// trailing adended is dropped, the next ad's is not.
// ---------------------------------------------------------------------------
send("videoChange", { video_id: "vid-3" });
send("play");
send("playing");

open("S");
play("S", 0);
send("playing");
ticks(0, 4, 10); // 4 s in, the viewer skips
send("adskipped", { view_ad_break_id: "S", view_ad_asset_id: "S-0" });
ended("S", 0); // hls.js's asset-ended for the skipped ad: dropped
play("S", 1);
send("playing");
ticks(0, 10, 10);
ended("S", 1); // the next ad really completed
send("adbreakend", {});
send("playing");
await sleep(100);

send("destroy");
await sleep(50);

const seen = new Set();
const rows = posts.filter((row) => {
  const key = `${row.veid}:${row.vesqnu}`;
  return !seen.has(key) && seen.add(key);
});
const viewIds = [...new Set(rows.map((row) => row.veid))];
assert.equal(viewIds.length, 3, "three views");
const lastOf = (viewId) => rows.filter((row) => row.veid === viewId).at(-1);
const namesOf = (viewId) =>
  rows.filter((row) => row.veid === viewId && row.evna.startsWith("ad")).map((row) => row.evna);

assert.equal(
  lastOf(viewIds[0]).veadpnti,
  EXPECTED_VIEW_1,
  "view 1: loading, stall, cut ad and resume are not ad time; the end tick is",
);

const reported = lastOf(viewIds[1]).veadpnti;
assert.ok(
  Math.abs(reported - shown) <= 120,
  `view 2: wall clock while rendered and not paused, got ${reported} for ${shown} shown`,
);

// View 3: one adskipped row, one adended row (the second ad's), one completion,
// no failed ad, and 4 s + 10 s of ad time
assert.deepEqual(
  namesOf(viewIds[2]),
  [
    "adbreakstart", "adplay", "adplaying", "adfirstquartile", "adskipped",
    "adplay", "adplaying", "adfirstquartile", "admidpoint", "adthirdquartile", "adended",
    "adbreakend",
  ],
  "view 3: the skipped ad's adended is dropped, the next ad's is kept",
);
const skipped = lastOf(viewIds[2]);
assert.equal(skipped.veadcpco, 1, "view 3: one completion");
assert.equal(skipped.veadimco, 2, "view 3: two impressions");
assert.equal(skipped.veaderco ?? 0, 0, "view 3: a skipped ad is not a failed ad");
assert.equal(skipped.veadpnti, 14000, "view 3: 4 s skipped + 10 s completed");

console.log("ad-playing-time: all assertions passed");
console.log("view 3:", namesOf(viewIds[2]).join(","));
console.log("view 1:", lastOf(viewIds[0]).veadpnti, "ms (expected", EXPECTED_VIEW_1 + ")");
console.log("view 2:", reported, "ms (shown", shown + " ms)");
