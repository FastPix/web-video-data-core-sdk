import { EventMetaData } from "../DataType/index";

const eventKeyMappings: { [key: string]: string } = {
  "ad": "ad",
  "aggregate": "ag",
  "api": "ai",
  "application": "ap",
  "architecture": "ar",
  "asset": "as",
  "autoplay": "au",
  "avg": "av",
  "beacon": "be",
  "bitrate": "bi",
  "break": "bk",
  "browser": "br",
  "bytes": "by",
  "cancel": "ca",
  "codec": "cc",
  "code": "cd",
  "counter": "ce",
  "config": "cf",
  "category": "cg",
  "changed": "ch",
  "connection": "ci",
  "clicked": "ck",
  "canceled": "cl",
  "custom": "cm",
  "cdn": "cn",
  "count": "co",
  "complete": "cp",
  "creative": "cr",
  "continuous": "cs",
  "content": "ct",
  "current": "cu",
  "context": "cx",
  "device": "de",
  "downscaling": "dg",
  "drm": "dm",
  "domain": "dn",
  "downscale": "do",
  "dropped": "dr",
  "duration": "du",
  "errorcode": "ec",
  "end": "ed",
  "edge": "eg",
  "engine": "ei",
  "embed": "em",
  "encoding": "eo",
  "expiry": "ep",
  "error": "er",
  "experiments": "es",
  "errortext": "et",
  "event": "ev",
  "experiment": "ex",
  "failed": "fa",
  "first": "fi",
  "fullscreen": "fl",
  "format": "fm",
  "fastpix": "fp",
  "frequency": "fq",
  "frame": "fr",
  "fps": "fs",
  "family": "fy",
  "has": "ha",
  "holdback": "hb",
  "hostname": "hn",
  "host": "ho",
  "headers": "hs",
  "height": "ht",
  "id": "id",
  "internal": "il",
  "instance": "in",
  "ip": "ip",
  "is": "is",
  "init": "it",
  "key": "ke",
  "labeled": "lb",
  "loaded": "ld",
  "level": "le",
  "live": "li",
  "language": "ln",
  "load": "lo",
  "lists": "ls",
  "latency": "lt",
  "max": "ma",
  "media": "me",
  "manifest": "mf",
  "mime": "mi",
  "midroll": "ml",
  "min": "mn",
  "model": "mo",
  "manufacturer": "mr",
  "message": "ms",
  "name": "na",
  "newest": "ne",
  "number": "nu",
  "on": "on",
  "os": "os",
  "page": "pa",
  "playback": "pb",
  "producer": "pd",
  "preroll": "pe",
  "percentage": "pg",
  "playhead": "ph",
  "plugin": "pi",
  "player": "pl",
  "program": "pm",
  "playing": "pn",
  "poster": "po",
  "property": "pp",
  "preload": "pr",
  "position": "ps",
  "part": "pt",
  "paused": "pu",
  "played": "py",
  "ratio": "ra",
  "rebuffer": "rb",
  "requested": "rd",
  "rate": "re",
  "resolution": "rl",
  "remote": "rm",
  "rendition": "rn",
  "response": "rp",
  "request": "rq",
  "requests": "rs",
  "sample": "sa",
  "sdk": "sd",
  "seek": "se",
  "skipped": "sk",
  "stream": "sm",
  "session": "sn",
  "source": "so",
  "startup": "sp",
  "sequence": "sq",
  "series": "sr",
  "start": "st",
  "sub": "su",
  "server": "sv",
  "software": "sw",
  "tag": "ta",
  "tech": "tc",
  "text": "te",
  "target": "tg",
  "throughput": "th",
  "time": "ti",
  "total": "tl",
  "to": "to",
  "timestamp": "tp",
  "title": "tt",
  "type": "ty",
  "upscaling": "ug",
  "universal": "un",
  "upscale": "up",
  "url": "ur",
  "user": "us",
  "used": "ud",
  "variant": "va",
  "video": "vd",
  "view": "ve",
  "viewer": "vi",
  "version": "vn",
  "viewed": "vw",
  "watch": "wa",
  "waiting": "wg",
  "width": "wt",
  "workspace": "ws",
};

export const formatEventData = function (events: EventMetaData): {
  [key: string]: any;
} {
  let formattedEventData: { [key: string]: any } = {};

  for (let eventKey in events) {
    const eventKeyParts = eventKey.split("_");
    let mappedKey: string = "";

    eventKeyParts.forEach((each) => {
      if (eventKeyMappings[each]) {
        mappedKey += eventKeyMappings[each];
      } else if (Number(each) && Math.floor(Number(each)) === Number(each)) {
        mappedKey += each;
      } else {
        console.warn(`Unexpected use of data keyword ${each} in ${eventKey}`);
        mappedKey += `_${each}_`;
      }
    });

    // @ts-ignore
    formattedEventData[mappedKey] = events[eventKey];
  }

  return formattedEventData;
};
