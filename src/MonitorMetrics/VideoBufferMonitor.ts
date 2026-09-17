// Define types for data and parameters used in the classes
interface BufferData {
  view_rebuffer_count?: number;
  view_rebuffer_duration?: number;
  view_ad_rebuffer_count?: number;
  view_ad_rebuffer_duration?: number;
  view_watch_time?: number;
  view_rebuffer_frequency?: number | null;
  view_rebuffer_percentage?: number;
  // Timestamp of the most recent rebuffer. Sent rather than an elapsed value so
  // 'time since' can be measured against any beacon's viewer_timestamp
  view_last_rebuffer_start_time?: number;
  player_playhead_time: number;
}

interface Params {
  disablePlayheadRebufferTracking: boolean;
  allowRebufferTracking?: boolean;
  adBreakActive?: boolean;
  data: BufferData;
  userConfigData?: {
    actionableData?: {
      debug?: boolean;
    };
  };
  dispatch: (event: string, data?: Record<string, any>) => void;
  filterData: (event: string) => void;
  gripper?: {
    videoDragged: boolean;
  };
  playheadProgressing: boolean;
}

interface Emitter {
  on: (
    event: string,
    callback: (data: { viewer_timestamp: number }) => void,
  ) => void;
}

interface ViewerData {
  viewer_timestamp: number;
}

class BufferProcessor {
  [x: string]: any;
  startTimer: number | undefined;
  // Parallel to startTimer, but only running when adBreakActive was true at
  // the buffering event. Kept separate so a stall that straddles an ad-to-
  // content transition can't credit its tail to the wrong bucket.
  startTimerAd: number | undefined;
  params: Params;
  emitter: Emitter;

  constructor(params: Params, emitter: Emitter) {
    this.params = params;
    this.emitter = emitter;

    if (!params.allowRebufferTracking) {
      this.initEventListeners();
    }
  }

  initEventListeners() {
    this.emitter.on("pulseStart", (data: ViewerData) =>
      this.processBufferMetrics(data),
    );
    this.emitter.on("buffering", (data: ViewerData) =>
      this.handleBufferingStart(data),
    );
    this.emitter.on("buffered", (data: ViewerData) =>
      this.handleBufferingEnd(data),
    );
    this.emitter.on("configureView", () => this.resetTimer());
  }

  handleBufferingStart(data: ViewerData) {
    // An ad stalling is not the content stalling. hls.js plays interstitials
    // through the same media element, so a buffering event raised during a
    // break describes the ad. It is credited to the ad rebuffer bucket
    // instead, so ad delivery quality shows up on its own field and content
    // rebuffer frequency and percentage stay clean.
    if (this.params.adBreakActive) {
      if (!this.startTimerAd) {
        this.params.data.view_ad_rebuffer_count =
          (this.params.data.view_ad_rebuffer_count ?? 0) + 1;
        this.startTimerAd = data.viewer_timestamp;
      }
      return;
    }

    if (!this.startTimer) {
      this.params.data.view_last_rebuffer_start_time = data.viewer_timestamp;
      this.params.data.view_rebuffer_count =
        (this.params.data.view_rebuffer_count ?? 0) + 1;
      this.startTimer = data.viewer_timestamp;
    }
  }

  handleBufferingEnd(data: ViewerData) {
    if (this.startTimerAd) {
      this.params.data.view_ad_rebuffer_duration =
        (this.params.data.view_ad_rebuffer_duration ?? 0) +
        (data.viewer_timestamp - this.startTimerAd);
      this.startTimerAd = undefined;
      return;
    }
    this.processBufferMetrics(data);
    this.startTimer = undefined;
  }

  processBufferMetrics(timer: ViewerData) {
    if (this.startTimer) {
      const timeDiff = timer.viewer_timestamp - this.startTimer;
      this.params.data.view_rebuffer_duration =
        (this.params.data.view_rebuffer_duration ?? 0) + timeDiff;
      this.startTimer = timer.viewer_timestamp;

      if (this.params.data.view_rebuffer_duration > 300000) {
        this.delayBufferDestroyer();
      }
    }

    if (
      this.params.data.view_watch_time &&
      this.params.data.view_watch_time >= 0
    ) {
      if (
        this.params.data.view_rebuffer_count &&
        this.params.data.view_rebuffer_count > 0
      ) {
        this.params.data.view_rebuffer_frequency =
          this.params.data.view_rebuffer_count /
          this.params.data.view_watch_time;

        if (this.params.data.view_rebuffer_duration) {
          this.params.data.view_rebuffer_percentage =
            this.params.data.view_rebuffer_duration /
            this.params.data.view_watch_time;
        }
      }
    }
  }

