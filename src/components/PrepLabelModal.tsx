import React, { useState } from "react";
import { View, StyleSheet, ActivityIndicator, Platform, TouchableOpacity, ScrollView } from "react-native";
import { Portal, Modal, Text, Snackbar } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { writeAsStringAsync, cacheDirectory, EncodingType } from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import apiClient from "../api/client";
import { t } from "../i18n";
import { useEmployees } from "../hooks/useEmployees";
import { arrayBufferToBase64 } from "../utils/base64";
import EmployeePicker from "./EmployeePicker";

interface PrepChecklistItem {
    itemID: string;
    itemDesc: string;
    itemQuantity: number;
    unit: string;
    checked: boolean;
}

export interface PrepLabelModalProps {
    visible: boolean;
    onDismiss: () => void;
    projectNumber: string;
    position: string;
    totalCycles: number;
    /** Called right after a successful print, in addition to the modal's
     *  own snackbar and its automatic ["prep-queue"] invalidation. */
    onPrinted?: () => void;
}

/**
 * The "who's preparing this, what non-PTL items still need prepping,
 * print the label" flow. Shared by the document viewer's prep-label
 * action (opened after reviewing the PDF — see app/document/[id].tsx) and
 * the prep queue's direct "checklist" mode (see app/(tabs)/prep-queue.tsx's
 * PDF/checklist toggle), so both stay backed by one implementation instead
 * of two copies that can drift apart.
 *
 * Fully self-contained: owns its own employee/checklist state and error
 * snackbar, and needs nothing from the caller beyond which order this is
 * for (projectNumber/position/totalCycles) and visibility control.
 */
