import React, { useEffect, useState } from "react";
import { View, StyleSheet, ActivityIndicator, TouchableOpacity, ScrollView } from "react-native";
import { Portal, Modal, Text, Snackbar } from "react-native-paper";
import { useMutation } from "@tanstack/react-query";
import { t } from "../i18n";
import { postPrepLabel } from "./PrepLabelModal";

export interface ReprintLabelModalProps {
    visible: boolean;
    onDismiss: () => void;
    projectNumber: string;
    position: string;
    totalCycles: number;
}

/**
 * Reprints chosen doors of an already printed prep label — e.g. the
 * printer ran out of ink halfway through a 20-door order. The backend
 * prints them exactly as the original (same preparer, time, n/N) and
 * records nothing new, so no employee picker here.
 */
export default function ReprintLabelModal({
    visible,
    onDismiss,
    projectNumber,
    position,
    totalCycles,
}: ReprintLabelModalProps) {
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [snackbar, setSnackbar] = useState({ visible: false, message: "" });
    const doors = Array.from({ length: Math.max(1, totalCycles) }, (_, i) => i + 1);

    // A single-door order has nothing to choose — preselect it.
    useEffect(() => {
        if (visible) setSelected(new Set(totalCycles <= 1 ? [1] : []));
    }, [visible, totalCycles]);

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
        onSuccess: () => {
            setSnackbar({ visible: true, message: t("document.labelPrinted") });
            onDismiss();
        },
        onError: (error: any) => {
            const msg = error?.response?.data?.error || error.message;
            setSnackbar({ visible: true, message: t("document.labelPrintError", { msg }) });
        },
    });

    const allSelected = selected.size === doors.length;

    return (
        <>
            <Portal>
                <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={styles.modal}>
                    <Text variant="titleLarge" style={{ marginBottom: 4 }}>
                        {t("reprint.title")}
                    </Text>
                    <Text variant="bodyMedium" style={{ color: "#666", marginBottom: 16 }}>
                        {t("reprint.hint")}
                    </Text>

                    {doors.length > 1 && (
                        <TouchableOpacity
                            onPress={() => setSelected(new Set(allSelected ? [] : doors))}
                            style={{ alignSelf: "flex-end", marginBottom: 8 }}>
                            <Text style={styles.link}>{allSelected ? t("reprint.none") : t("reprint.all")}</Text>
                        </TouchableOpacity>
                    )}
                    <ScrollView style={styles.grid} contentContainerStyle={styles.gridContent}>
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

                    <TouchableOpacity
                        style={[styles.confirmBtn, (selected.size === 0 || reprint.isPending) && styles.confirmBtnDisabled]}
                        activeOpacity={0.8}
                        disabled={selected.size === 0 || reprint.isPending}
                        onPress={() => reprint.mutate()}>
                        {reprint.isPending ?
                            <ActivityIndicator size="small" color="#fff" />
                        :   <Text style={styles.confirmBtnText}>{t("reprint.confirm", { count: selected.size })}</Text>}
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
    modal: {
        backgroundColor: "#fff",
        marginHorizontal: 24,
        borderRadius: 16,
        padding: 24,
    },
    link: { color: "#ff5100", fontWeight: "bold" },
    grid: { maxHeight: 280, marginBottom: 16 },
    gridContent: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
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
    confirmBtn: {
        backgroundColor: "#ff5100",
        borderRadius: 10,
        paddingVertical: 16,
        alignItems: "center",
    },
    confirmBtnDisabled: { backgroundColor: "#f0c4a8" },
    confirmBtnText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
});