  delayBufferDestroyer() {
    this.params.dispatch("viewCompleted");
    this.params.filterData("viewCompleted");

    if (this.params?.userConfigData?.actionableData?.debug) {
      console.warn(
        "Buffering lasted for more than five minutes, any subsequent events will be ignored unless there's a programChange or videoChange event.",
      );
    }
  }

  resetTimer() {
    this.startTimer = undefined;
    this.startTimerAd = undefined;
  }
}

class BufferMonitor {
  isWaiting: boolean;
  lastCheckedTime: number | null;
  lastPlayheadTime: number | null;
  lastUpdatedTime: number | null;
  waiter: Params;
  emitter: Emitter;

  constructor(waiter: Params, emitter: Emitter) {
    this.waiter = waiter;
    this.emitter = emitter;
    this.isWaiting = false;
    this.lastCheckedTime = null;
    this.lastPlayheadTime = null;
    this.lastUpdatedTime = null;

    if (
      !waiter.allowRebufferTracking &&
      !waiter.disablePlayheadRebufferTracking
    ) {
      this.setupEventListeners();
    }
  }

  setupEventListeners() {
    this.emitter.on("pulseStart", (data: ViewerData) =>
      this.checkForBuffering(data),
    );
    this.emitter.on("pulseEnd", (data: ViewerData) =>
      this.handleBufferingEnd(data),
    );
    this.emitter.on("seeking", (data: ViewerData) =>
      this.handleBufferingEnd(data),
    );
    this.emitter.on("viewCompleted", (data: ViewerData) =>
      this.handleBufferingEnd(data),
    );
  }

  checkForBuffering(data: ViewerData) {
    if (this.shouldResetBuffering()) {
      this.handleBufferingEnd(data);
      return;
    }

    if (this.lastCheckedTime === null) {
      this.startBuffering(data.viewer_timestamp);
      return;
    }

    if (this.isPlayheadStuck()) {
      const elapsed = data.viewer_timestamp - (this.lastUpdatedTime ?? 0);
      if (elapsed >= 1000 && !this.isWaiting) {
        this.triggerBuffering(data);
      }
      this.lastCheckedTime = data.viewer_timestamp;
    } else {
      this.handleBufferingEnd(data, true);
    }
  }

  shouldResetBuffering(): boolean {
    return (
      !!this.waiter.gripper?.videoDragged || !this.waiter.playheadProgressing
    );
  }

  isPlayheadStuck(): boolean {
    return this.lastPlayheadTime === this.waiter.data.player_playhead_time;
  }

  startBuffering(currentTime: number) {
    this.lastCheckedTime = currentTime;
    this.lastPlayheadTime = this.waiter.data.player_playhead_time;
    this.lastUpdatedTime = currentTime;
  }

  triggerBuffering(data: ViewerData) {
    this.isWaiting = true;
    this.waiter.dispatch("buffering", {
      viewer_timestamp: this.lastUpdatedTime,
    });
  }

  handleBufferingEnd(data: ViewerData | undefined, reset: boolean = false) {
    if (this.isWaiting) {
      this.endBuffering(data);
    } else {
      if (this.lastCheckedTime === null) {
        return;
      }

      if (this.hasSignificantProgress(data)) {
        this.recalibrateBuffering(data);
      }
    }

    if (reset) {
      this.startBuffering(data?.viewer_timestamp ?? 0);
    } else {
      this.clearBufferingState();
    }
  }

  endBuffering(data: ViewerData | undefined) {
    this.isWaiting = false;
    this.waiter.dispatch("buffered", {
      viewer_timestamp: data?.viewer_timestamp,
    });
  }

  hasSignificantProgress(data: ViewerData | undefined): boolean {
    const playheadDifference =
      this.waiter.data.player_playhead_time - (this.lastPlayheadTime ?? 0);
    const viewerTimeDifference =
      (data?.viewer_timestamp ?? 0) - (this.lastUpdatedTime ?? 0);
    return (
      playheadDifference > 0 && viewerTimeDifference - playheadDifference > 250
    );
  }

  recalibrateBuffering(data: ViewerData | undefined) {
    const playheadDifference =
      this.waiter.data.player_playhead_time - (this.lastPlayheadTime ?? 0);
    const viewerTimeDifference =
      (data?.viewer_timestamp ?? 0) - (this.lastUpdatedTime ?? 0);
    this.waiter.dispatch("buffering", {
      viewer_timestamp: this.lastUpdatedTime,
    });
    this.waiter.dispatch("buffered", {
      viewer_timestamp:
        (this.lastUpdatedTime ?? 0) + viewerTimeDifference - playheadDifference,
    });
    this.lastCheckedTime = null;
  }

  clearBufferingState() {
    this.lastCheckedTime = null;
    this.lastPlayheadTime = null;
    this.lastUpdatedTime = null;
  }
}

export { BufferMonitor, BufferProcessor };