export default function PrepLabelModal({
    visible,
    onDismiss,
    projectNumber,
    position,
    totalCycles,
    onPrinted,
}: PrepLabelModalProps) {
    const queryClient = useQueryClient();
    const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
    const [snackbar, setSnackbar] = useState({ visible: false, message: "" });
    const { data: employees } = useEmployees(visible);

    // Same idea as motorOrderService's isNonPtlOrder check on the backend,
    // but per item: an order's items that don't appear in parts.xlsx have
    // to be physically prepared by hand, so the worker has to tap through
    // all of them here before the print button unlocks below. Fetched only
    // while the modal is open — most orders have nothing to check.
    const { data: prepChecklist, isLoading: prepChecklistLoading } = useQuery<{
        items: PrepChecklistItem[];
        allPrepared: boolean;
    }>({
        queryKey: ["prep-items", projectNumber, position],
        queryFn: async () => {
            const response = await apiClient.get("/prep-queue/items", {
                params: { projectNumber, position },
            });
            return response.data;
        },
        enabled: visible,
    });
    const prepItems = prepChecklist?.items ?? [];
    // Fail safe while the checklist hasn't loaded yet (or errored): treat
    // it as NOT fully prepared, never let a race let the print button
    // through before we actually know what's still outstanding.
    const prepAllChecked = prepChecklist?.allPrepared ?? false;

    const checkPrepItem = useMutation({
        mutationFn: async (item: { itemID: string; itemDesc: string }) => {
            const response = await apiClient.post("/prep-queue/items/check", {
                projectNumber,
                position,
                itemId: item.itemID,
                itemDesc: item.itemDesc,
                employeeName: selectedEmployee,
            });
            return response.data;
        },
        onSuccess: (data) => {
            queryClient.setQueryData(["prep-items", projectNumber, position], data);
        },
        onError: (error: any) => {
            const msg = error?.response?.data?.error || error.message;
            setSnackbar({ visible: true, message: t("document.prepItemCheckError", { msg }) });
        },
    });

    // Lets a worker undo a misclick — tapping an already-checked item calls
    // this instead of checkPrepItem (see the row's onPress below).
    const uncheckPrepItem = useMutation({
        mutationFn: async (item: { itemID: string }) => {
            const response = await apiClient.post("/prep-queue/items/uncheck", {
                projectNumber,
                position,
                itemId: item.itemID,
            });
            return response.data;
        },
        onSuccess: (data) => {
            queryClient.setQueryData(["prep-items", projectNumber, position], data);
        },
        onError: (error: any) => {
            const msg = error?.response?.data?.error || error.message;
            setSnackbar({ visible: true, message: t("document.prepItemCheckError", { msg }) });
        },
    });

    const printLabel = useMutation({
        mutationFn: async () => {
            if (!selectedEmployee) return;
            const response = await apiClient.post(
                "/workstations/print-prep-label",
                { projectNumber, position, employeeName: selectedEmployee, totalCycles },
                { responseType: "arraybuffer" },
            );

            // If the backend printed directly to the Godex, it returns
            // {"success":true} — nothing more to do on the mobile side.
            // If PREP_LABEL_PRINTER_HOST is not configured on the server it
            // falls back to returning the raw PDF bytes so the worker can
            // still send it somewhere manually (share sheet / dev testing).
            const contentType = response.headers["content-type"] || "";
            if (contentType.includes("application/json")) return;

            const filename = `label_${projectNumber}_${position}.pdf`;

            if (Platform.OS === "web") {
                const blob = new Blob([response.data], { type: "application/pdf" });
                const url = URL.createObjectURL(blob);
                window.open(url, "_blank");
                setTimeout(() => URL.revokeObjectURL(url), 60000);
                return;
            }

            const base64 = arrayBufferToBase64(response.data);
            const fileUri = `${cacheDirectory}${filename}`;
            await writeAsStringAsync(fileUri, base64, { encoding: EncodingType.Base64 });

            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(fileUri, {
                    mimeType: "application/pdf",
                    dialogTitle: t("document.printLabel"),
                    UTI: "com.adobe.pdf",
                });
            } else {
                throw new Error(t("document.sharingUnavailable"));
            }
        },
        onSuccess: () => {
            setSelectedEmployee(null);
            setSnackbar({ visible: true, message: t("document.labelPrinted") });
            // Printing here is what marks the item done
            // (order_preparation_log), so drop it from the prep queue list
            // now rather than waiting for a pull-to-refresh.
            queryClient.invalidateQueries({ queryKey: ["prep-queue"] });
            onDismiss();
            onPrinted?.();
        },
        onError: (error: any) => {
            const msg = error?.response?.data?.error || error.message;
            setSnackbar({ visible: true, message: t("document.labelPrintError", { msg }) });
        },
    });

    return (
        <>
            <Portal>
                <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={styles.modal}>
                    <Text variant="titleLarge" style={{ marginBottom: 4 }}>
                        {t("document.printLabel")}
                    </Text>
                    <Text variant="bodyMedium" style={{ color: "#666", marginBottom: 16 }}>
                        {t("document.printLabelHint")}
                    </Text>
                    {totalCycles > 1 && (
                        <Text variant="bodyMedium" style={styles.doorCount}>
                            {t("document.printLabelDoorCount", { count: totalCycles })}
                        </Text>
                    )}
                    {prepChecklistLoading && <ActivityIndicator size="small" style={{ marginVertical: 12 }} />}

                    {prepItems.length > 0 && (
                        <View style={{ marginBottom: 16 }}>
                            <Text variant="titleSmall" style={{ marginBottom: 4 }}>
                                {t("document.prepChecklistTitle")}
                            </Text>
                            <Text variant="bodySmall" style={{ color: "#666", marginBottom: 8 }}>
                                {t("document.prepChecklistHint")}
                            </Text>
                            <ScrollView style={styles.prepChecklist}>
                                {prepItems.map((item) => {
                                    const rowDisabled =
                                        !selectedEmployee || checkPrepItem.isPending || uncheckPrepItem.isPending;
                                    return (
                                        <TouchableOpacity
                                            key={item.itemID}
                                            style={styles.prepChecklistRow}
                                            activeOpacity={0.7}
                                            disabled={rowDisabled}
                                            onPress={() =>
                                                item.checked ?
                                                    uncheckPrepItem.mutate({ itemID: item.itemID })
                                                :   checkPrepItem.mutate({ itemID: item.itemID, itemDesc: item.itemDesc })
                                            }>
                                            <Ionicons
                                                name={item.checked ? "checkbox" : "square-outline"}
                                                size={22}
                                                color={item.checked ? "#2e7d32" : "#909090"}
                                            />
                                            <View style={{ flex: 1, marginLeft: 10 }}>
                                                <Text
                                                    variant="bodyMedium"
                                                    style={item.checked ? styles.prepItemTextChecked : undefined}>
                                                    {item.itemDesc || item.itemID}
                                                </Text>
                                                <Text variant="bodySmall" style={{ color: "#999" }}>
                                                    {item.itemID} · {item.itemQuantity} {item.unit}
                                                </Text>
                                            </View>
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>
                        </View>
                    )}

                    <EmployeePicker
                        employees={employees}
                        selected={selectedEmployee}
                        onSelect={setSelectedEmployee}
                        style={{ marginBottom: 16 }}
                    />

                    <TouchableOpacity
                        style={[
                            styles.confirmBtn,
                            (!selectedEmployee || printLabel.isPending || prepChecklistLoading || !prepAllChecked) &&
                                styles.confirmBtnDisabled,
                        ]}
                        activeOpacity={0.8}
                        disabled={
                            !selectedEmployee || printLabel.isPending || prepChecklistLoading || !prepAllChecked
                        }
                        onPress={() => printLabel.mutate()}>
                        {printLabel.isPending ?
                            <ActivityIndicator size="small" color="#fff" />
                        :   <Text style={styles.confirmBtnText}>{t("document.printLabelConfirm")}</Text>}
                    </TouchableOpacity>
                </Modal>
            </Portal>
            <Snackbar
                visible={snackbar.visible}
                onDismiss={() => setSnackbar({ visible: false, message: "" })}
                duration={4000}>
                {snackbar.message}
            </Snackbar>
        </>
    );
}

const styles = StyleSheet.create({
    doorCount: {
        color: "#ff5100",
        fontWeight: "bold",
        marginBottom: 16,
    },
    modal: {
        backgroundColor: "#fff",
        marginHorizontal: 24,
        borderRadius: 16,
        padding: 24,
    },
    prepChecklist: {
        maxHeight: 220,
        borderWidth: 1,
        borderColor: "#eee",
        borderRadius: 8,
    },
    prepChecklistRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: "#f0f0f0",
    },
    prepItemTextChecked: { color: "#999", textDecorationLine: "line-through" },
    confirmBtn: {
        backgroundColor: "#ff5100",
        borderRadius: 10,
        paddingVertical: 16,
        alignItems: "center",
    },
    confirmBtnDisabled: { backgroundColor: "#f0c4a8" },
    confirmBtnText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
});
