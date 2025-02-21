interface ScalerData {
  player_playhead_time: number;
  player_width: number;
  player_height: number;
  video_source_width: number;
  video_source_height: number;
  view_max_upscale_percentage?: number;
  view_max_downscale_percentage?: number;
  [key: string]: any;
}

interface Scaler {
  data: ScalerData;
}

interface Emitter {
  on: (event: string, callback: Function) => void;
}

interface VideoResolutionState {
  previousPlayheadPosition: number;
  prevPlayerWidth: number;
  prevVideoWidth: number;
  prevPlayerHeight: number;
  prevVideoHeight: number;
}

export class VideoResolutionHandler {
  state: VideoResolutionState = {
    previousPlayheadPosition: -1,
    prevPlayerWidth: -1,
    prevVideoWidth: -1,
    prevPlayerHeight: -1,
    prevVideoHeight: -1,
  };
  scaler: Scaler;
  emitter: Emitter;

  constructor(scaler: Scaler, emitter: Emitter) {
    this.scaler = scaler;
    this.emitter = emitter;
    this.initialize();
  }

  resetPlayheadPosition(): void {
    this.state.previousPlayheadPosition = -1;
  }

  handleEvent(event: string): void {
    this.emitter.on(event, () => {
      const { state, scaler } = this;
      if (
        state.previousPlayheadPosition >= 0 &&
        scaler.data.player_playhead_time >= 0 &&
        state.prevPlayerWidth >= 0 &&
        state.prevVideoWidth > 0 &&
        state.prevPlayerHeight >= 0 &&
        state.prevVideoHeight > 0
      ) {
        const scalingDiff =
          scaler.data.player_playhead_time - state.previousPlayheadPosition;

        if (scalingDiff < 0) {
          return this.resetPlayheadPosition();
        }

        const minValue = Math.min(
          state.prevPlayerWidth / state.prevVideoWidth,
          state.prevPlayerHeight / state.prevVideoHeight,
        );
        const maxScale = Math.max(0, minValue - 1);
        const minScale = Math.max(0, 1 - minValue);

        scaler.data.view_max_upscale_percentage = Math.max(
          scaler.data.view_max_upscale_percentage || 0,
          maxScale,
        );
        scaler.data.view_max_downscale_percentage = Math.max(
          scaler.data.view_max_downscale_percentage || 0,
          minScale,
        );
        scaler.data["view_total_content_playback_time"] =
          (scaler.data["view_total_content_playback_time"] ?? 0) + scalingDiff;
        scaler.data["view_total_upscaling"] =
          (scaler.data["view_total_upscaling"] ?? 0) + maxScale * scalingDiff;
        scaler.data["view_total_downscaling"] =
          (scaler.data["view_total_downscaling"] ?? 0) + minScale * scalingDiff;
      }
      this.resetPlayheadPosition();
    });
  }

  setPlayheadPosition(event: string): void {
    this.emitter.on(event, () => {
      const { state, scaler } = this;
      state.previousPlayheadPosition = scaler.data.player_playhead_time;
      state.prevPlayerWidth = scaler.data.player_width;
      state.prevPlayerHeight = scaler.data.player_height;
      state.prevVideoWidth = scaler.data.video_source_width;
      state.prevVideoHeight = scaler.data.video_source_height;
    });
  }

  initialize(): void {
    this.emitter.on("configureView", () => this.resetPlayheadPosition());

    const eventsToHandle = ["pause", "buffering", "seeking", "error", "pulse"];
    eventsToHandle.forEach((event) => this.handleEvent(event));

    const eventsToSetPosition = ["playing", "pulse"];
    eventsToSetPosition.forEach((event) => this.setPlayheadPosition(event));
  }
}
