type Emitter = {
  on: (
    event: string,
    callback: (data: { viewer_timestamp: number }) => void,
  ) => void;
};

type TimerData = {
  view_max_playhead_position?: number;
  player_playhead_time?: number;
  viewer_timestamp?: number;
};

type Timer = {
  data: TimerData;
  fetchPlayheadTime?: () => number | undefined;
};

export class PlayheadPositionHandler {
  timer: Timer;
  emitter: Emitter;

  constructor(timer: Timer, emitter: Emitter) {
    this.timer = timer;
    this.emitter = emitter;
    this.initializeEventListeners();
  }

  initializeEventListeners() {
    this.emitter.on("timeupdate", (data: TimerData) =>
      this.handleCurrentPosition(data),
    );
    this.emitter.on("pulseStart", (data: TimerData) =>
      this.handleCurrentPosition(data),
    );
    this.emitter.on("pulseEnd", (data: TimerData) =>
      this.handleCurrentPosition(data),
    );
  }

  handleMaxPosition() {
    this.timer.data.view_max_playhead_position =
      this.timer.data.view_max_playhead_position === undefined
        ? this.timer.data.player_playhead_time
        : Math.max(
            this.timer.data.view_max_playhead_position,
            this.timer.data.player_playhead_time!,
          );
  }

  handleCurrentPosition(playheadTimer: { player_playhead_time?: number }) {
    if (playheadTimer && playheadTimer.player_playhead_time !== undefined) {
      this.timer.data.player_playhead_time = playheadTimer.player_playhead_time;
      this.handleMaxPosition();
    } else if (this.timer.fetchPlayheadTime) {
      const playerPlayheadTime = this.timer.fetchPlayheadTime();

      if (playerPlayheadTime !== undefined) {
        this.timer.data.player_playhead_time = playerPlayheadTime;
        this.handleMaxPosition();
      }
    }
  }
}
