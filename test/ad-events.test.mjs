// Ad event state machine, driven through the public configure()/dispatch()
// API the wrappers use, with no DOM. Run after `npm run build`:
//
//   node test/ad-events.test.mjs
//
// Globals are set up the way React Native presents them: window is the global
// object, navigator exists, document is never declared. That also covers the
// 1.1.0 regression where configure() threw off the browser.

import assert from "node:assert/strict";
import { createRequire } from "node:module";

globalThis.window = globalThis;

const posts = [];
globalThis.fetch = async (url, options) => {
  const body = JSON.parse(options.body);
  posts.push({ url: String(url), events: body.events });
  return { ok: true };
};

const require = createRequire(import.meta.url);
const core = require("../dist/index.cjs");
const fp = core.default ?? core;

// One row per sequence number. At destroy the SDK posts its final batch twice
// (the viewCompleted purge leaves the queue in place, then the dispatcher's own
// destroy sends it again) unless another post happens to be in flight, and the
// backend deduplicates on view id and sequence number. The test does the same.
const rows = () => {
  const seen = new Set();
  return posts
    .flatMap((post) => post.events)
    .filter((row) => !seen.has(row.vesqnu) && seen.add(row.vesqnu));
};
const names = () => rows().map((row) => row.evna);
const last = (name) => [...rows()].reverse().find((row) => row.evna === name);
const flush = () => new Promise((resolve) => setTimeout(resolve, 50));

let playhead = 0;
let paused = false;
// The element's own clock. Left undefined until break 4 so everything before
// it runs on the fallback (content playhead), as a wrapper without it would.
let mediaTime;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// Real time passing with the element's clock advancing, as during playback
const playFor = async (ms) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    mediaTime += 40;
    await sleep(40);
  }
};

const KEY = "ad-events-test";

fp.configure(KEY, {
  debug: false,
  configDomain: "example.test",
  data: { workspace_id: "ws-test", video_id: "vid-1", player_name: "test" },
  fetchPlayheadTime: () => playhead,
  fetchMediaTime: () => mediaTime,
  fetchStateData: () => ({
    player_is_paused: paused,
    player_width: 640,
    player_height: 360,
    video_source_url: "https://stream.example.test/content.m3u8",
    video_source_duration: 60000,
  }),
});

const send = (name, payload) => fp.dispatch(KEY, name, payload);
// Ad progress as the engines report it: position and duration in seconds
const tick = (position, duration = 10) =>
  send("adprogress", { position, duration });
const ticks = (from, to, duration = 10, step = 0.25) => {
  for (let p = from; p <= to + 1e-9; p += step) tick(Number(p.toFixed(4)), duration);
};

// Content start
send("playerReady");
send("play");
send("playing");
playhead = 30000;
send("timeupdate", { player_playhead_time: 30000 });

// ---------------------------------------------------------------------------
// Break 1: two ads. Ad 1 plays with a pause at 4 s; ad 2 fails after a retry.
// ---------------------------------------------------------------------------
send("adbreakstart", {
  view_ad_break_id: "ad-mid-1",
  view_ad_break_position: "midroll",
  view_ad_time_offset: 30000,
  view_ad_duration: 20000,
});
// The asset list request and its answer are rows of their own
send("adrequest", {
  view_ad_break_id: "ad-mid-1",
  view_ad_request_id: "ad-mid-1",
  view_ad_tag_url: "https://ads.example.test/mid-1/list.json",
});
send("adresponse", {
  view_ad_break_id: "ad-mid-1",
  view_ad_request_id: "ad-mid-1",
  view_ad_response_count: 2,
});
send("adplay", {
  view_ad_break_id: "ad-mid-1",
  view_ad_asset_id: "ad-mid-1-0",
  view_ad_asset_index: 0,
  view_ad_asset_duration: 10000,
  view_ad_asset_url:
    "https://ads.example.test/mid-1/ad1.m3u8?token=eyJhbGciOiJIUzI1NiJ9.eyJ1aWQiOjQyfQ.sig&uid=42",
});
send("playing"); // first frame -> adplaying, impression 1
ticks(0, 4); // 0 .. 4 s of a 10 s ad: crosses 25 % at 2.5 s
paused = true;
send("pause"); // -> adpause
tick(4); // paused: same position again, nothing fires
tick(4);
paused = false;
send("playing"); // -> adplaying (resume), impression unchanged
ticks(4, 10); // 4 .. 10 s: crosses 50 % and 75 %
send("adended", { view_ad_break_id: "ad-mid-1", view_ad_asset_id: "ad-mid-1-0" });
send("adplay", {
  view_ad_break_id: "ad-mid-1",
  view_ad_asset_id: "ad-mid-1-1",
  view_ad_asset_index: 1,
});
send("aderror", {
  view_ad_break_id: "ad-mid-1",
  view_ad_asset_id: "ad-mid-1-1",
  view_ad_error_source: "hlsjs",
  view_ad_error_code: "manifestLoadError",
  view_ad_error_message:
    "A network error occurred while loading https://ads.example.test/mid-1/missing.m3u8?sig=abcdef0123456789abcdef0123456789 (404) " +
    "x".repeat(400),
});
send("aderror", {
  view_ad_break_id: "ad-mid-1",
  view_ad_asset_id: "ad-mid-1-1",
  view_ad_error_source: "hlsjs",
  view_ad_error_code: "manifestLoadError",
  view_ad_error_message: "retry failed",
});
send("adbreakend", { view_ad_duration: 20000 });
send("playing");

