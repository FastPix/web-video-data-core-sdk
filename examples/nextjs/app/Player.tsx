"use client";

import { useEffect, useRef, useState } from "react";
import fastpixMetrix from "@fastpix/video-data-core";
import Hls from "hls.js";
import dashjs from "dashjs";

const WORKSPACE_ID = "YOUR_WORKSPACE_KEY";
const HLS_SRC = "https://stream.fastpix.com/7c8d5087-edf7-462f-a1b3-e2fbd30747fa.m3u8";
// FastPix sample is HLS-only; swap in your own .mpd.
const DASH_SRC = "https://dash.akamaized.net/akamai/bbb_30fps/bbb_30fps.mpd";

// SSR note: importing @fastpix/video-data-core at the top of a Client Component is
// safe. The package touches `window` at module scope only ONCE, guarded by
// `typeof window !== "undefined"` (to expose window.fastpixMetrix). `document` and
// `navigator` are read only inside functions the SDK runs from tracker() — never at
// import time. So the rule is simply: import anywhere, but call tracker() in an
// effect (client-only), never during render/SSR.
export default function Player() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [kind, setKind] = useState<"hls" | "dash">("hls");

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let hls: Hls | undefined;
    let dashPlayer: dashjs.MediaPlayerClass | undefined;
    const src = kind === "hls" ? HLS_SRC : DASH_SRC;
    const data = {
      workspace_id: WORKSPACE_ID,
      player_name: `Next.js ${kind.toUpperCase()} Player`,
      video_title: `Sample (${kind})`,
      video_id: `nextjs-${kind}`,
    };

    if (kind === "hls") {
      if (Hls.isSupported()) {
        hls = new Hls();
        hls.loadSource(src);
        hls.attachMedia(video);
        fastpixMetrix.tracker(video, { hlsjs: hls, Hls, data });
      } else {
        video.src = src; // Safari native HLS
        fastpixMetrix.tracker(video, { data });
      }
    } else {
      dashPlayer = dashjs.MediaPlayer().create();
      dashPlayer.initialize(video, src, false);
      fastpixMetrix.tracker(video, { dashPlayer, dashjs, data });
    }

    return () => {
      video.fp?.destroy();
      hls?.destroy();
      dashPlayer?.destroy();
    };
  }, [kind]);

  return (
    <div style={{ maxWidth: 760, margin: "2rem auto", fontFamily: "system-ui" }}>
      <h1>FastPix Data — Next.js (App Router)</h1>
      <p>Analytics initialised client-side in an effect. Import is SSR-safe.</p>
      <div style={{ marginBottom: "1rem" }}>
        <button onClick={() => setKind("hls")} disabled={kind === "hls"}>HLS</button>{" "}
        <button onClick={() => setKind("dash")} disabled={kind === "dash"}>DASH</button>
      </div>
      <video
        key={kind}
        ref={videoRef}
        controls
        playsInline
        style={{ width: "100%", background: "#000", borderRadius: 8 }}
      />
    </div>
  );
}
