import type { ActionableDataTypes } from "../DataType/index";

import {
  metricUpdation,
  getDomainName,
  getHostName,
  customTimerModule,
  ListenerManager,
} from "../CommonMethods/index";
import { buildUUID } from "../IdGenerationMethod/index";
import { BufferMonitor, BufferProcessor } from "./VideoBufferMonitor";
import { ErrorManager } from "./ErrorManager";
import { PlaybackEventHandler } from "./PlayerEventHandler";
import { PlaybackProgressMonitor } from "./PlaybackProgressMonitor";
import { PlayheadPositionHandler } from "./PlayheadPositionHandler";
import { PlaybackPulseHandler } from "./PlaybackPulseHandler";
import { RequestMetricsMonitor } from "./RequestMetricsMonitor";
import { VideoResolutionHandler } from "./VideoResolutionHandler";
import { VideoSeekTracker } from "./VideoSeekTracker";
import { PlaybackStartupMonitor } from "./PlaybackStartupMonitor";
import { WallClockTimeTracker } from "./WallClockTimeTracker";

const mapEvents = [
  "viewBegin",
  "ended",
  "loadstart",
  "pause",
  "play",
  "playing",
  "waiting",
  "buffering",
  "buffered",
  "seeked",
  "error",
  "pulse",
  "requestCompleted",
  "requestFailed",
  "requestCanceled",
];

function initializeResolutionState(instance: {
  resolutionState: {
    prev_source_width: any;
    video_source_resolution_dropped_count: number;
  };
  data: {
    video_source_width: any;
    video_source_resolution_dropped_count: number;
  };
}) {
  if (!instance.resolutionState) {
    instance.resolutionState = {
      prev_source_width: instance.data.video_source_width ?? 0,
      video_source_resolution_dropped_count: 0,
    };
    instance.data.video_source_resolution_dropped_count = 0;
  }
}

function updateResolutionState(instance: {
  resolutionState: { prev_source_width: number };
  data: {
    video_source_width: number;
    video_source_resolution_dropped_count: number;
  };
}) {
  if (
    instance.resolutionState.prev_source_width >
    instance.data.video_source_width
  ) {
    instance.resolutionState.prev_source_width =
      instance.data.video_source_width;
    instance.data.video_source_resolution_dropped_count++;
  } else {
    instance.resolutionState.prev_source_width =
      instance.data.video_source_width;
  }
}

