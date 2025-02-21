function createTimerWorker(script: string) {
  const URL = window?.URL || window?.webkitURL;
  const Blob = window?.Blob;
  const Worker = window?.Worker;

  if (!URL || !Blob || !Worker || !script) {
    return null;
  }

  const blob = new Blob([script]);
  const webworker = new Worker(URL.createObjectURL(blob));

  return webworker;
}

const inlineWorkerText: string = `
     let pulseInterval = null;
     let throbInterval = null

      self.onmessage = function (event) {
      const command = event.data.command;

      switch (command) {
           case "initiatePulseInterval":

                if (pulseInterval === null) {
                   self.postMessage({command: "pulseStart"})
                   pulseInterval = setInterval(function() {
                       self.postMessage({command: "pulseStart"})
                   }, 25);
                }
                break;
            case "demolishPulseInterval":

                if (pulseInterval !== null) {
                    clearInterval(pulseInterval);
                    self.postMessage({command: "pulseEnd"});
                    pulseInterval = null;
                }
                break;
            case "checkPulse":
                const playerPaused = event.data.pausestate
                const errorStatus = event.data.errortracker
                clearTimeout(throbInterval)
                if (!errorStatus) {
                    throbInterval = setTimeout(function () {
                        if (!playerPaused) {
                            self.postMessage({command: "emitPulse"})
                        }
                    }, 1E4);
                }
                break;
            default:
                return
    }
}
`;

export { createTimerWorker, inlineWorkerText };
