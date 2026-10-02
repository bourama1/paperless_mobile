import React, { useEffect, useState } from "react";
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

/**
 * Posts a prep-label print (or reprint) request. If the backend printed
 * directly to the Godex, it returns {"success":true} — nothing more to do
 * here. If PREP_LABEL_PRINTER_HOST is not configured on the server it falls
 * back to returning the raw PDF bytes so the worker can still send it
 * somewhere manually (share sheet / dev testing).
 */
export async function postPrepLabel(url: string, body: { projectNumber: string; position: string; [key: string]: unknown }) {
    const response = await apiClient.post(url, body, { responseType: "arraybuffer" });
    const contentType = String(response.headers["content-type"] || "");
    if (contentType.includes("application/json")) return;

    const filename = `label_${body.projectNumber}_${body.position}.pdf`;

    if (Platform.OS === "web") {
        const blob = new Blob([response.data], { type: "application/pdf" });
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, "_blank");
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
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
}

export interface PrepLabelStatus {
    // Door count from the PTL order file — the server prints this many; null if unknown.
    doors: number | null;
    printed: { employeeName: string; printedAt: string; totalCycles: number } | null;
}

/** Whether (and how) this order's prep label was already printed. */
export function usePrepLabelStatus(projectNumber: string, position: string, enabled: boolean) {
    return useQuery<PrepLabelStatus>({
        queryKey: ["prep-label-status", projectNumber, position],
        queryFn: async () => {
            const response = await apiClient.get("/workstations/prep-label-status", {
                params: { projectNumber, position },
            });
            return response.data;
        },
        enabled: enabled && !!projectNumber && !!position,
    });
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
 *
 * Once the label was printed, it turns into a reprint of chosen doors
 * instead (e.g. the printer ran out of ink on the last 2 of 24) — see
 * ReprintDoors.
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
    const { data: status, isLoading: statusLoading } = usePrepLabelStatus(projectNumber, position, visible);
    const doorCount = status?.doors ?? totalCycles;

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
            await postPrepLabel("/workstations/print-prep-label", {
                projectNumber,
                position,
                employeeName: selectedEmployee,
                totalCycles: doorCount,
            });
        },
        onSuccess: () => {
            setSelectedEmployee(null);
            setSnackbar({ visible: true, message: t("document.labelPrinted") });
            // Printing here is what marks the item done
            // (order_preparation_log), so drop it from the prep queue list
            // now rather than waiting for a pull-to-refresh.
            queryClient.invalidateQueries({ queryKey: ["prep-queue"] });
            // …and from now on this dialog offers reprints instead.
            queryClient.invalidateQueries({ queryKey: ["prep-label-status", projectNumber, position] });
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
                    {statusLoading ?
                        <ActivityIndicator size="small" style={{ marginVertical: 24 }} />
                    : status?.printed ?
                        <ReprintDoors
                            visible={visible}
                            printed={status.printed}
                            projectNumber={projectNumber}
                            position={position}
                            onPrinted={() => {
                                setSnackbar({ visible: true, message: t("document.labelPrinted") });
                                onDismiss();
                            }}
                            onError={(msg) => setSnackbar({ visible: true, message: t("document.labelPrintError", { msg }) })}
                        />
                    :   <>
                    <Text variant="titleLarge" style={{ marginBottom: 4 }}>
                        {t("document.printLabel")}
                    </Text>
                    <Text variant="bodyMedium" style={{ color: "#666", marginBottom: 16 }}>
                        {t("document.printLabelHint")}
                    </Text>
                    {doorCount > 1 && (
                        <Text variant="bodyMedium" style={styles.doorCount}>
                            {t("document.printLabelDoorCount", { count: doorCount })}
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
                    </>
                    }
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

/**
 * The dialog for an order whose label was already printed: pick the doors
 * whose label came out bad and reprint just those. The backend prints them
 * exactly like the original (same preparer, time, n/N) and records nothing
 * new, so there's no employee picker or checklist here.
 */
function ReprintDoors({
    visible,
    printed,
    projectNumber,
    position,
    onPrinted,
    onError,
}: {
    visible: boolean;
    printed: NonNullable<PrepLabelStatus["printed"]>;
    projectNumber: string;
    position: string;
    onPrinted: () => void;
    onError: (msg: string) => void;
}) {
    const doors = Array.from({ length: Math.max(1, printed.totalCycles) }, (_, i) => i + 1);
    const [selected, setSelected] = useState<Set<number>>(new Set());

    // Fresh selection each time; a single-door order has nothing to choose.
    useEffect(() => {
        if (visible) setSelected(new Set(doors.length === 1 ? [1] : []));
    }, [visible, doors.length]);

    const toggle = (door: number) =>
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(door)) next.delete(door);
            else next.add(door);
            return next;
        });

    const reprint = useMutation({
        mutationFn: () =>
            postPrepLabel("/workstations/reprint-prep-label", {
                projectNumber,
                position,
                cycles: [...selected].sort((a, b) => a - b),
            }),
        onSuccess: onPrinted,
        onError: (error: any) => onError(error?.response?.data?.error || error.message),
    });

    const allSelected = selected.size === doors.length;
    const printedAt = new Date(printed.printedAt).toLocaleString("cs-CZ", {
        timeZone: "Europe/Prague",
        day: "numeric",
        month: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });

    return (
        <>
            <Text variant="titleLarge" style={{ marginBottom: 4 }}>
                {t("reprint.title")}
            </Text>
            <Text variant="bodyMedium" style={styles.doorCount}>
                {t("reprint.alreadyPrinted", { date: printedAt, name: printed.employeeName })}
            </Text>
            <Text variant="bodyMedium" style={{ color: "#666", marginBottom: 12 }}>
                {doors.length > 1 ? t("reprint.hint") : t("reprint.hintSingle")}
            </Text>

            {doors.length > 1 && (
                <>
                    <TouchableOpacity
                        onPress={() => setSelected(new Set(allSelected ? [] : doors))}
                        style={{ alignSelf: "flex-end", marginBottom: 8 }}>
                        <Text style={styles.link}>{allSelected ? t("reprint.none") : t("reprint.all")}</Text>
                    </TouchableOpacity>
                    <ScrollView style={styles.doorGrid} contentContainerStyle={styles.doorGridContent}>
                        {doors.map((door) => {
                            const on = selected.has(door);
                            return (
                                <TouchableOpacity
                                    key={door}
                                    style={[styles.door, on && styles.doorOn]}
                                    activeOpacity={0.7}
                                    onPress={() => toggle(door)}>
                                    <Text style={[styles.doorText, on && styles.doorTextOn]}>
                                        {door}/{doors.length}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </>
            )}

            <TouchableOpacity
                style={[styles.confirmBtn, (selected.size === 0 || reprint.isPending) && styles.confirmBtnDisabled]}
                activeOpacity={0.8}
                disabled={selected.size === 0 || reprint.isPending}
                onPress={() => reprint.mutate()}>
                {reprint.isPending ?
                    <ActivityIndicator size="small" color="#fff" />
                :   <Text style={styles.confirmBtnText}>{t("reprint.confirm", { count: selected.size })}</Text>}
            </TouchableOpacity>
        </>
    );
}

const styles = StyleSheet.create({
    link: { color: "#ff5100", fontWeight: "bold" },
    doorGrid: { maxHeight: 280, marginBottom: 16 },
    doorGridContent: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    door: {
        minWidth: 64,
        paddingVertical: 12,
        paddingHorizontal: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "#ccc",
        alignItems: "center",
    },
    doorOn: { backgroundColor: "#ff5100", borderColor: "#ff5100" },
    doorText: { color: "#333", fontWeight: "bold" },
    doorTextOn: { color: "#fff" },
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