function nucleusState(
  this: any,
  self: any,
  token: string,
  actionableData: ActionableDataTypes,
): any {
  const eventEmitter = new ListenerManager();
  this.NavigationStart = customTimerModule.getNavigationStartTime();
  this.fp = self;
  this.id = token;
  const defaultConfig = {
    debug: actionableData?.debug ?? false,
    beaconDomain: actionableData.configDomain ?? "anlytix.io",
    disableCookies: actionableData.disableCookies ?? false,
    respectDoNotTrack: actionableData.respectDoNotTrack ?? false,
    allowRebufferTracking: false,
    disablePlayheadRebufferTracking:
      actionableData.disablePlayheadRebufferTracking ?? false,
    errorConverter: function (errAttr: any) {
      return errAttr;
    },
  };
  actionableData = {
    ...defaultConfig,
    actionableData,
  };
  this.userConfigData = actionableData;
  this.fetchPlayheadTime = actionableData.actionableData.fetchPlayheadTime;
  this.fetchStateData =
    actionableData.actionableData.fetchStateData ??
    function () {
      return {};
    };
  this.allowRebufferTracking = actionableData.allowRebufferTracking;
  this.disablePlayheadRebufferTracking =
    actionableData.disablePlayheadRebufferTracking;
  this.errorConverter = actionableData.errorConverter;
  this.eventsDispatcher = new PlaybackEventHandler(
    self,
    actionableData.actionableData.data.workspace_id,
    actionableData,
  );
  this.data = {
    player_instance_id: buildUUID(),
    beacon_domain:
      actionableData.beaconCollectionDomain ?? actionableData.beaconDomain,
  };
  this.data.view_sequence_number = 1;
  this.data.player_sequence_number = 1;
  this.lastCheckedEventTime = void 0;
  this.throbTimeoutId = undefined;

  this.dispatch = (name: string, eventData: ActionableDataTypes) => {
    const currentTime = Date.now();

    if (
      this.lastCheckedEventTime &&
      currentTime - this.lastCheckedEventTime > 36e5
    ) {
      if (actionableData?.debug) {
        console.warn(
          "After an hour of no user activity, a new view is generated upon the occurrence of an event.",
        );
      }

      const configViewData = {
        viewer_timestamp: this.fp.utilityMethods.now(),
      };
      Object.assign(this.data, configViewData);
      eventEmitter.emit("configureView", configViewData);
      this.lastCheckedEventTime = currentTime;
    }

    if (name === "play") {
      if (this.data.view_start === void 0) {
        const viewBeginData = {
          view_start: this.fp.utilityMethods.now(),
        };
        Object.assign(this.data, viewBeginData);
        eventEmitter.emit("viewBegin", viewBeginData);
        this.lastCheckedEventTime = currentTime;
      }
    }

    if (mapEvents.includes(name)) {
      this.appendVideoState();
    }

    const eventPayload = {
      viewer_timestamp: this.fp.utilityMethods.now(),
      ...eventData,
    };

    if (name !== "videoChange" && name !== "programChange") {
      Object.assign(this.data, eventPayload);
    }
    eventEmitter.emit(name, eventPayload);
    this.lastCheckedEventTime = currentTime;
  };

  this.playerDestroyed = void 0;
  this.initiatePulse = void 0;
  const destroyerFunction = () => {
    this.demolishView();
  };

  if (window?.addEventListener !== undefined) {
    window.addEventListener(
      "pagehide",
      (event) => {
        if (!event.persisted) {
          destroyerFunction();
        }
      },
      false,
    );
    window.addEventListener("beforeunload", () => {
      destroyerFunction();
    });
  }

  eventEmitter.on("destroy", () => {
    destroyerFunction();
  });

  const onViewChange = (viewchange: ActionableDataTypes) => {
    this.dispatch("viewCompleted");
    this.filterData("viewCompleted");
    this.dispatch("configureView", viewchange);
    Object.assign(this.data, viewchange);
  };

  eventEmitter.on("videoChange", (newdata: ActionableDataTypes) => {
    onViewChange(newdata);
  });

  eventEmitter.on("programChange", (newdata: ActionableDataTypes) => {
    const onProgramChange = { ...newdata };
    onViewChange(onProgramChange);
    this.dispatch("play");
    this.dispatch("playing");
  });

  eventEmitter.on("configureView", () => {
    this.refreshViewData();
    this.refreshVideoData();
    this.appendVideoState();
    Object.assign(this.data, actionableData.actionableData.data);
    this.initializeView();
  });

  this.warning = new ErrorManager(this, eventEmitter);
  this.gripper = new VideoSeekTracker(this, eventEmitter);
  this.throughput = new RequestMetricsMonitor(this, eventEmitter);
  this.playheadHandler = new PlayheadPositionHandler(this, eventEmitter);
  this.handlePulse = new PlaybackPulseHandler(this, eventEmitter);
  this.handleScaling = new VideoResolutionHandler(this, eventEmitter);
  this.trackTimer = new WallClockTimeTracker(this, eventEmitter);
  this.playbackManager = new PlaybackProgressMonitor(this, eventEmitter);
  this.eventWaiting = new BufferMonitor(this, eventEmitter);
  this.loaderProps = new BufferProcessor(this, eventEmitter);
  this.metricCommencement = new PlaybackStartupMonitor(this, eventEmitter);

  // Event listener for 'variantChanged'
  eventEmitter.on("variantChanged", () => {
    if (this.data.video_source_width) {
      initializeResolutionState(this);
      updateResolutionState(this);
    }
    this.appendVideoState();
    this.validateData();
    this.filterData("variantChanged");
  });

  eventEmitter.on("playerReady", () => {
    const currentTime = this.fp.utilityMethods.now();

    if (this.data.player_init_time) {
      const startupTime = currentTime - this.data.player_init_time;
      this.data.player_startup_time = Math.max(0, startupTime);
    }

    if (this.NavigationStart) {
      if (
        this.data.player_init_time ??
        customTimerModule.getDomContentLoadedEnd()
      ) {
        const pageLoadTime =
          Math.min(
            this.data.player_init_time ?? 1 / 0,
            customTimerModule.getDomContentLoadedEnd() ?? 1 / 0,
          ) - this.NavigationStart;
        this.data.page_load_time = Math.max(0, pageLoadTime);
      }
    }
    this.appendVideoState();
    this.validateData();
    this.filterData("playerReady");
  });

  mapEvents.forEach((key) => {
    eventEmitter.on(key, () => {
      this.appendVideoState();
      this.validateData();
      this.filterData(key);
    });
  });

  this.dispatch("configureView");
}

