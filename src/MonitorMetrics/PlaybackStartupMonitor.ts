// Define the type for the launcher data
interface LauncherData {
  view_time_to_first_frame?: number;
  view_watch_time: number;
  view_start?: number;
  player_autoplay_on: boolean;
  video_is_autoplay: boolean;
  view_aggregate_startup_time?: number;
}

// Define the type for the launcher
interface Launcher {
  data: LauncherData;
  trackTimer: {
    captureViewingProgress: (
      launcher: Launcher,
      data: { viewer_timestamp: number },
    ) => void;
  };
  NavigationStart?: number;
}

// Define the type for the custom emitter
interface Emitter {
  on: (
    event: string,
    listener: (data: { viewer_timestamp: number }) => void,
  ) => void;
  emit: (event: string, data: { viewer_timestamp: number }) => void;
}

export class PlaybackStartupMonitor {
  launcher: Launcher;
  emitter: Emitter;

  constructor(launcher: Launcher, emitter: Emitter) {
    this.launcher = launcher;
    this.emitter = emitter;
    this.initEventListeners();
  }

  initEventListeners() {
    this.emitter.on("playing", (data: { viewer_timestamp: number }) => {
      if (this.launcher.data.view_time_to_first_frame === undefined) {
        this.handleTimeFrame(data);
      }
    });

    this.emitter.on("configureView", () => {
      this.launcher.data.view_time_to_first_frame = undefined;
    });
  }

  handleTimeFrame(data: { viewer_timestamp: number }) {
    this.launcher.trackTimer.captureViewingProgress(this.launcher, data);

    if (this.launcher.data.view_watch_time > 0) {
      this.launcher.data.view_time_to_first_frame =
        this.launcher.data.view_watch_time;
    } else if (this.launcher.data.view_start) {
      const startUpTimer =
        data.viewer_timestamp - this.launcher.data.view_start;
      this.launcher.data.view_time_to_first_frame = startUpTimer;
      this.launcher.data.view_watch_time = startUpTimer;
    }
  }
}
