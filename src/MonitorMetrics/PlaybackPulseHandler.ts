interface Pulse {
  worker?: {
    postMessage: (message: { command: string }) => void;
  };
  playheadProgressing: boolean;
  data?: {
    player_is_paused: boolean;
  };
  dispatch: (eventName: string) => void;
}

interface Emitter {
  on: (event: string, listener: () => void) => void;
}

export class PlaybackPulseHandler {
  playheadProgressing: boolean = false;
  pulse: Pulse;
  emitter: Emitter;
  pulseIntervalId: ReturnType<typeof setInterval> | null = null;

  constructor(pulse: Pulse, emitter: Emitter) {
    this.pulse = pulse;
    this.emitter = emitter;
    this.initialize();
  }

  callPulseInterval() {
    if (!this.pulseIntervalId) {
      this.pulse.dispatch("pulseStart");
      this.pulseIntervalId = setInterval(() => {
        this.pulse.dispatch("pulseStart");
      }, 25);
    }
  }

  endPulseInterval() {
    this.pulse.playheadProgressing = false;

    if (this.pulseIntervalId) {
      clearInterval(this.pulseIntervalId);
      this.pulse.dispatch("pulseEnd");
      this.pulseIntervalId = null;
    }
  }

  handlePlay = () => {
    this.callPulseInterval();
  };

  handlePlaying = () => {
    this.pulse.playheadProgressing = true;
    this.callPulseInterval();
  };

  handleSeeked = () => {
    if (this.pulse.data?.player_is_paused) {
      this.endPulseInterval();
    } else {
      this.callPulseInterval();
    }
  };

  handleTimeUpdate = () => {
    if (this.pulseIntervalId) {
      this.pulse.dispatch("pulseStart");
    }
  };

  initialize() {
    this.emitter.on("play", this.handlePlay);
    this.emitter.on("playing", this.handlePlaying);
    this.emitter.on("viewBegin", this.callPulseInterval.bind(this));
    this.emitter.on("buffering", this.callPulseInterval.bind(this));
    this.emitter.on("ended", this.endPulseInterval.bind(this));
    this.emitter.on("pause", this.endPulseInterval.bind(this));
    this.emitter.on("viewCompleted", this.endPulseInterval.bind(this));
    this.emitter.on("error", this.endPulseInterval.bind(this));
    this.emitter.on("seeked", this.handleSeeked.bind(this));
    this.emitter.on("timeupdate", this.handleTimeUpdate.bind(this));
  }
}
