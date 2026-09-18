import apiClient from "../api/client";

// Saving an edited PDF is a large one-shot upload (base64-encoded, so ~33%
// bigger than the PDF itself), not a typical small API call — the shared
// apiClient's flat 10s timeout was tuned for the latter and was the main
// reason saves kept failing on slower/congested tablet WiFi. Give this
// specific request much more room, and retry network-level failures
// (timeout, dropped connection) automatically since those are exactly the
// transient conditions a flaky WiFi network produces.
export const SAVE_TIMEOUT_MS = 120_000;
export const SAVE_MAX_ATTEMPTS = 3;
export const SAVE_RETRY_DELAYS_MS = [2000, 5000]; // between attempts 1->2 and 2->3

// A response means the server actually looked at the request and rejected
// it (bad data, disk full, etc.) — retrying won't change that. No response
// at all (timeout, DNS failure, WiFi dropped mid-upload) is exactly the
// transient case retrying is for.
export function isRetryableSaveError(err: any): boolean {
    return !err?.response;
}

export interface PendingSave {
    documentId: number;
    pdfBase64: string;
    filename: string;
}

export async function saveEditedPdfWithRetry(
    { documentId, pdfBase64, filename }: PendingSave,
    delaysMs: number[] = SAVE_RETRY_DELAYS_MS,
): Promise<void> {
    for (let attempt = 1; attempt <= SAVE_MAX_ATTEMPTS; attempt++) {
        try {
            await apiClient.post(
                "/workstations/save-edited",
                { documentId, pdfBase64, filename },
                { timeout: SAVE_TIMEOUT_MS },
            );
            return;
        } catch (err: any) {
            if (!isRetryableSaveError(err) || attempt === SAVE_MAX_ATTEMPTS) throw err;
            await new Promise((resolve) => setTimeout(resolve, delaysMs[attempt - 1]));
        }
    }
}
