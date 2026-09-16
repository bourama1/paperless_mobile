import { useState } from "react";
import { useRouter } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import apiClient from "../api/client";
import { t } from "../i18n";

export interface OrderCodeResult {
    customer_code: number;
    order_code: number;
    position_code: number;
    locked?: boolean;
}

export interface PbomTypeOption {
    document_type: number;
    name: string; // machine name, e.g. "pbom_motor" — translate via docType.<name>
}

/**
 * "Pick a BOM type if there's more than one, then open the document viewer"
 * — the tail end of both the Search tab's manual lookup and the barcode
 * scanner's resolved result. Shared so there's one implementation instead
 * of two copies that can drift apart.
 */
export function useOpenOrderByCode() {
    const router = useRouter();
    const [pickerVisible, setPickerVisible] = useState(false);
    const [pickerOptions, setPickerOptions] = useState<PbomTypeOption[]>([]);
    const [pickerTarget, setPickerTarget] = useState<OrderCodeResult | null>(null);
    const [snackbar, setSnackbar] = useState({ visible: false, message: "" });

    const importPbom = useMutation({
        mutationFn: async ({
            item,
            documentType,
        }: {
            item: OrderCodeResult;
            documentType?: number;
        }) => {
            const response = await apiClient.post("/workstations/import-pbom", {
                projectNumber: String(item.order_code),
                position: String(item.position_code),
                customer: String(item.customer_code),
                documentType,
            });
            return response.data;
        },
        onSuccess: (doc) => {
            setPickerVisible(false);
            const rev = doc.revisions?.[0];
            router.push({
                pathname: `/document/${doc.id}`,
                params: {
                    filename: rev?.filename || "",
                    version: rev?.version || 1,
                    annotations: rev?.annotations || "",
                    fromPrepQueue: "1",
                },
            });
        },
        onError: (error: any) => {
            setPickerVisible(false);
            const msg = error?.response?.data?.error || error.message;
            setSnackbar({ visible: true, message: t("search.errorPrefix", { msg }) });
        },
    });

    // Find out which BOM types actually exist for the resolved position,
    // then either open the only one directly, or let the person choose.
    const fetchTypes = useMutation({
        mutationFn: async (item: OrderCodeResult) => {
            const response = await apiClient.get("/workstations/pbom-types", {
                params: {
                    order_code: item.order_code,
                    position_code: item.position_code,
                },
            });
            return { item, types: response.data as PbomTypeOption[] };
        },
        onSuccess: ({ item, types }) => {
            if (types.length === 0) {
                setSnackbar({ visible: true, message: t("search.typesEmpty") });
                return;
            }
            if (types.length === 1) {
                importPbom.mutate({ item, documentType: types[0].document_type });
                return;
            }
            setPickerOptions(types);
            setPickerTarget(item);
            setPickerVisible(true);
        },
        onError: () => {
            setSnackbar({ visible: true, message: t("search.typesError") });
        },
    });

    return {
        openResult: (item: OrderCodeResult) => fetchTypes.mutate(item),
        isOpening: fetchTypes.isPending || importPbom.isPending,
        openingItem: fetchTypes.variables,
        picker: {
            visible: pickerVisible,
            options: pickerOptions,
            disabled: importPbom.isPending,
            onDismiss: () => setPickerVisible(false),
            onSelect: (documentType: number) => {
                if (pickerTarget) importPbom.mutate({ item: pickerTarget, documentType });
            },
        },
        snackbar: {
            ...snackbar,
            onDismiss: () => setSnackbar((s) => ({ ...s, visible: false })),
        },
    };
}
