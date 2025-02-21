interface ClockData {
  viewer_timestamp: number;
}

interface Timer {
  data: Record<string, number>;
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
    } else {
      if (currentTime) {
        const timeElapsed = currentTime - this.lastTrackedWallClockTime;
        timer.data["view_watch_time"] =
          (timer.data["view_watch_time"] ?? 0) + timeElapsed;
        this.lastTrackedWallClockTime = currentTime;
      }
    }
  }

  demolishViewingProgress(timer: Timer, data: ClockData): void {
    this.captureViewingProgress(timer, data);
    this.lastTrackedWallClockTime = null;
  }
}
