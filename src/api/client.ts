import axios from "axios";
import Constants from "expo-constants";

// In Expo Go / dev mode → use dev machine IP
// In standalone APK → use __DEV__ to pick localhost (testing) vs production URL
const debuggerHost = Constants.expoConfig?.hostUri;
const ip = debuggerHost ? debuggerHost.split(":")[0] : "localhost";

export const BASE_URL = debuggerHost ? `http://${ip}:5300` : `http://${__DEV__ ? "localhost" : "10.110.10.6"}:5300`;

// Shared secret required by the backend on every request (header
// X-API-Key) and every Socket.IO connection (see services/socket.ts).
// EXPO_PUBLIC_* vars are inlined into the bundle at build time — see
// .env.example. Must match the backend's API_KEY.
// EXPO_PUBLIC_* vars are inlined into the bundle at build time — see
// .env.example. Must match the backend's API_KEY. Exported so callers that
// can't use apiClient directly (e.g. the pdf.js WebView URL in
// app/document/[id].tsx, which can't attach a custom header) can append it
// as a query param instead.
export const API_KEY = process.env.EXPO_PUBLIC_API_KEY;

if (!API_KEY) {
    console.warn(
        "[API] EXPO_PUBLIC_API_KEY is not set — requests to the backend will be rejected with 401/500. Add it to .env (see .env.example).",
    );
}

const apiClient = axios.create({
    baseURL: BASE_URL,
    timeout: 10000,
    headers: {
        Accept: "application/json",
        ...(API_KEY ? { "X-API-Key": API_KEY } : {}),
    },
});

apiClient.interceptors.response.use(
    (r) => r,
    (err) => {
        if (!err.response) {
            console.error("[API] Network error — server unreachable?", err.message);
        } else if (err.response.status === 401) {
            console.error(
                "[API] Rejected (401) — EXPO_PUBLIC_API_KEY likely missing or doesn't match the backend's API_KEY.",
            );
        }
        return Promise.reject(err);
    },
);

export default apiClient;
