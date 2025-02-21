import { metricUpdation } from "../CommonMethods/index";
import { timestamp } from "../CommonMethods/index";

type Emitter = {
  on: (event: string, callback: (...args: any[]) => void) => void;
};

type PlaybackData = {
  player_playhead_time: number;
  view_content_playback_time?: number;
};

type Playback = {
  data: PlaybackData;
};

export class PlaybackProgressMonitor {
  playbackTimeTrackerLastPosition: number = -1;
  prevPlaybackTime: number = timestamp.now();
  playbackProgressCallback: (() => void) | null = null;
  prevProgressPlaybackTime: number = 0;
  emitter: Emitter;
  playback: Playback;

  constructor(playback: Playback, emitter: Emitter) {
    this.emitter = emitter;
    this.playback = playback;
    this.initialize();
  }

  initialize() {
    this.emitter.on("playing", () => {
      this.initiatePlaybackMonitoring();
    });

    this.emitter.on("seeked", () => {
      this.initiatePlaybackMonitoring();
    });

    this.emitter.on("seeking", () => {
      this.stopPlaybackMonitoring();
    });

    this.emitter.on("pulseEnd", () => {
      this.stopPlaybackMonitoring();
    });

    this.emitter.on("configureView", () => {
      this.resetState();
    });
  }

  resetState() {
    this.playbackTimeTrackerLastPosition = -1;
    this.prevPlaybackTime = timestamp.now();
    this.playbackProgressCallback = null;
    this.prevProgressPlaybackTime = 0;
  }

  initiatePlaybackMonitoring() {
    if (this.playbackProgressCallback === null) {
      this.playbackProgressCallback = this.refreshPlaybackMonitoring();
      this.playbackTimeTrackerLastPosition =
        this.playback.data.player_playhead_time;
      this.emitter.on("pulseStart", () => {
        this.refreshPlaybackMonitoring();
      });
    }
  }

  stopPlaybackMonitoring() {
    if (this.playbackProgressCallback !== null) {
      this.refreshPlaybackMonitoring();
      this.playbackProgressCallback = null;
      this.playbackTimeTrackerLastPosition = -1;
      this.prevProgressPlaybackTime = 0;
    }
  }

  refreshPlaybackMonitoring() {
    const playbackTimer = this.playback.data.player_playhead_time;
    const playbackProgressTime = timestamp.now();
    let total = -1;

    if (
      this.playbackTimeTrackerLastPosition >= 0 &&
      playbackTimer > this.playbackTimeTrackerLastPosition
    ) {
      total = playbackTimer - this.playbackTimeTrackerLastPosition;
    }

    if (total > 0 && total <= 1000) {
      metricUpdation(this.playback.data, "view_content_playback_time", total);
    }

    this.playbackTimeTrackerLastPosition = playbackTimer;
    this.prevPlaybackTime = playbackProgressTime;

    return () => {};
  }
}