// ---------------------------------------------------------------------------
// Break 2: one ad, the viewer seeks from 1 s to 9 s. No quartile may fire for
// the jump; the viewer did not watch through 25, 50, or 75 percent.
// ---------------------------------------------------------------------------
playhead = 45000;
send("adbreakstart", {
  view_ad_break_id: "ad-mid-2",
  view_ad_break_position: "midroll",
  view_ad_time_offset: 45000,
  view_ad_duration: 10000,
});
send("adplay", {
  view_ad_break_id: "ad-mid-2",
  view_ad_asset_id: "ad-mid-2-0",
  view_ad_asset_index: 0,
  view_ad_asset_duration: 10000,
});
send("playing");
ticks(0, 1);
tick(9); // seek: 8 s in one report
ticks(9, 10);
send("adended", { view_ad_break_id: "ad-mid-2", view_ad_asset_id: "ad-mid-2-0" });
send("adbreakend", { view_ad_duration: 10000 });
send("playing");

// ---------------------------------------------------------------------------
// Break 3: a wrapper reports the midpoint from its ad SDK callback and the
// engine's progress check crosses the same threshold. One row, not two.
// ---------------------------------------------------------------------------
playhead = 50000;
send("adbreakstart", {
  view_ad_break_id: "ad-mid-3",
  view_ad_break_position: "midroll",
  view_ad_time_offset: 50000,
  view_ad_duration: 10000,
});
send("adplay", {
  view_ad_break_id: "ad-mid-3",
  view_ad_asset_id: "ad-mid-3-0",
  view_ad_asset_index: 0,
  view_ad_asset_duration: 10000,
});
send("playing");
ticks(0, 4.75);
send("admidpoint", {}); // wrapper callback arrives first
ticks(5, 6); // engine crosses 50 % just after: suppressed
send("adended", { view_ad_break_id: "ad-mid-3", view_ad_asset_id: "ad-mid-3-0" });
send("adbreakend", { view_ad_duration: 10000 });

// Content resumes and ends. The element is swapped back to the content: one
// play, and the browser raises waiting twice before the first frame.
send("play");
send("waiting");
send("waiting");
send("playing");
playhead = 60000;
send("timeupdate", { player_playhead_time: 60000 });

// ---------------------------------------------------------------------------
// Break 4: two ads, in real time, the way hls.js interstitials behave. The
// content playhead stands still for the whole break while the element's own
// clock runs the ad. Playing ad time must not read as buffering; a real ad
// stall must. Ad 1 then plays out and the browser raises pause and ended
// before the engine's adended: that pause is not the viewer's.
// ---------------------------------------------------------------------------
send("adbreakstart", {
  view_ad_break_id: "ad-mid-4",
  view_ad_break_position: "midroll",
  view_ad_time_offset: 60000,
  view_ad_duration: 20000,
});
send("adplay", {
  view_ad_break_id: "ad-mid-4",
  view_ad_asset_id: "ad-mid-4-0",
  view_ad_asset_index: 0,
  view_ad_asset_duration: 10000,
});
mediaTime = 0;
send("playing");
await playFor(1500); // ad playing, content playhead frozen at 60000
await sleep(1500); // the ad itself stalls: element clock stands still
await playFor(300); // and recovers
tick(9.75);
tick(10); // last progress report: nothing of the ad left
paused = true;
send("pause"); // browser's own pause at end of media, not the viewer
send("ended");
send("adended", { view_ad_break_id: "ad-mid-4", view_ad_asset_id: "ad-mid-4-0" });
send("adplay", {
  view_ad_break_id: "ad-mid-4",
  view_ad_asset_id: "ad-mid-4-1",
  view_ad_asset_index: 1,
  view_ad_asset_duration: 10000,
});
mediaTime = 0;
paused = false;
send("play");
send("playing");
send("adended", { view_ad_break_id: "ad-mid-4", view_ad_asset_id: "ad-mid-4-1" });
send("adbreakend", { view_ad_duration: 20000 });
send("playing");

