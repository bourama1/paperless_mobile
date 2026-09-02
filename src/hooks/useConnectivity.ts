import { useSyncExternalStore, useCallback } from "react";
import { subscribe, getSnapshot, retryNow } from "../services/connectivity";

/**
 * Reactive view of src/services/connectivity.ts's external store. Returns
 * whether the backend currently looks reachable (both REST and the socket
 * connection have to be up), whether a retry check is in flight, and a
 * retry() function to trigger one manually (e.g. from a "Retry" button).
 */
export function useConnectivity() {
    const { isReachable, retrying } = useSyncExternalStore(subscribe, getSnapshot);
    const retry = useCallback(() => {
        void retryNow();
    }, []);
    return { isReachable, retrying, retry };
}
