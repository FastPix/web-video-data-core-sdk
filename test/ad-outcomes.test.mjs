// view_ad_outcome, view_ad_break_end_reason and the per-outcome counters: one
// break per way an ad can end, and on every adbreakend the identity
//   attempts = complete + error + skip + canceled + abandoned + timed_out + unknown
// (no attempt is still open once a break has settled). Driven through
// configure()/dispatch() with no DOM. The watchdog case waits the real 30 s
// idle interval, so the run takes about 35 s. Run after `npm run build`:
//
//   node test/ad-outcomes.test.mjs

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

const KEY = "ad-outcomes-test";

fp.configure(KEY, {
  debug: false,
  configDomain: "example.test",
  data: { workspace_id: "ws-test", video_id: "vid-1", player_name: "test" },
  fetchPlayheadTime: () => 0,
  fetchStateData: () => ({ player_is_paused: false }),
});

const send = (name, payload) => fp.dispatch(KEY, name, payload);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const tick = (position, duration = 10) => send("adprogress", { position, duration });
const ticks = (from, to, duration = 10, step = 0.25) => {
  for (let p = from; p <= to + 1e-9; p += step) tick(Number(p.toFixed(4)), duration);
};
const open = (id) => send("adbreakstart", { view_ad_break_id: id, view_ad_break_position: "midroll" });
const play = (id, index = 0) =>
  send("adplay", { view_ad_break_id: id, view_ad_asset_id: `${id}-${index}`, view_ad_asset_index: index });
const ended = (id, index = 0) =>
  send("adended", { view_ad_break_id: id, view_ad_asset_id: `${id}-${index}` });
const close = () => {
  send("adbreakend", {});
  send("playing");
};

send("playerReady");
send("play");
send("playing");

// A. completed: plays to the end
open("A"); play("A"); send("playing"); ticks(0, 10); ended("A"); close();

// B. skipped: the player UI dispatches adskipped, the engine's adended follows
open("B"); play("B"); send("playing"); ticks(0, 4);
send("adskipped", { view_ad_break_id: "B", view_ad_asset_id: "B-0" });
ended("B"); close();

// C. unknown: the break's playout limit cuts the ad at 6 s of 10 (hls.js
//    reports the limit, then the same asset-ended event as a natural end)
open("C"); play("C"); send("playing"); ticks(0, 6);
send("adplayoutlimit"); ended("C"); close();

// D. canceled: the viewer seeks out of the ad; the engine closes the break
//    with the ad still open
open("D"); play("D"); send("playing"); ticks(0, 3);
send("seeking"); close();

// E. no fill: the asset list came back empty; the break opens and closes
//    with nothing attempted
send("adrequest", { view_ad_break_id: "E", view_ad_request_id: "E" });
send("adresponse", { view_ad_break_id: "E", view_ad_request_id: "E", view_ad_response_count: 0 });
open("E"); close();

// F. break failed: the asset list never loaded; an error with no asset
open("F");
send("aderror", { view_ad_break_id: "F", view_ad_error_source: "hlsjs", view_ad_error_code: "assetListLoadError" });
close();

// G. failed ad inside a completed break: ad 0 never renders, ad 1 plays
open("G"); play("G", 0);
send("aderror", { view_ad_break_id: "G", view_ad_asset_id: "G-0", view_ad_error_source: "hlsjs", view_ad_error_code: "manifestLoadError" });
play("G", 1); send("playing"); ticks(0, 10); ended("G", 1); close();

// H. timed out: an ad is selected and nothing happens for the idle interval
open("H"); play("H");
await sleep(31000);
send("playing");

// I. canceled by source change: the page moves to another video mid-ad
open("I"); play("I"); send("playing"); ticks(0, 2);
send("videoChange", { video_id: "vid-2" });
send("play"); send("playing");

// J. abandoned: the view ends (player destroyed) mid-ad, after first frame
open("J"); play("J"); send("playing"); ticks(0, 2);
send("destroy");
await sleep(50);

// ---------------------------------------------------------------------------

const seen = new Set();
const rows = posts.filter((row) => {
  const key = `${row.veid}:${row.vesqnu}`;
  return !seen.has(key) && seen.add(key);
});
const viewIds = [...new Set(rows.map((row) => row.veid))];
assert.equal(viewIds.length, 2, "two views");
const view1 = rows.filter((row) => row.veid === viewIds[0]);
const view2 = rows.filter((row) => row.veid === viewIds[1]);

