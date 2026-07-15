import axios from "axios";
import Constants from "expo-constants";

// In Expo Go / dev mode → use dev machine IP
// In standalone APK → use __DEV__ to pick localhost (testing) vs production URL
const debuggerHost = Constants.expoConfig?.hostUri;
const ip = debuggerHost ? debuggerHost.split(":")[0] : "localhost";

export const BASE_URL = debuggerHost ? `http://${ip}:5300` : `http://${__DEV__ ? "localhost" : "10.110.10.6"}:5300`;

const apiClient = axios.create({
    baseURL: BASE_URL,
    timeout: 10000,
    headers: {
        Accept: "application/json",
    },
});

apiClient.interceptors.response.use(
    (r) => r,
    (err) => {
        if (!err.response) {
            console.error("[API] Network error — server unreachable?", err.message);
        }
        return Promise.reject(err);
    },
);

export default apiClient;
