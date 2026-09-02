import Constants from "expo-constants";
import { Platform } from "react-native";

// In Expo Go / dev mode → use dev machine IP
// In standalone APK → use __DEV__ to pick localhost (testing) vs production URL
const debuggerHost = Constants.expoConfig?.hostUri;
const ip = debuggerHost ? debuggerHost.split(":")[0] : "localhost";

function resolveBaseUrl(): string {
    // On web, the backend serves this app's own static build (see backend's
    // index.ts), so the API is always reachable at the same origin the page
    // was loaded from — whatever that turns out to be (a LAN IP, a VPN-only
    // hostname, a different port, http vs https). Deriving it from
    // window.location avoids hardcoding a server address that would silently
    // break for anyone reaching it a different way than we assumed here.
    if (Platform.OS === "web" && typeof window !== "undefined" && window.location?.origin) {
        return window.location.origin;
    }
    return debuggerHost ? `http://${ip}:5300` : `http://${__DEV__ ? "localhost" : "10.110.10.6"}:5300`;
}

export const BASE_URL = resolveBaseUrl();

// Shared secret required by the backend on every request (header
// X-API-Key) and every Socket.IO connection (see services/socket.ts).
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
