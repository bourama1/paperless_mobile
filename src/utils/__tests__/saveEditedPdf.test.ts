jest.mock("../../api/client", () => ({
    __esModule: true,
    default: { post: jest.fn() },
}));

import apiClient from "../../api/client";
import { saveEditedPdfWithRetry, isRetryableSaveError, SAVE_TIMEOUT_MS } from "../saveEditedPdf";

const save = { documentId: 1, pdfBase64: "AAAA", filename: "doc.pdf" };

describe("isRetryableSaveError", () => {
    it("treats a timeout/dropped-connection (no response) as retryable", () => {
        expect(isRetryableSaveError(new Error("timeout of 120000ms exceeded"))).toBe(true);
        expect(isRetryableSaveError({})).toBe(true);
    });

    it("treats a real server response (validation error, 500, etc.) as NOT retryable", () => {
        expect(isRetryableSaveError({ response: { status: 400 } })).toBe(false);
        expect(isRetryableSaveError({ response: { status: 500 } })).toBe(false);
    });
});

describe("saveEditedPdfWithRetry", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("succeeds on the first attempt without retrying", async () => {
        (apiClient.post as jest.Mock).mockResolvedValue({ data: {} });

        await saveEditedPdfWithRetry(save, [0, 0]);

        expect(apiClient.post).toHaveBeenCalledTimes(1);
        expect(apiClient.post).toHaveBeenCalledWith(
            "/workstations/save-edited",
            { documentId: 1, pdfBase64: "AAAA", filename: "doc.pdf" },
            { timeout: SAVE_TIMEOUT_MS },
        );
    });

    it("retries a network-level failure and succeeds on a later attempt", async () => {
        (apiClient.post as jest.Mock)
            .mockRejectedValueOnce(new Error("timeout"))
            .mockResolvedValueOnce({ data: {} });

        await saveEditedPdfWithRetry(save, [0, 0]);

        expect(apiClient.post).toHaveBeenCalledTimes(2);
    });

    it("gives up after exhausting all attempts and throws the last error", async () => {
        const networkError = new Error("Network Error");
        (apiClient.post as jest.Mock).mockRejectedValue(networkError);

        await expect(saveEditedPdfWithRetry(save, [0, 0])).rejects.toThrow("Network Error");
        expect(apiClient.post).toHaveBeenCalledTimes(3); // SAVE_MAX_ATTEMPTS
    });

    it("does not retry a real server rejection — fails immediately", async () => {
        const validationError = { response: { status: 400, data: { error: "bad request" } } };
        (apiClient.post as jest.Mock).mockRejectedValue(validationError);

        await expect(saveEditedPdfWithRetry(save, [0, 0])).rejects.toBe(validationError);
        expect(apiClient.post).toHaveBeenCalledTimes(1);
    });
});
