import axios from "axios";
import { getCookie } from "./csrf";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  `${window.location.origin}/api/`;

const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ||
  (window.location.port === "5173" ? "http://localhost:8000" : window.location.origin);

const API = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
    "ngrok-skip-browser-warning": "true",
  },
});

// Fetch CSRF token from backend and store it
let csrfReady = null;
function ensureCsrf() {
  if (!csrfReady) {
    csrfReady = axios
      .get(`${BACKEND_URL}/users/csrf/`, { withCredentials: true })
      .then((res) => {
        // Backend sets the cookie; also store in memory as fallback
        if (res.data?.csrftoken) {
          document.cookie = `csrftoken=${res.data.csrftoken}; path=/`;
        }
      })
      .catch(() => { csrfReady = null; });
  }
  return csrfReady;
}

// Kick off CSRF fetch immediately on load
ensureCsrf();

API.interceptors.request.use(async (config) => {
  const mutating = ["post", "put", "patch", "delete"];
  if (mutating.includes(config.method || "")) {
    const existing = getCookie("csrftoken");
    if (!existing) csrfReady = null; // force re-fetch if cookie missing
    await ensureCsrf();
    config.headers["X-CSRFToken"] = getCookie("csrftoken") || "";
  }
  return config;
});

export { BACKEND_URL };
export default API;