send("ended");
send("destroy");

await flush();

const adRowsFor = (breakId) =>
  rows().filter((row) => row.evna.startsWith("ad") && row.veadbkid === breakId);
const seq = (breakId) => adRowsFor(breakId).map((row) => row.evna);

// 1. Break 1: the ad events are rows, in order, quartiles where playback
//    actually crossed them
assert.deepEqual(seq("ad-mid-1"), [
  "adbreakstart",
  "adrequest",
  "adresponse",
  "adplay",
  "adplaying",
  "adfirstquartile",
  "adpause",
  "adplaying",
  "admidpoint",
  "adthirdquartile",
  "adended",
  "adplay",
  "aderror",
  "aderror",
  "adbreakend",
]);

// 2. Counters: one impression across pause and resume, one failed attempt
//    settled at break end, never on the aderror rows
const errorRows = rows().filter((row) => row.evna === "aderror");
assert.equal(errorRows[0].veaderco ?? 0, 0, "error count must not move on aderror");
assert.equal(errorRows[1].veaderco ?? 0, 0, "error count must not move on retry");

const break1End = adRowsFor("ad-mid-1").find((row) => row.evna === "adbreakend");
assert.equal(break1End.veadbkco, 1, "break count");
assert.equal(break1End.veadatco, 2, "attempt count");
assert.equal(break1End.veadimco, 1, "impression count counted once");
assert.equal(break1End.veadcpco, 1, "complete count");
assert.equal(break1End.veaderco, 1, "one failed attempt at settlement");
assert.equal(break1End.veadsperco, 1, "startup error: ad 2 never rendered");
assert.equal(break1End.veadbkerco, 1, "break had an error");

// 3. Ad context rides every ad row; asset keys are absent on adbreakend
for (const row of adRowsFor("ad-mid-1")) {
  assert.equal(row.veadbkid, "ad-mid-1", `break id on ${row.evna}`);
}
const quartileRows = adRowsFor("ad-mid-1").filter((row) =>
  ["adfirstquartile", "admidpoint", "adthirdquartile"].includes(row.evna),
);
for (const row of quartileRows) {
  assert.equal(row.veadasid, "ad-mid-1-0", `asset id on ${row.evna}`);
  assert.equal(row.veisadpn, true, `ad flag on ${row.evna}`);
}
assert.equal(break1End.veadasid, undefined, "no asset id on adbreakend");

// 4. view_is_ad_playing: on inside the break, off on the adbreakend row
assert.equal(adRowsFor("ad-mid-1")[1].veisadpn, true);
assert.equal(break1End.veisadpn, false, "ad flag cleared on adbreakend row");

// 5. Redaction: query stripped from the asset URL, URL inside the message
//    redacted, message capped at 256
const firstPlay = adRowsFor("ad-mid-1").find((row) => row.evna === "adplay");
assert.equal(firstPlay.veadasur, "https://ads.example.test/mid-1/ad1.m3u8");
assert.ok(!errorRows[0].veaderms.includes("sig="), "query removed from message");
assert.ok(errorRows[0].veaderms.length <= 256, "message capped");

// 6. aderror flushes in its own POST rather than waiting for the batch
const errorPost = posts.find((post) => post.events.some((e) => e.evna === "aderror"));
assert.ok(errorPost, "aderror was posted");

// 7. Sequence numbers unique and increasing in the SDK stream
const seqs = rows().map((row) => row.vesqnu);
assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b));
assert.equal(new Set(seqs).size, seqs.length, "no duplicate sequence numbers");

