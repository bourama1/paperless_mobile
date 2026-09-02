jest.mock("../../config/env", () => ({
    BASE_URL: "http://test-server:5300",
}));

describe("connectivity store", () => {
    let connectivity: typeof import("../connectivity");

    beforeEach(() => {
        jest.resetModules();
        jest.useFakeTimers();
        (global as any).fetch = jest.fn();
        connectivity = require("../connectivity");
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.clearAllMocks();
    });

    it("starts out reachable and not retrying", () => {
        expect(connectivity.getSnapshot()).toEqual({ isReachable: true, retrying: false });
    });

    it("reportRestFailure marks unreachable and notifies subscribers", () => {
        const listener = jest.fn();
        connectivity.subscribe(listener);

        connectivity.reportRestFailure();

        expect(connectivity.getSnapshot().isReachable).toBe(false);
        expect(listener).toHaveBeenCalled();
    });

    it("reportRestSuccess restores reachability", () => {
        connectivity.reportRestFailure();
        connectivity.reportRestSuccess();

        expect(connectivity.getSnapshot().isReachable).toBe(true);
    });

    it("stays unreachable until BOTH the REST and socket signals recover", () => {
        connectivity.reportRestFailure();
        connectivity.reportSocketFailure();

        connectivity.reportRestSuccess();
        expect(connectivity.getSnapshot().isReachable).toBe(false);

        connectivity.reportSocketSuccess();
        expect(connectivity.getSnapshot().isReachable).toBe(true);
    });

    it("does not notify listeners when reporting success while already reachable", () => {
        const listener = jest.fn();
        connectivity.subscribe(listener);

        connectivity.reportRestSuccess(); // already reachable — should be a no-op

        expect(listener).not.toHaveBeenCalled();
    });

    it("unsubscribe stops further notifications", () => {
        const listener = jest.fn();
        const unsubscribe = connectivity.subscribe(listener);
        unsubscribe();

        connectivity.reportRestFailure();

        expect(listener).not.toHaveBeenCalled();
    });

    it("retryNow hits /health and clears unreachable state on success", async () => {
        (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
        connectivity.reportRestFailure();

        const result = await connectivity.retryNow();

        expect(result).toBe(true);
        expect(connectivity.getSnapshot().isReachable).toBe(true);
        expect(global.fetch).toHaveBeenCalledWith(
            "http://test-server:5300/health",
            expect.objectContaining({ signal: expect.anything() }),
        );
    });

    it("retryNow stays unreachable when the health check itself fails", async () => {
        (global.fetch as jest.Mock).mockRejectedValue(new Error("network fail"));
        connectivity.reportRestFailure();

        const result = await connectivity.retryNow();

        expect(result).toBe(false);
        expect(connectivity.getSnapshot().isReachable).toBe(false);
    });

    it("auto-retries in the background on an interval until reachable again", async () => {
        (global.fetch as jest.Mock)
            .mockRejectedValueOnce(new Error("still down"))
            .mockResolvedValueOnce({ ok: true });

        connectivity.reportRestFailure();
        expect(connectivity.getSnapshot().isReachable).toBe(false);

        // First background tick — health check still fails.
        await jest.advanceTimersByTimeAsync(5000);
        expect(connectivity.getSnapshot().isReachable).toBe(false);
        expect(global.fetch).toHaveBeenCalledTimes(1);

        // Second background tick — recovers, and the loop should stop
        // scheduling further checks once reachable again.
        await jest.advanceTimersByTimeAsync(5000);
        expect(connectivity.getSnapshot().isReachable).toBe(true);
        expect(global.fetch).toHaveBeenCalledTimes(2);

        await jest.advanceTimersByTimeAsync(15000);
        expect(global.fetch).toHaveBeenCalledTimes(2); // no more polling once healthy
    });
});
