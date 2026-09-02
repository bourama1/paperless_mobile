/**
 * connectivity.ts
 *
 * A tiny external store tracking whether the app can currently reach the
 * backend at all. This is deliberately NOT a React context — axios
 * interceptors and the socket.io client are both plain modules created
 * outside the component tree, so they need a way to report connectivity
 * events without needing a hook. React components read this via
 * useConnectivity() (src/hooks/useConnectivity.ts), which wraps it with
 * useSyncExternalStore.
 *
 * Two independent signals feed into this:
 *   - REST calls (api/client.ts's response interceptor) — reports a
 *     failure only on a genuine network-level error (no response at all),
 *     never on an ordinary HTTP error status, since a 404/500 still means
 *     the server IS reachable.
 *   - The Socket.IO connection (services/socket.ts) — reports failure on
 *     disconnect/connect_error, success on connect.
 *
 * Either signal going bad marks the server unreachable; both must be good
 * again to clear it. While unreachable, an automatic retry loop polls
 * the backend's /health endpoint (the one route that doesn't require the
 * API key) every RETRY_INTERVAL_MS until it succeeds.
 */

import { BASE_URL } from "../config/env";

const RETRY_INTERVAL_MS = 5000;
const HEALTH_CHECK_TIMEOUT_MS = 4000;

type Listener = () => void;

let restReachable = true;
let socketReachable = true;
let retrying = false;
const listeners = new Set<Listener>();
let retryTimer: ReturnType<typeof setInterval> | null = null;

function isReachable(): boolean {
    return restReachable && socketReachable;
}

// Cache the combined snapshot object so useSyncExternalStore's getSnapshot
// returns a stable reference between notifications (it requires that to
// avoid infinite render loops) instead of a new object on every call.
let snapshot = { isReachable: true, retrying: false };

function notify() {
    const next = { isReachable: isReachable(), retrying };
    if (next.isReachable === snapshot.isReachable && next.retrying === snapshot.retrying) {
        return;
    }
    snapshot = next;
    listeners.forEach((l) => l());
}

function startRetryLoopIfNeeded() {
    if (retryTimer || isReachable()) return;
    retryTimer = setInterval(() => {
        void retryNow();
    }, RETRY_INTERVAL_MS);
}

function stopRetryLoop() {
    if (retryTimer) {
        clearInterval(retryTimer);
        retryTimer = null;
    }
}

export function subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function getSnapshot() {
    return snapshot;
}

export function reportRestFailure() {
    restReachable = false;
    notify();
    startRetryLoopIfNeeded();
}

export function reportRestSuccess() {
    if (!restReachable) {
        restReachable = true;
        notify();
        if (isReachable()) stopRetryLoop();
    }
}

export function reportSocketFailure() {
    socketReachable = false;
    notify();
    startRetryLoopIfNeeded();
}

export function reportSocketSuccess() {
    if (!socketReachable) {
        socketReachable = true;
        notify();
        if (isReachable()) stopRetryLoop();
    }
}

/**
 * Actively checks the backend's /health endpoint (no API key required) and
 * updates the REST half of connectivity based on the result. Used both by
 * the background retry loop and by the user tapping "Retry" — a resolved
 * fetch means the server responded at all, regardless of status code.
 */
export async function retryNow(): Promise<boolean> {
    if (retrying) return isReachable();
    retrying = true;
    notify();
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
        await fetch(`${BASE_URL}/health`, { signal: controller.signal });
        clearTimeout(timeout);
        reportRestSuccess();
        return isReachable();
    } catch {
        // Health check itself failed to reach the server — still down.
        restReachable = false;
        return false;
    } finally {
        retrying = false;
        notify();
    }
}
