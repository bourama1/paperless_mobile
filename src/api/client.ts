import axios from "axios";
import Constants from "expo-constants";

// In Expo Go / dev mode → use dev machine IP
// In standalone APK → use __DEV__ to pick localhost (testing) vs production URL
const debuggerHost = Constants.expoConfig?.hostUri;
const ip = debuggerHost ? debuggerHost.split(":")[0] : "localhost";

export const BASE_URL = debuggerHost ? `http://${ip}:5300` : `http://${__DEV__ ? "localhost" : "tocz-app4"}:5300`;

const apiClient = axios.create({
    baseURL: BASE_URL,
    headers: {
        Accept: "application/json",
    },
});

export default apiClient;
