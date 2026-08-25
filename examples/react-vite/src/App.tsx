import { useRef, useState } from "react";
import { useFastpixTracker } from "./useFastpixTracker";

const WORKSPACE_ID = "YOUR_WORKSPACE_KEY";
const HLS_SRC = "https://stream.fastpix.com/7c8d5087-edf7-462f-a1b3-e2fbd30747fa.m3u8";
// FastPix sample is HLS-only; swap in your own .mpd.
const DASH_SRC = "https://dash.akamaized.net/akamai/bbb_30fps/bbb_30fps.mpd";

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [kind, setKind] = useState<"hls" | "dash">("hls");

  useFastpixTracker(videoRef, {
    kind,
    src: kind === "hls" ? HLS_SRC : DASH_SRC,
    metadata: {
      workspace_id: WORKSPACE_ID,
      player_name: `React-Vite ${kind.toUpperCase()} Player`,
      video_title: `Sample (${kind})`,
      video_id: `react-vite-${kind}`,
    },
  });

  return (
    <main style={{ maxWidth: 760, margin: "2rem auto", fontFamily: "system-ui" }}>
      <h1>FastPix Data — React + Vite (StrictMode on)</h1>
      <p>
        Switch source or watch a StrictMode remount: cleanup calls{" "}
        <code>video.fp.destroy()</code>, so listeners detach and views are not double-counted.
      </p>
      <div style={{ marginBottom: "1rem" }}>
        <button onClick={() => setKind("hls")} disabled={kind === "hls"}>HLS</button>{" "}
        <button onClick={() => setKind("dash")} disabled={kind === "dash"}>DASH</button>
      </div>
      {/* key forces a full remount on source change, exercising destroy/re-attach */}
      <video
        key={kind}
        ref={videoRef}
        controls
        playsInline
        style={{ width: "100%", background: "#000", borderRadius: 8 }}
      />
    </main>
  );
}
