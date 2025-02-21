import { buildUUID } from "../IdGenerationMethod/index";

const cookieName = "FastPixData";

// Get cookie from browser
const getCookie = function (name: string) {
  const cookies = document.cookie.split(";");
  for (let i = 0; i < cookies.length; i++) {
    const cookie = cookies[i].trim();

    if (cookie.startsWith(name + "=")) {
      const cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
      const values: any = {};
      const keyValuePairs = cookieValue.split("&");
      keyValuePairs.forEach((pair) => {
        const [key, value] = pair.split("=");
        values[key] = value;
      });

      return values;
    }
  }

  return {};
};

// Helper to set a cookie
const setCookie = (name: string, value: string, days: number): void => {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${value}; expires=${expires}; path=/`;
};

// Get viewer data from the cookie
const getViewerData = (): Record<string, any> => {
  const cookieValue = getCookie(cookieName);
  return cookieValue ? cookieValue : {};
};

// Update viewer data in the cookie
const updateViewerCookie = (data: Record<string, any>): void => {
  const cookieValue = `fpviid=${data?.fpviid}&fpsanu=${data?.fpsanu}&snid=${data?.snid}&snepti=${data?.snepti}&snst=${data.snst}`;
  setCookie(cookieName, cookieValue, 365);
};

// Get or initialize viewer cookie data
const getViewerCookie = (): {
  fastpix_viewer_id: string;
  fastpix_sample_number: string;
} => {
  const data = getViewerData();
  const fpViewerId =
    data.fpviid !== "undefined" && data.fpviid ? data.fpviid : buildUUID();
  const fpSampleNumber =
    data.fpsanu !== "undefined" && data.fpsanu ? data.fpsanu : Math.random();
  data.fpviid = fpViewerId;
  data.fpsanu = fpSampleNumber;
  updateViewerCookie(data);

  return {
    fastpix_viewer_id: data.fpviid,
    fastpix_sample_number: data.fpsanu,
  };
};

export { getViewerCookie, updateViewerCookie, getViewerData };
