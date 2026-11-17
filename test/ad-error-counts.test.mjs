// Ad attempt and error counters when ads raise errors. Every aderror is a row;
// the counters describe what became of each ad, and are settled when its break
// closes. Driven through configure()/dispatch() with no DOM. Run after
// `npm run build`:
//
//   node test/ad-error-counts.test.mjs

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

const KEY = "ad-error-counts-test";

fp.configure(KEY, {
  debug: false,
  configDomain: "example.test",
  data: { workspace_id: "ws-test", video_id: "vid-1", player_name: "test" },
  fetchPlayheadTime: () => 0,
  fetchStateData: () => ({ player_is_paused: false }),
});

const send = (name, payload) => fp.dispatch(KEY, name, payload);
const open = (breakId) =>
  send("adbreakstart", { view_ad_break_id: breakId, view_ad_break_position: "midroll" });
const play = (breakId, assetId, index) =>
  send("adplay", { view_ad_break_id: breakId, view_ad_asset_id: assetId, view_ad_asset_index: index });
const error = (breakId, assetId) =>
  send("aderror", {
    view_ad_break_id: breakId,
    view_ad_asset_id: assetId,
    view_ad_error_source: "hlsjs",
    view_ad_error_code: "fragLoadError",
  });
const ended = (breakId, assetId) =>
  send("adended", { view_ad_break_id: breakId, view_ad_asset_id: assetId });
const close = () => {
  send("adbreakend", {});
  send("playing");
};

send("playerReady");
send("play");
send("playing");

// A. One ad on a bad network: a load fails and is retried before the first
//    frame, two more fail and are retried while it plays, and it plays to the
//    end. One attempt, no failed ad.
open("A");
play("A", "A-0", 0);
error("A", "A-0");
send("playing");
error("A", "A-0");
error("A", "A-0");
ended("A", "A-0");
close();

// B. A pod of two. While the first ad plays, hls.js preloads the second, the
//    load fails and is retried, and the second ad then plays normally. Two
//    attempts, no failed ad.
open("B");
play("B", "B-0", 0);
send("playing");
error("B", "B-1");
error("B", "B-1");
ended("B", "B-0");
play("B", "B-1", 1);
send("playing");
ended("B", "B-1");
close();

// C. An ad renders, then fails for good: no adended, the break just closes.
//    One attempt, one failed ad, and not a startup failure - it was on screen.
open("C");
play("C", "C-0", 0);
send("playing");
error("C", "C-0");
close();

// D. An ad that fails before the player ever selects it: errors, no adplay.
//    One attempt, one failed ad, one startup failure.
open("D");
error("D", "D-0");
error("D", "D-0");
close();

send("destroy");
await new Promise((resolve) => setTimeout(resolve, 50));

// One row per sequence number; the final batch can be posted twice at destroy
const seen = new Set();
const rows = posts.filter((row) => !seen.has(row.vesqnu) && seen.add(row.vesqnu));

// Counters are cumulative over the view; each break is judged on what it added
const counters = (row) => ({
  attempts: row?.veadatco ?? 0,
  impressions: row?.veadimco ?? 0,
  completes: row?.veadcpco ?? 0,
  errors: row?.veaderco ?? 0,
  breaksWithError: row?.veadbkerco ?? 0,
  startupErrors: row?.veadsperco ?? 0,
});
const ends = rows.filter((row) => row.evna === "adbreakend");
assert.equal(ends.length, 4, "four breaks closed");
const added = ends.map((row, i) => {
  const now = counters(row);
  const before = counters(ends[i - 1]);
  return Object.fromEntries(Object.keys(now).map((key) => [key, now[key] - before[key]]));
});

assert.deepEqual(
  added[0],
  { attempts: 1, impressions: 1, completes: 1, errors: 0, breaksWithError: 0, startupErrors: 0 },
  "A: an ad that recovered and completed is one attempt and not a failure",
);
assert.deepEqual(
  added[1],
  { attempts: 2, impressions: 2, completes: 2, errors: 0, breaksWithError: 0, startupErrors: 0 },
  "B: an error before adplay does not make the ad two attempts",
);
assert.deepEqual(
  added[2],
  { attempts: 1, impressions: 1, completes: 0, errors: 1, breaksWithError: 1, startupErrors: 0 },
  "C: an ad that rendered and then failed is a failure, not a startup one",
);
assert.deepEqual(
  added[3],
  { attempts: 1, impressions: 0, completes: 0, errors: 1, breaksWithError: 1, startupErrors: 1 },
  "D: an ad that never started is one attempt and a startup failure",
);

// The rows are untouched: every aderror is still sent
assert.equal(rows.filter((row) => row.evna === "aderror").length, 8, "eight aderror rows");

console.log("ad-error-counts: all assertions passed");
added.forEach((delta, i) => console.log("break", "ABCD"[i], JSON.stringify(delta)));
