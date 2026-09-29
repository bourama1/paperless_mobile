import React, { useState } from "react";
import { View, StyleSheet, ActivityIndicator, TouchableOpacity, ScrollView } from "react-native";
import { Portal, Modal, Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { useMutation } from "@tanstack/react-query";
import apiClient from "../api/client";
import { t } from "../i18n";
import { CompletionStatus, OrderHistoryEvent } from "../types";
import { useEmployees } from "../hooks/useEmployees";
import EmployeePicker from "./EmployeePicker";

// Never plain "complete" — a manual completion must not close the order
// in TOORS automatically (the backend refuses it too).
const STATUS_OPTIONS: { value: CompletionStatus; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { value: "complete_with_changes", label: "kiosk.statusCompleteWithChanges", icon: "sync-outline" },
    { value: "missing_product", label: "kiosk.statusMissing", icon: "time" },
    { value: "shipped_incomplete", label: "kiosk.statusIncomplete", icon: "alert-circle" },
];

/**
 * Completing a cycle of an order that can't go through P2L — reached via
 * the hidden, admin-PIN-protected action in the document viewer. Same
 * choices as the kiosk (who, which status) minus "complete", per cycle.
 * Cycles already completed (by P2L or manually) are marked; completing one
 * again just adds a newer record, like the kiosk would.
 */
export default function ManualCompletionModal({
    visible,
    onDismiss,
    onDone,
    documentId,
    totalCycles,
    history,
    adminPin,
}: {
    visible: boolean;
    onDismiss: () => void;
    onDone: () => void;
    documentId: number;
    totalCycles: number;
    history: OrderHistoryEvent[];
    adminPin: string;
}) {
    const [cycle, setCycle] = useState<number>(1);
    const [employee, setEmployee] = useState<string | null>(null);
    const [status, setStatus] = useState<CompletionStatus | null>(null);
    const [error, setError] = useState<string | null>(null);
    const { data: employees } = useEmployees(visible);

    const completedCycles = new Set(history.filter((e) => e.type === "completed").map((e) => e.cycleIndex));
    const cycles = Array.from({ length: Math.max(1, totalCycles) }, (_, i) => i + 1);

    const reset = () => {
        setCycle(1);
        setEmployee(null);
        setStatus(null);
        setError(null);
    };
    const close = () => {
        reset();
        onDismiss();
    };

    const submit = useMutation({
        mutationFn: async () =>
            apiClient.post(
                "/workstations/manual-completion",
                { documentId, cycleIndex: cycle, totalCycles, employeeName: employee, status },
                { headers: { "X-Admin-Pin": adminPin } },
            ),
        onSuccess: () => {
            reset();
            onDone();
        },
        onError: (err: any) => setError(err?.response?.data?.error || err.message),
    });

    const canSubmit = !!employee && !!status && !submit.isPending;

    return (
        <Portal>
            <Modal visible={visible} onDismiss={close} contentContainerStyle={styles.modal}>
                <ScrollView>
                    <Text variant="titleLarge" style={{ marginBottom: 4 }}>
                        {t("manual.title")}
                    </Text>
                    <Text variant="bodyMedium" style={styles.hint}>
                        {t("manual.hint")}
                    </Text>

                    <Text variant="labelLarge" style={styles.sectionLabel}>
                        {t("manual.cycle", { total: totalCycles })}
                    </Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                        <View style={styles.cycleRow}>
                            {cycles.map((c) => (
                                <TouchableOpacity
                                    key={c}
                                    style={[
                                        styles.cyclePill,
                                        completedCycles.has(c) && styles.cyclePillDone,
                                        cycle === c && styles.cyclePillSelected,
                                    ]}
                                    activeOpacity={0.8}
                                    onPress={() => setCycle(c)}>
                                    <Text style={[styles.cyclePillText, completedCycles.has(c) && styles.cyclePillTextLight]}>
                                        {c}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </ScrollView>
                    {completedCycles.has(cycle) && (
                        <Text variant="bodySmall" style={{ color: "#666", marginBottom: 8 }}>
                            {t("manual.alreadyCompleted")}
                        </Text>
                    )}

                    <Text variant="labelLarge" style={styles.sectionLabel}>
                        {t("kiosk.whoFinished")}
                    </Text>
                    <EmployeePicker employees={employees} selected={employee} onSelect={setEmployee} />

                    <Text variant="labelLarge" style={[styles.sectionLabel, { marginTop: 16 }]}>
                        {t("kiosk.status")}
                    </Text>
                    {STATUS_OPTIONS.map((opt) => (
                        <TouchableOpacity
                            key={opt.value}
                            style={[styles.statusOption, status === opt.value && styles.statusOptionSelected]}
                            activeOpacity={0.7}
                            onPress={() => setStatus(opt.value)}>
                            <Ionicons name={opt.icon} size={22} color={status === opt.value ? "#ff5100" : "#909090"} />
                            <Text style={[styles.statusOptionText, status === opt.value && styles.statusOptionTextSelected]}>
                                {t(opt.label)}
                            </Text>
                        </TouchableOpacity>
                    ))}

                    {error && <Text style={{ color: "#c62828", marginTop: 8 }}>{error}</Text>}
                    <TouchableOpacity
                        style={[styles.confirmBtn, !canSubmit && styles.confirmBtnDisabled]}
                        activeOpacity={0.8}
                        disabled={!canSubmit}
                        onPress={() => submit.mutate()}>
                        {submit.isPending ?
                            <ActivityIndicator size="small" color="#fff" />
                        :   <Text style={styles.confirmBtnText}>{t("manual.confirm", { cycle })}</Text>}
                    </TouchableOpacity>
                </ScrollView>
            </Modal>
        </Portal>
    );
}

const styles = StyleSheet.create({
    modal: { backgroundColor: "#fff", marginHorizontal: 24, borderRadius: 16, padding: 24, maxHeight: "90%" },
    hint: { color: "#666", marginBottom: 12 },
    sectionLabel: { marginBottom: 6, color: "#333" },
    cycleRow: { flexDirection: "row", gap: 8 },
    cyclePill: {
        width: 40,
        height: 40,
        borderRadius: 20,
        borderWidth: 1.5,
        borderColor: "#ddd",
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#fff",
    },
    cyclePillDone: { backgroundColor: "#909090", borderColor: "#909090" },
    cyclePillSelected: { borderColor: "#ff5100", borderWidth: 3 },
    cyclePillText: { fontWeight: "700", color: "#333" },
    cyclePillTextLight: { color: "#fff" },
    statusOption: {
        flexDirection: "row",
        alignItems: "center",
        borderWidth: 1,
        borderColor: "#eee",
        borderRadius: 8,
        padding: 14,
        marginBottom: 8,
    },
    statusOptionSelected: { borderColor: "#ff5100", backgroundColor: "#ffefe6" },
    statusOptionText: { marginLeft: 12, fontSize: 15, color: "#333" },
    statusOptionTextSelected: { color: "#ff5100", fontWeight: "600" },
    confirmBtn: {
        backgroundColor: "#ff5100",
        borderRadius: 10,
        paddingVertical: 16,
        alignItems: "center",
        marginTop: 16,
    },
    confirmBtnDisabled: { backgroundColor: "#f0c4a8" },
    confirmBtnText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
});
