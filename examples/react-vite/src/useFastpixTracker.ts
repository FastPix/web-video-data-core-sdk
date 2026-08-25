import { useEffect, useRef } from "react";
import fastpixMetrix from "@fastpix/video-data-core";
import Hls from "hls.js";
import dashjs from "dashjs";

type Kind = "hls" | "dash";

// Attaches FastPix analytics to a <video> and tears everything down on unmount.
//
// StrictMode note: in dev, React mounts -> unmounts -> remounts. The cleanup below
// calls video.fp.destroy(), which removes every listener the SDK registered, tears
// down hls/dash monitoring, and deletes the SDK's internal state entry for this
// element. tracker() also auto-destroys any pre-existing `fp` on the element, so the
// remount starts clean and views are NOT double-counted.
export function useFastpixTracker(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  opts: { kind: Kind; src: string; metadata: Record<string, unknown> },
) {
  const { kind, src, metadata } = opts;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let hls: Hls | undefined;
    let dashPlayer: dashjs.MediaPlayerClass | undefined;

    if (kind === "hls") {
      if (Hls.isSupported()) {
        hls = new Hls();
        hls.loadSource(src);
        hls.attachMedia(video);
        fastpixMetrix.tracker(video, {
          hlsjs: hls,
          Hls,
          data: metadata,
        });
      } else {
        // Safari: native HLS, no library => playerType "unknown"
        video.src = src;
        fastpixMetrix.tracker(video, { data: metadata });
      }
    } else {
      dashPlayer = dashjs.MediaPlayer().create();
      dashPlayer.initialize(video, src, false);
      fastpixMetrix.tracker(video, {
        dashPlayer,
        dashjs,
        data: metadata,
      });
    }

    return () => {
      // Detaches all SDK listeners + internal state (handles StrictMode remount).
      video.fp?.destroy();
      hls?.destroy();
      dashPlayer?.destroy();
    };
  }, [kind, src]); // eslint-disable-line react-hooks/exhaustive-deps
}
