import { metricUpdation, timestamp } from "../CommonMethods/index";

interface SeekData {
  viewer_timestamp: number;
}

interface Dragger {
  data: Record<string, any>;
  adBreakActive?: boolean;
  filterData: (event: string) => void;
}

interface Emitter {
  on: (event: string, callback: Function) => void;
}

export class VideoSeekTracker {
  videoDragged: boolean = false;
  seekerElapsedTime: number = -1;
  dragger: Dragger;
  emitter: Emitter;

  constructor(dragger: Dragger, emitter: Emitter) {
    this.dragger = dragger;
    this.emitter = emitter;
    this.initialize();
  }

  initialize(): void {
    this.emitter.on("seeking", (seekdata: SeekData) => {
      this.handleSeeking(seekdata);
    });

    this.emitter.on("seeked", () => {
      this.handleSeeked();
    });

    this.emitter.on("viewCompleted", () => {
      this.handleViewCompleted();
    });
  }

  handleSeeking(seekdata: SeekData): void {
    // When a break ends hls.js seeks the element back to the resume point.
    // That is the player repositioning itself, not the viewer scrubbing, so it
    // must not land in view_seek_count or fire a seeking beacon.
    if (this.dragger.adBreakActive) {
      return;
    }

    Object.assign(this.dragger.data, seekdata);

    if (
      this.videoDragged &&
      seekdata.viewer_timestamp - this.seekerElapsedTime <= 2000
    ) {
      this.seekerElapsedTime = seekdata.viewer_timestamp;
    } else {
      if (this.videoDragged) {
        this.seeker();
      }
      this.videoDragged = true;
      this.seekerElapsedTime = seekdata.viewer_timestamp;
      metricUpdation(this.dragger.data, "view_seek_count", 1);
      this.dragger.filterData("seeking");
    }
  }

  handleSeeked(): void {
    this.seeker();
  }

  handleViewCompleted(): void {
    if (this.videoDragged) {
      this.seeker();
      this.dragger.filterData("seeked");
    }
    this.videoDragged = false;
    this.seekerElapsedTime = -1;
  }

  seeker(): void {
    // seekerElapsedTime is -1 until handleSeeking starts a seek. A seeked with
    // no matching seeking - which every ad break resume produces, since
    // handleSeeking ignores those - would otherwise subtract -1 from a clock
    // reading and add a whole epoch timestamp to the duration.
    if (this.seekerElapsedTime < 0) {
      return;
    }

    const seekerTime: number = timestamp.now();
    const last: number =
      (this.dragger.data.viewer_timestamp ?? seekerTime) -
      (this.seekerElapsedTime ?? seekerTime);

    metricUpdation(this.dragger.data, "view_seek_duration", last);
    this.dragger.data.view_max_seek_time = Math.max(
      this.dragger.data.view_max_seek_time ?? 0,
      last,
    );
    this.videoDragged = false;
    this.seekerElapsedTime = -1;
  }
}