nucleusState.prototype.demolishView = function () {
  if (!this.playerDestroyed) {
    this.playerDestroyed = true;

    if (void 0 !== this.data.view_start) {
      this.dispatch("viewCompleted");
      this.filterData("viewCompleted");
      this.eventsDispatcher.destroy();
    }
  }
};

nucleusState.prototype.initializeView = function () {
  this.data.view_id = buildUUID();
  metricUpdation(this.data, "player_view_count", 1);
};

nucleusState.prototype.appendVideoState = function () {
  Object.assign(this.data, this.fetchStateData());
  this.playheadHandler.handleCurrentPosition(this);
  this.validateData();
};

nucleusState.prototype.validateData = function () {
  const numericalKeys = [
    "player_width",
    "player_height",
    "video_source_width",
    "video_source_height",
    "video_source_bitrate",
  ];
  const urlKeys = ["player_source_url", "video_source_url"];
  numericalKeys.forEach(
    (key) =>
      (this.data[key] = Number.parseInt(this.data[key], 10) ?? undefined),
  );
  urlKeys.forEach((paramName) => {
    const excludes = (this.data[paramName] ?? "").toLowerCase();

    if (excludes.startsWith("data:") || excludes.startsWith("blob:")) {
      this.data[paramName] = "MSE style URL";
    }
  });
};

nucleusState.prototype.filterData = function (str: string) {
  if (this.data.view_id) {
    if (
      this.data.player_source_duration > 0 ||
      this.data.video_source_duration > 0
    ) {
      this.data.video_source_is_live = false;
    } else if (this.data.video_source_duration === void 0) {
      this.data.video_source_is_live = true;
    }

    const videoSourceUrl =
      this.data.video_source_url ?? this.data.player_source_url;

    if (videoSourceUrl) {
      this.data.video_source_domain = getDomainName(videoSourceUrl);
      this.data.video_source_hostname = getHostName(videoSourceUrl);
    }

    const updatedata = { ...this.data };
    this.eventsDispatcher.sendData(str, updatedata);
    this.data.view_sequence_number++;
    this.data.player_sequence_number++;

    this.handlePulseEvent(this);

    if (str === "viewCompleted") {
      delete this.data.view_id;
    }
  }
};

nucleusState.prototype.handlePulseEvent = (instance: any) => {
  if (instance.throbTimeoutId) {
    clearTimeout(instance.throbTimeoutId);
  }

  if (!instance.warning.hasErrorOccurred) {
    instance.throbTimeoutId = setTimeout(() => {
      if (!instance.data.player_is_paused) {
        instance.dispatch("pulse");
      }
    }, 10000);
  }
};

nucleusState.prototype.refreshViewData = function () {
  Object.keys(this.data).forEach((k) => {
    if (0 === k.indexOf("view_")) {
      delete this.data[k];
    }
  });
  this.data.view_sequence_number = 1;
};

nucleusState.prototype.refreshVideoData = function () {
  Object.keys(this.data).forEach((k) => {
    if (0 === k.indexOf("video_")) {
      delete this.data[k];
    }
  });
};

export { nucleusState };