const counters = (row) => ({
  attempts: row?.veadatco ?? 0,
  complete: row?.veadcpco ?? 0,
  error: row?.veaderco ?? 0,
  skip: row?.veadkpco ?? 0,
  canceled: row?.veadclco ?? 0,
  abandoned: row?.veadabco ?? 0,
  timedOut: row?.veadtmouco ?? 0,
  unknown: row?.veadukco ?? 0,
});
const delta = (now, before) =>
  Object.fromEntries(Object.keys(now).map((key) => [key, now[key] - before[key]]));
const identity = (c) =>
  c.complete + c.error + c.skip + c.canceled + c.abandoned + c.timedOut + c.unknown;

// Every settled break: the identity closes, and the break names its reason
const ends = view1.filter((row) => row.evna === "adbreakend");
assert.equal(ends.length, 8, "eight breaks closed in view 1");
ends.forEach((row) => {
  const c = counters(row);
  assert.equal(c.attempts, identity(c), `identity on adbreakend of ${row.veadbkid}: ${JSON.stringify(c)}`);
  assert.equal(row.veadoc, undefined, `no per-attempt outcome on the adbreakend row of ${row.veadbkid}`);
});
const added = ends.map((row, i) => delta(counters(row), counters(ends[i - 1])));
const reason = (i) => ends[i].veadbkedrz;

assert.deepEqual([added[0].attempts, added[0].complete, reason(0)], [1, 1, "completed"], "A completed");
assert.deepEqual([added[1].attempts, added[1].skip, added[1].complete, reason(1)], [1, 1, 0, "skipped"], "B skipped");
assert.deepEqual([added[2].attempts, added[2].unknown, added[2].complete, reason(2)], [1, 1, 0, "playout_limit"], "C playout cut");
assert.deepEqual([added[3].attempts, added[3].canceled, reason(3)], [1, 1, "canceled"], "D seek out");
assert.deepEqual([added[4].attempts, reason(4)], [0, "no_fill"], "E no fill");
assert.deepEqual([added[5].attempts, added[5].error, reason(5)], [1, 1, "failed"], "F list failed");
assert.deepEqual([added[6].attempts, added[6].error, added[6].complete, reason(6)], [2, 1, 1, "completed"], "G one failed inside a completed break");
assert.deepEqual([added[7].attempts, added[7].timedOut, reason(7)], [1, 1, "timed_out"], "H watchdog");

// Terminal rows carry the attempt's outcome
const outcomeOf = (breakId, name) => view1.find((row) => row.veadbkid === breakId && row.evna === name)?.veadoc;
assert.equal(outcomeOf("A", "adended"), "completed");
assert.equal(outcomeOf("B", "adskipped"), "skipped");
assert.equal(view1.filter((row) => row.veadbkid === "B" && row.evna === "adended").length, 0, "B: skipped ad's adended dropped");
assert.equal(outcomeOf("C", "adended"), "unknown");
assert.equal(outcomeOf("G", "adended"), "completed");

// I. source change: settled on viewCompleted as canceled
const end1 = view1.at(-1);
assert.equal(end1.evna, "viewCompleted");
const c1 = counters(end1);
assert.equal(c1.attempts, identity(c1), "identity on viewCompleted of view 1");
assert.equal(c1.canceled - counters(ends[7]).canceled, 1, "I: canceled by source change");
assert.equal(end1.veadbkedrz, "canceled", "I: break reason on viewCompleted");

// J. abandoned: settled on viewCompleted of view 2
const end2 = view2.at(-1);
assert.equal(end2.evna, "viewCompleted");
const c2 = counters(end2);
assert.deepEqual([c2.attempts, c2.abandoned, end2.veadbkedrz], [1, 1, "view_ended"], "J: abandoned");
assert.equal(end2.veadxtbostco ?? 0, 0, "J: after first frame, so not exit-before-start");

// Wire keys: none of the new fields leaked as underscored words
const leaked = rows.flatMap((row) => Object.keys(row).filter((key) => key.includes("_")));
assert.deepEqual(leaked, [], `underscored wire keys: ${leaked.join(",")}`);

console.log("ad-outcomes: all assertions passed");
ends.forEach((row, i) => console.log(row.veadbkid, reason(i), JSON.stringify(added[i])));
console.log("view 1 end:", JSON.stringify(c1), "| view 2 end:", JSON.stringify(c2));
