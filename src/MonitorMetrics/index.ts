import type { ActionableDataTypes } from "../DataType/index";

import {
  metricUpdation,
  getDomainName,
  getHostName,
  customTimerModule,
  ListenerManager,
} from "../CommonMethods/index";
import { buildUUID } from "../IdGenerationMethod/index";
import { createTimerWorker, inlineWorkerText } from "../Worker/index";
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

function nucleusState(
  this: any,
  self: any,
  token: string,
  actionableData: ActionableDataTypes,
): any {
  const eventEmitter = new ListenerManager();
  const fileInstance = this;
  fileInstance.NavigationStart = customTimerModule.getNavigationStartTime();
  fileInstance.fp = self;
  fileInstance.id = token;
  const defaultConfig = {
    debug: actionableData?.debug ?? false,
    beaconDomain: actionableData.configDomain ?? "metrix.ws",
    sampleRate: 1,
    disableCookies: actionableData.disableCookies ?? false,
    respectDoNotTrack: actionableData.respectDoNotTrack ?? false,
    allowRebufferTracking: false,
    disablePlayheadRebufferTracking: false,
    errorConverter: function (errAttr: any) {
      return errAttr;
    },
  };
  actionableData = {
    actionableData,
    ...defaultConfig,
  };
  fileInstance.userConfigData = actionableData;
  fileInstance.fetchPlayheadTime =
    actionableData.actionableData.fetchPlayheadTime;
  fileInstance.fetchStateData =
    actionableData.actionableData.fetchStateData ??
    function () {
      return {};
    };
  fileInstance.allowRebufferTracking = actionableData.allowRebufferTracking;
  fileInstance.disablePlayheadRebufferTracking =
    actionableData.disablePlayheadRebufferTracking;
  fileInstance.errorConverter = actionableData.errorConverter;
  fileInstance.eventsDispatcher = new PlaybackEventHandler(
    self,
    actionableData.actionableData.data.workspace_id,
    actionableData,
  );
  fileInstance.data = {
    player_instance_id: buildUUID(),
    fastpix_sample_rate: actionableData.sampleRate,
    beacon_domain:
      actionableData.beaconCollectionDomain ?? actionableData.beaconDomain,
  };
  fileInstance.data.view_sequence_number = 1;
  fileInstance.data.player_sequence_number = 1;
  fileInstance.lastCheckedEventTime = void 0;

  // Initiating web workers
  fileInstance.worker = createTimerWorker(inlineWorkerText);

  // Message from web worker
  fileInstance.worker.onmessage = function (message: any) {
    let messageCommand: string = message.data.command;

    switch (messageCommand) {
      case "pulseStart":
        fileInstance.dispatch(messageCommand);
        fileInstance.handlePulse.pulseInterval = true;
        break;

      case "pulseEnd":
        fileInstance.playheadProgressing = false;
        fileInstance.dispatch(messageCommand);
        fileInstance.handlePulse.pulseInterval = false;
        break;

      case "emitPulse":
        fileInstance.dispatch("pulse");
        break;

      default:
        return;
    }
  };

  fileInstance.dispatch = function (
    name: string,
    eventData: ActionableDataTypes,
  ) {
    const currentTime = Date.now();

    if (
      fileInstance.lastCheckedEventTime &&
      currentTime - fileInstance.lastCheckedEventTime > 36e5
    ) {
      if (actionableData?.debug) {
        console.warn(
          "After an hour of no user activity, a new view is generated upon the occurrence of an event.",
        );
      }

      const configViewData = {
        viewer_timestamp: fileInstance.fp.utilityMethods.now(),
      };
      Object.assign(fileInstance.data, configViewData);
      eventEmitter.emit("configureView", configViewData);
      fileInstance.lastCheckedEventTime = currentTime;
    }

    if (name === "play") {
      if (fileInstance.data.view_start === void 0) {
        const viewBeginData = {
          view_start: fileInstance.fp.utilityMethods.now(),
        };
        Object.assign(fileInstance.data, viewBeginData);
        eventEmitter.emit("viewBegin", viewBeginData);
        fileInstance.lastCheckedEventTime = currentTime;
      }
    }

    if (mapEvents.includes(name)) {
      this.appendVideoState();
    }

    const eventPayload = {
      viewer_timestamp: fileInstance.fp.utilityMethods.now(),
      ...eventData,
    };

    if (name !== "videoChange" && name !== "programChange") {
      Object.assign(fileInstance.data, eventPayload);
    }
    eventEmitter.emit(name, eventPayload);
    fileInstance.lastCheckedEventTime = currentTime;
  };

  fileInstance.playerDestroyed = void 0;
  fileInstance.initiatePulse = void 0;
  let destroyerFunction = function () {
    fileInstance.demolishView();
  };

  if (window && typeof window !== "undefined") {
    window.addEventListener(
      "pagehide",
      function (event) {
        if (!event.persisted) {
          destroyerFunction();
        }
      },
      false,
    );
    window.addEventListener("beforeunload", function () {
      destroyerFunction();
    });
  }

  eventEmitter.on("destroy", function () {
    destroyerFunction();
  });

  function onViewChange(viewchange: ActionableDataTypes) {
    fileInstance.dispatch("viewCompleted");
    fileInstance.filterData("viewCompleted");
    fileInstance.dispatch("configureView", viewchange);
    Object.assign(fileInstance.data, viewchange);
  }

  eventEmitter.on("videoChange", function (newdata: ActionableDataTypes) {
    onViewChange(newdata);
  });

  eventEmitter.on("programChange", function (newdata: ActionableDataTypes) {
    const onProgramChange = { ...newdata };
    onViewChange(onProgramChange);
    fileInstance.dispatch("play");
    fileInstance.dispatch("playing");
  });

  eventEmitter.on("configureView", function () {
    fileInstance.refreshViewData();
    fileInstance.refreshVideoData();
    fileInstance.appendVideoState();
    Object.assign(fileInstance.data, actionableData.actionableData.data);
    fileInstance.initializeView();
  });

  fileInstance.warning = new ErrorManager(fileInstance, eventEmitter);
  fileInstance.gripper = new VideoSeekTracker(fileInstance, eventEmitter);
  fileInstance.throughput = new RequestMetricsMonitor(
    fileInstance,
    eventEmitter,
  );
  fileInstance.playheadHandler = new PlayheadPositionHandler(
    fileInstance,
    eventEmitter,
  );
  fileInstance.handlePulse = new PlaybackPulseHandler(
    fileInstance,
    eventEmitter,
  );
  fileInstance.handleScaling = new VideoResolutionHandler(
    fileInstance,
    eventEmitter,
  );
  fileInstance.trackTimer = new WallClockTimeTracker(
    fileInstance,
    eventEmitter,
  );
  fileInstance.playbackManager = new PlaybackProgressMonitor(
    fileInstance,
    eventEmitter,
  );
  fileInstance.eventWaiting = new BufferMonitor(fileInstance, eventEmitter);
  fileInstance.loaderProps = new BufferProcessor(fileInstance, eventEmitter);
  fileInstance.metricCommencement = new PlaybackStartupMonitor(
    fileInstance,
    eventEmitter,
  );

  // Function to initialize resolutionState if it doesn't exist
  function initializeResolutionState(fileInstance: {
    resolutionState: {
      prev_source_width: any;
      video_source_resolution_dropped_count: number;
    };
    data: {
      video_source_width: any;
      video_source_resolution_dropped_count: number;
    };
  }) {
    if (!fileInstance.resolutionState) {
      fileInstance.resolutionState = {
        prev_source_width: fileInstance.data.video_source_width ?? 0,
        video_source_resolution_dropped_count: 0,
      };
      fileInstance.data.video_source_resolution_dropped_count = 0;
    }
  }

  // Function to handle the resolution state update
  function updateResolutionState(fileInstance: {
    resolutionState: { prev_source_width: number };
    data: {
      video_source_width: number;
      video_source_resolution_dropped_count: number;
    };
  }) {
    if (
      fileInstance.resolutionState.prev_source_width >
      fileInstance.data.video_source_width
    ) {
      fileInstance.resolutionState.prev_source_width =
        fileInstance.data.video_source_width;
      fileInstance.data.video_source_resolution_dropped_count++;
    } else {
      fileInstance.resolutionState.prev_source_width =
        fileInstance.data.video_source_width;
    }
  }

  // Event listener for 'variantChanged'
  eventEmitter.on("variantChanged", function () {
    if (fileInstance.data.video_source_width) {
      initializeResolutionState(fileInstance);
      updateResolutionState(fileInstance);
    }
    fileInstance.appendVideoState();
    fileInstance.validateData();
    fileInstance.filterData("variantChanged");
  });

  eventEmitter.on("playerReady", function () {
    const currentTime = fileInstance.fp.utilityMethods.now();

    if (fileInstance.data.player_init_time) {
      const startupTime = currentTime - fileInstance.data.player_init_time;
      fileInstance.data.player_startup_time = startupTime > 0 ? startupTime : 0;
    }

    if (fileInstance.NavigationStart) {
      if (
        fileInstance.data.player_init_time ??
        customTimerModule.getDomContentLoadedEnd()
      ) {
        const pageLoadTime =
          Math.min(
            fileInstance.data.player_init_time ?? 1 / 0,
            customTimerModule.getDomContentLoadedEnd() ?? 1 / 0,
          ) - fileInstance.NavigationStart;
        fileInstance.data.page_load_time = pageLoadTime > 0 ? pageLoadTime : 0;
      }
    }
    fileInstance.appendVideoState();
    fileInstance.validateData();
    fileInstance.filterData("playerReady");
  });

  mapEvents.forEach(function (key) {
    eventEmitter.on(key, function () {
      fileInstance.appendVideoState();
      fileInstance.validateData();
      fileInstance.filterData(key);
    });
  });

  fileInstance.dispatch("configureView");
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
  const initself = this;
  this.data.view_id = buildUUID();
  metricUpdation(initself.data, "player_view_count", 1);
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
    (key) => (this.data[key] = parseInt(this.data[key], 10) ?? undefined),
  );
  urlKeys.forEach((paramName) => {
    const excludes = (this.data[paramName] ?? "").toLowerCase();

    if (excludes.startsWith("data:") || excludes.startsWith("blob:")) {
      this.data[paramName] = "MSE style URL";
    }
  });
};

nucleusState.prototype.filterData = function (str: string) {
  const workerInstance = this;

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
    workerInstance.worker.postMessage({
      command: "checkPulse",
      pausestate: workerInstance.data.player_is_paused,
      errortracker: workerInstance.warning.hasErrorOccurred,
    });

    if (str === "viewCompleted") {
      delete this.data.view_id;
    }
  }
};

nucleusState.prototype.refreshViewData = function () {
  const view = this;
  Object.keys(this.data).forEach(function (k) {
    if (0 === k.indexOf("view_")) {
      delete view.data[k];
    }
  });
  this.data.view_sequence_number = 1;
};

nucleusState.prototype.refreshVideoData = function () {
  const video = this;
  Object.keys(this.data).forEach(function (k) {
    if (0 === k.indexOf("video_")) {
      delete video.data[k];
    }
  });
};

export { nucleusState };
