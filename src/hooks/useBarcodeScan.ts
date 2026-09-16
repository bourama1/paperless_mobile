import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import apiClient from "../api/client";
import { t } from "../i18n";
import { useOpenOrderByCode, OrderCodeResult } from "./useOpenOrderByCode";

/**
 * Scans a prep-label barcode and opens its order's BOM directly — resolves
 * the code via /workstations/resolve-scan (production order number first,
 * falling back to project number — see workstationService.resolveScan),
 * then reuses useOpenOrderByCode for the "pick a type if needed, open it"
 * tail shared with the manual Search tab.
 */
export function useBarcodeScan() {
    const [scannerVisible, setScannerVisible] = useState(false);
    const [scanError, setScanError] = useState<string | null>(null);
    const opener = useOpenOrderByCode();

    const resolve = useMutation({
        mutationFn: async (code: string) => {
            const response = await apiClient.get("/workstations/resolve-scan", {
                params: { code },
            });
            return response.data as OrderCodeResult[];
        },
        onSuccess: (results) => {
            if (results.length === 0) {
                setScanError(t("scan.noMatch"));
                return;
            }
            setScannerVisible(false);
            setScanError(null);
            // A scan is always for one specific physical label — open the
            // (only, in practice) match directly instead of showing the
            // multi-result list the manual text search needs.
            opener.openResult(results[0]);
        },
        onError: () => {
            setScanError(t("scan.error"));
        },
    });

    return {
        ...opener,
        scanner: {
            visible: scannerVisible,
            open: () => {
                setScanError(null);
                setScannerVisible(true);
            },
            onDismiss: () => setScannerVisible(false),
            onScanned: (code: string) => resolve.mutate(code),
            resolving: resolve.isPending,
            errorMessage: scanError,
        },
    };
}
