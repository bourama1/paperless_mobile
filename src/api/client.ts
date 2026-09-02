import axios from "axios";
import { BASE_URL, API_KEY } from "../config/env";
import { reportRestFailure, reportRestSuccess } from "../services/connectivity";

export { BASE_URL, API_KEY };

const apiClient = axios.create({
    baseURL: BASE_URL,
    timeout: 10000,
    headers: {
        Accept: "application/json",
        ...(API_KEY ? { "X-API-Key": API_KEY } : {}),
    },
});

apiClient.interceptors.response.use(
    (r) => {
        reportRestSuccess();
        return r;
    },
    (err) => {
        if (!err.response) {
            // No response at all — a genuine network failure (server down,
            // wifi dropped, DNS failure, timeout), as opposed to the server
            // responding with an error status. Only this case should flip
            // the global "server unreachable" banner — an ordinary 404/500
            // still means the server is right there and reachable.
            console.error("[API] Network error — server unreachable?", err.message);
            reportRestFailure();
        } else if (err.response.status === 401) {
            console.error(
                "[API] Rejected (401) — EXPO_PUBLIC_API_KEY likely missing or doesn't match the backend's API_KEY.",
            );
        }
        return Promise.reject(err);
    },
);

export default apiClient;