// 8. Break 2: a seek across thresholds fires no quartile
assert.deepEqual(seq("ad-mid-2"), [
  "adbreakstart",
  "adplay",
  "adplaying",
  "adended",
  "adbreakend",
]);

// 9. Break 3: the engine crosses 25 % on its own, the wrapper reports the
//    midpoint first and the engine's crossing of 50 % is suppressed: one
//    admidpoint, not two
assert.deepEqual(seq("ad-mid-3"), [
  "adbreakstart",
  "adplay",
  "adplaying",
  "adfirstquartile",
  "admidpoint",
  "adended",
  "adbreakend",
]);

// 10. adprogress is internal: no row, and its raw fields never reach a beacon
assert.ok(!names().includes("adprogress"), "adprogress is not a row");
assert.ok(
  rows().every((row) => row.position === undefined && row.duration === undefined),
  "progress fields are not merged into view data",
);

// 11. Break 4: the pause the browser raises when an ad plays out is not an
//     adpause, and nothing else is disturbed by it
assert.deepEqual(seq("ad-mid-4"), [
  "adbreakstart",
  "adplay",
  "adplaying",
  "adended",
  "adplay",
  "adplaying",
  "adended",
  "adbreakend",
]);

// 12. Break 4: 1.5 s of ad playback with the content playhead frozen is not a
//     stall; the 1.5 s where the ad itself stood still is, once, and it lands
//     in the ad rebuffer fields with roughly its real length
const break4 = adRowsFor("ad-mid-4");
const break4End = break4.find((row) => row.evna === "adbreakend");
const firstAdPlaying = break4.find((row) => row.evna === "adplaying");
const firstAdEnded = break4.find((row) => row.evna === "adended");
const bufferingRows = rows().filter((row) => row.evna === "buffering");
const bufferedRows = rows().filter((row) => row.evna === "buffered");
assert.equal(bufferingRows.length, 1, "one buffering row: the real ad stall");
assert.equal(bufferedRows.length, 1, "one buffered row");
assert.ok(
  bufferingRows[0].vesqnu > firstAdPlaying.vesqnu &&
    bufferedRows[0].vesqnu < firstAdEnded.vesqnu,
  "the stall sits inside ad 1 of break 4",
);
assert.equal(break4End.veadrbco, 1, "ad rebuffer count");
assert.ok(
  break4End.veadrbdu >= 1200 && break4End.veadrbdu <= 2200,
  `ad rebuffer duration is about the 1.5 s stall, got ${break4End.veadrbdu}`,
);

// 13. The element's own play, playing, waiting, pause, and ended are not rows
//     while a break is open; outside a break they still are. A row of one of
//     those names with the ad flag set could only have come from inside one.
const elementNames = ["play", "playing", "waiting", "pause", "ended"];
const elementRowsInAd = rows().filter(
  (row) => elementNames.includes(row.evna) && row.veisadpn === true,
);
assert.deepEqual(
  elementRowsInAd.map((row) => row.evna),
  [],
  "no element rows inside an ad break",
);
// One playing at content start and one after each of the four breaks
assert.equal(
  rows().filter((row) => row.evna === "playing").length,
  5,
  "content playing rows are still sent",
);

// 14. Two waitings in a row before playback moves on are one row
assert.equal(
  rows().filter((row) => row.evna === "waiting").length,
  1,
  "repeated waiting is one row",
);

// 15. view_played_count is the plays that are rows: the one at content start
//     and the one resuming after break 3. The play inside break 4 is neither.
const playRows = rows().filter((row) => row.evna === "play").length;
assert.equal(playRows, 2, "play rows");
assert.equal(last("viewCompleted").vepyco, playRows, "played count matches play rows");

// 16. view_ad_playing_time is the ad's position moving, not the clock.
//     Break 1: 10 s played (the pause and its repeated reports add nothing).
//     Break 2: 2 s (the 8 s seek is not playback). Break 3: 6 s (the ad was
//     cut at 6 s of 10, so no end credit). Break 4: the first report lands at
//     9.75 s with nothing before it - a resume, not credited - then 0.25 s;
//     the real-time stretch and the stall add nothing because this view
//     measures from position, and ad 2 never reports one.
assert.equal(
  last("viewCompleted").veadpnti,
  10000 + 2000 + 6000 + 250,
  "ad playing time from position movement",
);

console.log("ad-events: all assertions passed");
console.log("rows:", names().join(","));
