interface ClockData {
  viewer_timestamp: number;
}

interface Timer {
  data: Record<string, number>;
  // Read at each slice rather than latched, so a break opening or closing
  // mid-slice costs at most one pulse of misattribution instead of the whole
  // break.
  adBreakActive?: boolean;
  // The trailing window after adbreakend, during which the break is still
  // flagged but no ad is on screen.
  adBreakClosing?: boolean;
  // The current ad has rendered a frame and is not paused: the only state in
  // which wall time is ad playing time.
  adAssetRendered?: boolean;
  adAssetPaused?: boolean;
  // This view reports the ad's own position, which then owns
  // view_ad_playing_time outright; the wall clock is the fallback for
  // integrations that never report one.
  adTimeFromProgress?: boolean;
  // Held off data deliberately. A counter advancing every slice would count as
  // changed on every beacon and be transmitted with all of them; this one is
  // copied into data only at the moment a stretch is reported.
  renditionPlayingTime?: number;
}

export class WallClockTimeTracker {
  lastTrackedWallClockTime: number | null = null;
  clock: Timer;
  emitter: { on: (event: string, callback: Function) => void };

  constructor(
    clock: Timer,
    emitter: { on: (event: string, callback: Function) => void },
  ) {
    this.clock = clock;
    this.emitter = emitter;
    this.initialize();
  }

  initialize(): void {
    this.emitter.on("pulseStart", (data: ClockData) =>
      this.captureViewingProgress(this.clock, data),
    );
    this.emitter.on("pulseEnd", (data: ClockData) =>
      this.demolishViewingProgress(this.clock, data),
    );
  }

  captureViewingProgress(timer: Timer, data: ClockData): void {
    const currentTime = data?.viewer_timestamp;

    if (this.lastTrackedWallClockTime === null) {
      this.lastTrackedWallClockTime = currentTime;
    } else if (currentTime) {
      const timeElapsed = currentTime - this.lastTrackedWallClockTime;
      timer.data["view_watch_time"] =
        (timer.data["view_watch_time"] ?? 0) + timeElapsed;

      // Ad time is accrued from the same slices as watch time, which only
      // advance while the media itself does. Measuring the break from open to
      // close instead swallowed its buffering and any pause inside it, and
      // reported more ad played than the ad was long.
      if (timer.adBreakActive) {
        // Only while an ad is actually on screen: not the wait for its first
        // frame, not a pause inside it, and not the trailing window after
        // adbreakend. A view that reports the ad's position measures from
        // that instead (see the adprogress handler), so nothing is added here.
        if (
          !timer.adBreakClosing &&
          timer.adAssetRendered &&
          !timer.adAssetPaused &&
          !timer.adTimeFromProgress
        ) {
          timer.data["view_ad_playing_time"] =
            (timer.data["view_ad_playing_time"] ?? 0) + timeElapsed;
        }
      } else {
        // The stretch at the rendition currently selected. Ads are excluded so
        // this reconciles against view_content_playback_time; an ad's own
        // renditions are a different question, answered by the field above.
        // Reported and reset by the rendition change handler, which is what
        // turns one running counter into a series of per rendition stretches.
        timer.renditionPlayingTime =
          (timer.renditionPlayingTime ?? 0) + timeElapsed;
      }

      this.lastTrackedWallClockTime = currentTime;
    }
  }

  demolishViewingProgress(timer: Timer, data: ClockData): void {
    this.captureViewingProgress(timer, data);
    this.lastTrackedWallClockTime = null;
  }
}
