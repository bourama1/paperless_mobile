import React, { useState } from "react";
import { View, StyleSheet, ActivityIndicator, TouchableOpacity, ScrollView } from "react-native";
import { Portal, Modal, Text, TextInput } from "react-native-paper";
import { useMutation } from "@tanstack/react-query";
import apiClient from "../api/client";
import { t } from "../i18n";
import { CheckStatus, QcCycleCheck } from "../types";

interface QcCheckModalProps {
    visible: boolean;
    onDismiss: () => void;
    /** Called after a successful sign-off, with the engineer's name. */
    onDone: (engineerName: string) => void;
    projectNumber: string;
    position: string;
    workstation: string;
    totalCycles: number;
    cycles: QcCycleCheck[];
}

/**
 * Quality-control sign-off for one cycle, by a quality engineer. Step 1:
 * the engineer enters their personal PIN, which says who they are (and is
 * checked right away, so a wrong PIN never reaches step 2). Step 2: pick a
 * cycle, OK/Problem, optional note. The PIN only lives in this component's
 * state for the duration of one sign-off and is sent as a header, never in
 * a request body (bodies are logged server-side) or a URL.
 */
export default function QcCheckModal({
    visible,
    onDismiss,
    onDone,
    projectNumber,
    position,
    workstation,
    totalCycles,
    cycles,
}: QcCheckModalProps) {
    const [pin, setPin] = useState("");
    const [engineerName, setEngineerName] = useState<string | null>(null);
    const [pinError, setPinError] = useState<string | null>(null);
    const [selectedCycle, setSelectedCycle] = useState<number | null>(null);
    const [statusChoice, setStatusChoice] = useState<CheckStatus>("ok");
    const [note, setNote] = useState("");
    const [submitError, setSubmitError] = useState<string | null>(null);

    const reset = () => {
        setPin("");
        setEngineerName(null);
        setPinError(null);
        setSelectedCycle(null);
        setStatusChoice("ok");
        setNote("");
        setSubmitError(null);
    };
    const close = () => {
        reset();
        onDismiss();
    };

    const verifyPin = useMutation({
        mutationFn: async () =>
            (await apiClient.post("/workstations/qc-check/verify", {}, { headers: { "X-QC-Pin": pin } })).data as {
                name: string;
            },
        onSuccess: (engineer) => {
            setPinError(null);
            setEngineerName(engineer.name);
            // Default to the first cycle without an OK sign-off yet.
            const firstOpen = cycles.find((c) => !c.checked);
            setSelectedCycle(firstOpen?.cycleIndex ?? cycles[0]?.cycleIndex ?? null);
        },
        onError: (error: any) => {
            const status = error?.response?.status;
            setPinError(
                status === 401 ? t("qc.pinWrong")
                : status === 429 ? t("qc.pinLocked")
                : t("qc.pinError"),
            );
        },
    });

    const submit = useMutation({
        mutationFn: async () => {
            await apiClient.post(
                "/workstations/order-qc-check",
                {
                    projectNumber,
                    position,
                    workstation,
                    cycleIndex: selectedCycle,
                    totalCycles,
                    status: statusChoice,
                    note: note.trim() || undefined,
                },
                { headers: { "X-QC-Pin": pin } },
            );
        },
        onSuccess: () => {
            const name = engineerName ?? "";
            reset();
            onDone(name);
        },
        onError: (error: any) => {
            setSubmitError(error?.response?.data?.error || error.message);
        },
    });

    const selected = cycles.find((c) => c.cycleIndex === selectedCycle);
    const checkedCount = cycles.filter((c) => c.checked).length;

    return (
        <Portal>
            <Modal visible={visible} onDismiss={close} contentContainerStyle={styles.modal}>
                <Text variant="titleLarge" style={{ marginBottom: 4 }}>
                    {t("qc.title")}
                </Text>

                {!engineerName ?
                    <>
                        <Text variant="bodyMedium" style={styles.hint}>
                            {t("qc.pinHint")}
                        </Text>
                        <TextInput
                            mode="outlined"
                            value={pin}
                            onChangeText={setPin}
                            secureTextEntry
                            keyboardType="number-pad"
                            autoFocus
                            onSubmitEditing={() => pin && verifyPin.mutate()}
                        />
                        {pinError && <Text style={styles.error}>{pinError}</Text>}
                        <TouchableOpacity
                            style={[styles.confirmBtn, (!pin || verifyPin.isPending) && styles.confirmBtnDisabled]}
                            activeOpacity={0.8}
                            disabled={!pin || verifyPin.isPending}
                            onPress={() => verifyPin.mutate()}>
                            {verifyPin.isPending ?
                                <ActivityIndicator size="small" color="#fff" />
                            :   <Text style={styles.confirmBtnText}>{t("qc.continue")}</Text>}
                        </TouchableOpacity>
                    </>
                :   <>
                        <Text variant="bodyMedium" style={styles.hint}>
                            {t("qc.signedInAs", { name: engineerName })}
                        </Text>

                        <Text variant="labelLarge" style={{ marginBottom: 6, color: "#333" }}>
                            {t("qc.cycleLabel", { checked: checkedCount, total: totalCycles })}
                        </Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                            <View style={styles.cycleRow}>
                                {cycles.map((cycle) => (
                                    <TouchableOpacity
                                        key={cycle.cycleIndex}
                                        style={[
                                            styles.cyclePill,
                                            cycle.checked && styles.cyclePillChecked,
                                            cycle.status === "issue" && styles.cyclePillIssue,
                                            selectedCycle === cycle.cycleIndex && styles.cyclePillSelected,
                                        ]}
                                        activeOpacity={0.8}
                                        onPress={() => setSelectedCycle(cycle.cycleIndex)}>
                                        <Text
                                            style={[
                                                styles.cyclePillText,
                                                (cycle.checked || cycle.status === "issue") && styles.cyclePillTextLight,
                                            ]}>
                                            {cycle.cycleIndex}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </ScrollView>
                        {selected?.checkedAt ?
                            <Text variant="bodySmall" style={{ color: "#666", marginBottom: 12 }}>
                                {t(selected.status === "ok" ? "qc.lastOk" : "qc.lastIssue", {
                                    name: selected.engineerName ?? "",
                                })}
                                {selected.note ? ` — ${selected.note}` : ""}
                            </Text>
                        :   null}

                        <View style={styles.statusToggleRow}>
                            <TouchableOpacity
                                style={[styles.statusToggleBtn, statusChoice === "ok" && styles.statusToggleBtnOkActive]}
                                activeOpacity={0.8}
                                onPress={() => setStatusChoice("ok")}>
                                <Text style={[styles.statusToggleText, statusChoice === "ok" && styles.statusToggleTextActive]}>
                                    {t("document.checkStatusOk")}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[
                                    styles.statusToggleBtn,
                                    statusChoice === "issue" && styles.statusToggleBtnIssueActive,
                                ]}
                                activeOpacity={0.8}
                                onPress={() => setStatusChoice("issue")}>
                                <Text
                                    style={[styles.statusToggleText, statusChoice === "issue" && styles.statusToggleTextActive]}>
                                    {t("document.checkStatusIssue")}
                                </Text>
                            </TouchableOpacity>
                        </View>

                        <TextInput
                            mode="outlined"
                            placeholder={t("document.checkNotePlaceholder")}
                            value={note}
                            onChangeText={setNote}
                            multiline
                            style={{ marginBottom: 16 }}
                        />
                        {submitError && <Text style={[styles.error, { marginBottom: 8 }]}>{submitError}</Text>}
                        <TouchableOpacity
                            style={[
                                styles.confirmBtn,
                                statusChoice === "issue" && styles.confirmBtnIssue,
                                (!selectedCycle || submit.isPending) && styles.confirmBtnDisabled,
                            ]}
                            activeOpacity={0.8}
                            disabled={!selectedCycle || submit.isPending}
                            onPress={() => submit.mutate()}>
                            {submit.isPending ?
                                <ActivityIndicator size="small" color="#fff" />
                            :   <Text style={styles.confirmBtnText}>
                                    {t("qc.confirmCycle", { cycle: selectedCycle ?? "" })}
                                </Text>
                            }
                        </TouchableOpacity>
                    </>
                }
            </Modal>
        </Portal>
    );
}

const styles = StyleSheet.create({
    modal: { backgroundColor: "#fff", marginHorizontal: 24, borderRadius: 16, padding: 24 },
    hint: { color: "#666", marginBottom: 12 },
    error: { color: "#c62828", marginTop: 8 },
    confirmBtn: {
        backgroundColor: "#6a1b9a",
        borderRadius: 10,
        paddingVertical: 16,
        alignItems: "center",
        marginTop: 16,
    },
    confirmBtnDisabled: { backgroundColor: "#cdb5dc" },
    confirmBtnIssue: { backgroundColor: "#c62828" },
    confirmBtnText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
    statusToggleRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
    statusToggleBtn: {
        flex: 1,
        borderWidth: 1,
        borderColor: "#ddd",
        borderRadius: 8,
        paddingVertical: 12,
        alignItems: "center",
    },
    statusToggleBtnOkActive: { backgroundColor: "#2e7d32", borderColor: "#2e7d32" },
    statusToggleBtnIssueActive: { backgroundColor: "#c62828", borderColor: "#c62828" },
    statusToggleText: { fontWeight: "600", color: "#333" },
    statusToggleTextActive: { color: "#fff" },
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
    cyclePillChecked: { backgroundColor: "#2e7d32", borderColor: "#2e7d32" },
    cyclePillIssue: { backgroundColor: "#c62828", borderColor: "#c62828" },
    cyclePillSelected: { borderColor: "#6a1b9a", borderWidth: 3 },
    cyclePillText: { fontWeight: "700", color: "#333" },
    cyclePillTextLight: { color: "#fff" },
});
