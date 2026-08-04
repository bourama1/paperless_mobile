import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from "react-native";
import { Text, Portal, Modal, Menu, Divider, Snackbar } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import apiClient from "../src/api/client";
import socket from "../src/services/socket";
import { Workstation, WorkstationOrder } from "../src/types";
import { t } from "../src/i18n";

interface OrderUpdatePayload {
    order: WorkstationOrder;
    cycleIndex: number;
    totalCycles: number;
    _id: string;
    datetime: string;
    action: "STARTED" | "FINISHED";
}

interface Employee {
    id: number;
    name: string;
}

type CompletionStatus = "complete" | "missing_product" | "shipped_incomplete";
type KioskMode = "completion" | "status";

const STATUS_OPTIONS: { value: CompletionStatus; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { value: "complete", label: "kiosk.statusComplete", icon: "checkmark-circle" },
    { value: "missing_product", label: "kiosk.statusMissing", icon: "time" },
    { value: "shipped_incomplete", label: "kiosk.statusIncomplete", icon: "alert-circle" },
];

export default function KioskScreen() {
    const router = useRouter();
    const [mode, setMode] = useState<KioskMode | null>(null);
    const [selection, setSelection] = useState<string | null>(null);

    // Completion mode filters FINISHED events, which only ever carry
    // order.workplace (a work-TYPE string like "Hardware") — never a
    // physical station name. So Completion mode picks from that list...
    const {
        data: workplaces,
        isLoading: workplacesLoading,
        refetch: refetchWorkplaces,
    } = useQuery<string[]>({
        queryKey: ["workplaces"],
        queryFn: async () => {
            const response = await apiClient.get("/workstations/workplaces");
            return response.data;
        },
        enabled: mode === "completion" && selection === null,
    });

    // ...while Status mode shows a physical station's current order, so it
    // picks from the polling feed's actual station names (e.g. "WS_5").
    const {
        data: workstations,
        isLoading: workstationsLoading,
        refetch: refetchWorkstations,
    } = useQuery<Workstation[]>({
        queryKey: ["workstations"],
        queryFn: async () => {
            const response = await apiClient.get("/workstations");
            return response.data;
        },
        enabled: mode === "status" && selection === null,
    });

    // Keep the tablet's screen awake for as long as this screen is mounted,
    // regardless of which mode/selection is active.
    useEffect(() => {
        activateKeepAwakeAsync();
        return () => {
            deactivateKeepAwake();
        };
    }, []);

    const reset = useCallback(() => {
        setMode(null);
        setSelection(null);
    }, []);

    // ── 1. mode picker ───────────────────────────────────────────────────────
    if (!mode) {
        return (
            <View style={styles.container}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={22} color="#ff5100" />
                    <Text style={styles.backBtnText}>{t("kiosk.back")}</Text>
                </TouchableOpacity>
                <Text variant="headlineSmall" style={styles.pickerTitle}>
                    {t("kiosk.pickMode")}
                </Text>
                <View style={styles.modeList}>
                    <TouchableOpacity
                        style={styles.modeCard}
                        activeOpacity={0.7}
                        onPress={() => setMode("completion")}>
                        <Ionicons name="checkmark-done-circle-outline" size={40} color="#ff5100" />
                        <Text style={styles.modeCardTitle}>{t("kiosk.modeCompletion")}</Text>
                        <Text style={styles.modeCardHint}>{t("kiosk.modeCompletionHint")}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.modeCard} activeOpacity={0.7} onPress={() => setMode("status")}>
                        <Ionicons name="grid-outline" size={40} color="#ff5100" />
                        <Text style={styles.modeCardTitle}>{t("kiosk.modeStatus")}</Text>
                        <Text style={styles.modeCardHint}>{t("kiosk.modeStatusHint")}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    // ── 2. selection picker (workplace type, or physical station) ───────────
    if (!selection) {
        const isCompletion = mode === "completion";
        const loading = isCompletion ? workplacesLoading : workstationsLoading;
        const refetch = isCompletion ? refetchWorkplaces : refetchWorkstations;
        const items: { key: string; label: string }[] =
            isCompletion ?
                (workplaces ?? []).map((w) => ({ key: w, label: w }))
            :   (workstations ?? []).map((w) => ({ key: String(w.id), label: w.name }));

        return (
            <View style={styles.container}>
                <TouchableOpacity onPress={() => setMode(null)} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={22} color="#ff5100" />
                    <Text style={styles.backBtnText}>{t("kiosk.changeMode")}</Text>
                </TouchableOpacity>
                <Text variant="headlineSmall" style={styles.pickerTitle}>
                    {isCompletion ? t("kiosk.pickWorkplace") : t("kiosk.pickWorkstation")}
                </Text>
                {loading ?
                    <ActivityIndicator size="large" style={{ marginTop: 40 }} />
                : items.length === 0 ?
                    <View style={styles.center}>
                        <Text variant="bodyMedium" style={{ color: "#909090" }}>
                            {isCompletion ? t("kiosk.noWorkplaces") : t("kiosk.noWorkstations")}
                        </Text>
                    </View>
                :   <FlatList
                        data={items}
                        keyExtractor={(item) => item.key}
                        contentContainerStyle={styles.list}
                        refreshing={loading}
                        onRefresh={refetch}
                        renderItem={({ item }) => (
                            <TouchableOpacity
                                style={styles.workstationCard}
                                activeOpacity={0.7}
                                onPress={() => setSelection(item.label)}>
                                <Text style={styles.workstationCardText}>{item.label}</Text>
                                <Ionicons name="chevron-forward" size={22} color="#ccc" />
                            </TouchableOpacity>
                        )}
                    />
                }
            </View>
        );
    }

    // ── 3. the actual kiosk ──────────────────────────────────────────────────
    return mode === "completion" ?
            <CompletionKiosk workstation={selection} onChangeWorkstation={reset} />
        :   <StatusKiosk workstation={selection} onChangeWorkstation={reset} />;
}

// ============================================================================
// Completion kiosk — reacts to FINISHED cycles for a given work-TYPE
// (e.g. "Hardware"), asks who finished it and whether it's complete /
// missing a product / shipping incomplete. Intended for the LAST
// workstation in a production line.
// ============================================================================

function CompletionKiosk({
    workstation,
    onChangeWorkstation,
}: {
    workstation: string;
    onChangeWorkstation: () => void;
}) {
    const [pending, setPending] = useState<OrderUpdatePayload[]>([]);
    const [employeeMenuVisible, setEmployeeMenuVisible] = useState(false);
    const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
    const [selectedStatus, setSelectedStatus] = useState<CompletionStatus | null>(null);
    const [connected, setConnected] = useState(socket.connected);
    const [snackbar, setSnackbar] = useState({ visible: false, message: "" });

    const workstationRef = useRef(workstation);
    workstationRef.current = workstation;

    const current = pending[0] ?? null;

    const { data: employees } = useQuery<Employee[]>({
        queryKey: ["employees"],
        queryFn: async () => {
            const response = await apiClient.get("/employees");
            return response.data;
        },
    });

    useEffect(() => {
        const onConnect = () => setConnected(true);
        const onDisconnect = () => setConnected(false);
        socket.on("connect", onConnect);
        socket.on("disconnect", onDisconnect);
        return () => {
            socket.off("connect", onConnect);
            socket.off("disconnect", onDisconnect);
        };
    }, []);

    useEffect(() => {
        const onOrderUpdate = (update: OrderUpdatePayload) => {
            if (update.action !== "FINISHED") return;
            if (update.order.workplace !== workstationRef.current) return;
            setPending((prev) => [...prev, update]);
        };
        socket.on("workstation-order-update", onOrderUpdate);
        return () => {
            socket.off("workstation-order-update", onOrderUpdate);
        };
    }, []);

    const submitCompletion = useMutation({
        mutationFn: async () => {
            if (!current || !selectedEmployee || !selectedStatus) return;
            await apiClient.post("/workstations/order-completion", {
                orderId: current.order._id,
                workstation: current.order.workplace,
                cycleIndex: current.cycleIndex,
                totalCycles: current.totalCycles,
                productOrder: current.order.productOrder,
                projectNumber: current.order.projectNumber,
                position: current.order.position,
                salesOrder: current.order.salesOrder,
                employeeName: selectedEmployee,
                status: selectedStatus,
            });
        },
        onSuccess: () => {
            setPending((prev) => prev.slice(1));
            setSelectedEmployee(null);
            setSelectedStatus(null);
        },
        onError: () => {
            setSnackbar({ visible: true, message: t("kiosk.submitError") });
        },
    });

    return (
        <View style={styles.container}>
            <View style={styles.idleHeader}>
                <TouchableOpacity onPress={onChangeWorkstation} style={styles.backBtn}>
                    <Ionicons name="swap-horizontal" size={20} color="#ff5100" />
                    <Text style={styles.backBtnText}>{t("kiosk.changeWorkstation")}</Text>
                </TouchableOpacity>
                <View style={styles.connectionBadge}>
                    <View style={[styles.dot, { backgroundColor: connected ? "#2e7d32" : "#c62828" }]} />
                    <Text style={styles.connectionText}>
                        {connected ? t("kiosk.connected") : t("kiosk.disconnected")}
                    </Text>
                </View>
            </View>

            <View style={styles.idleBody}>
                <Ionicons name="checkmark-done-circle-outline" size={72} color="#e0e0e0" />
                <Text variant="headlineMedium" style={styles.idleWorkstation}>
                    {workstation}
                </Text>
                <Text variant="bodyLarge" style={styles.idleHint}>
                    {t("kiosk.waiting")}
                </Text>
            </View>

            <Portal>
                <Modal visible={!!current} dismissable={false} contentContainerStyle={styles.modal}>
                    {current && (
                        <>
                            <Text variant="titleLarge" style={{ marginBottom: 4 }}>
                                {t("kiosk.orderFinished")}
                            </Text>
                            <Text variant="bodyMedium" style={styles.orderMeta}>
                                {t("kiosk.orderMeta", {
                                    productOrder: current.order.productOrder,
                                    position: current.order.position,
                                    cycle: current.cycleIndex,
                                    total: current.totalCycles,
                                })}
                            </Text>
                            <Text variant="bodyMedium" style={styles.orderMeta}>
                                {current.order.customerDesc} — {current.order.productDesc}
                            </Text>

                            <Divider style={{ marginVertical: 16 }} />

                            <Text variant="labelLarge" style={styles.sectionLabel}>
                                {t("kiosk.whoFinished")}
                            </Text>
                            <Menu
                                visible={employeeMenuVisible}
                                onDismiss={() => setEmployeeMenuVisible(false)}
                                anchor={
                                    <TouchableOpacity
                                        style={styles.dropdown}
                                        onPress={() => setEmployeeMenuVisible(true)}>
                                        <Text
                                            style={selectedEmployee ? styles.dropdownText : styles.dropdownPlaceholder}>
                                            {selectedEmployee ?? t("kiosk.selectEmployee")}
                                        </Text>
                                        <Ionicons name="chevron-down" size={18} color="#909090" />
                                    </TouchableOpacity>
                                }>
                                {(employees ?? []).map((emp) => (
                                    <Menu.Item
                                        key={emp.id}
                                        title={emp.name}
                                        onPress={() => {
                                            setSelectedEmployee(emp.name);
                                            setEmployeeMenuVisible(false);
                                        }}
                                    />
                                ))}
                                {(employees ?? []).length === 0 && <Menu.Item title={t("kiosk.noEmployees")} disabled />}
                            </Menu>

                            <Text variant="labelLarge" style={[styles.sectionLabel, { marginTop: 16 }]}>
                                {t("kiosk.status")}
                            </Text>
                            {STATUS_OPTIONS.map((opt) => (
                                <TouchableOpacity
                                    key={opt.value}
                                    style={[
                                        styles.statusOption,
                                        selectedStatus === opt.value && styles.statusOptionSelected,
                                    ]}
                                    activeOpacity={0.7}
                                    onPress={() => setSelectedStatus(opt.value)}>
                                    <Ionicons
                                        name={opt.icon}
                                        size={22}
                                        color={selectedStatus === opt.value ? "#ff5100" : "#909090"}
                                    />
                                    <Text
                                        style={[
                                            styles.statusOptionText,
                                            selectedStatus === opt.value && styles.statusOptionTextSelected,
                                        ]}>
                                        {t(opt.label)}
                                    </Text>
                                </TouchableOpacity>
                            ))}

                            <TouchableOpacity
                                style={[
                                    styles.confirmBtn,
                                    (!selectedEmployee || !selectedStatus || submitCompletion.isPending) &&
                                        styles.confirmBtnDisabled,
                                ]}
                                activeOpacity={0.8}
                                disabled={!selectedEmployee || !selectedStatus || submitCompletion.isPending}
                                onPress={() => submitCompletion.mutate()}>
                                {submitCompletion.isPending ?
                                    <ActivityIndicator size="small" color="#fff" />
                                :   <Text style={styles.confirmBtnText}>{t("kiosk.confirm")}</Text>}
                            </TouchableOpacity>

                            {pending.length > 1 && (
                                <Text style={styles.queueHint}>
                                    {t("kiosk.queueHint", { count: pending.length - 1 })}
                                </Text>
                            )}
                        </>
                    )}
                </Modal>
            </Portal>

            <Snackbar visible={snackbar.visible} onDismiss={() => setSnackbar({ ...snackbar, visible: false })}>
                {snackbar.message}
            </Snackbar>
        </View>
    );
}

// ============================================================================
// Status kiosk — just shows what's currently running at this workstation
// (like a single card from the main Workstations tab), live-updated, with
// tap-to-open. Intended for any non-final workstation in the line.
// ============================================================================

function StatusKiosk({ workstation, onChangeWorkstation }: { workstation: string; onChangeWorkstation: () => void }) {
    const router = useRouter();
    const [connected, setConnected] = useState(socket.connected);
    const [snackbar, setSnackbar] = useState({ visible: false, message: "" });

    const { data: workstations, refetch } = useQuery<Workstation[]>({
        queryKey: ["workstations"],
        queryFn: async () => {
            const response = await apiClient.get("/workstations");
            return response.data;
        },
        refetchInterval: 15000, // fallback in case the socket ever drops
    });

    const current = workstations?.find((w) => w.name === workstation) ?? null;

    useEffect(() => {
        const onConnect = () => setConnected(true);
        const onDisconnect = () => setConnected(false);
        socket.on("connect", onConnect);
        socket.on("disconnect", onDisconnect);
        return () => {
            socket.off("connect", onConnect);
            socket.off("disconnect", onDisconnect);
        };
    }, []);

    // Live-refresh the instant either the poll picks up a change, or an
    // order-update (STARTED/FINISHED) arrives — the latter is what
    // actually carries cycle_index/total_cycles, so listening only to the
    // poll event would leave cycle progress stale until the next poll tick.
    useEffect(() => {
        const onUpdate = () => refetch();
        socket.on("workstations-updated", onUpdate);
        socket.on("workstation-order-update", onUpdate);
        return () => {
            socket.off("workstations-updated", onUpdate);
            socket.off("workstation-order-update", onUpdate);
        };
    }, [refetch]);

    const openOrder = useMutation({
        mutationFn: async () => {
            if (!current?.current_order_data) return;
            const order = current.current_order_data;
            const response = await apiClient.post("/workstations/import-pbom", {
                projectNumber: order.projectNumber || order.salesOrder,
                position: order.position,
                customer: order.customer,
                productOrder: order.productOrder,
                productDesc: order.productDesc,
                workplace: order.workplace,
            });
            return response.data;
        },
        onSuccess: (doc) => {
            if (!doc) return;
            const rev = doc.revisions?.[0];
            router.push({
                pathname: `/document/${doc.id}`,
                params: {
                    filename: rev?.filename || "",
                    version: rev?.version || 1,
                    annotations: rev?.annotations || "",
                },
            });
        },
        onError: (error: any) => {
            const msg = error?.response?.data?.error || error.message;
            setSnackbar({ visible: true, message: t("search.errorPrefix", { msg }) });
        },
    });

    return (
        <View style={styles.container}>
            <View style={styles.idleHeader}>
                <TouchableOpacity onPress={onChangeWorkstation} style={styles.backBtn}>
                    <Ionicons name="swap-horizontal" size={20} color="#ff5100" />
                    <Text style={styles.backBtnText}>{t("kiosk.changeWorkstation")}</Text>
                </TouchableOpacity>
                <View style={styles.connectionBadge}>
                    <View style={[styles.dot, { backgroundColor: connected ? "#2e7d32" : "#c62828" }]} />
                    <Text style={styles.connectionText}>
                        {connected ? t("kiosk.connected") : t("kiosk.disconnected")}
                    </Text>
                </View>
            </View>

            <View style={styles.statusBody}>
                <Text variant="headlineMedium" style={styles.idleWorkstation}>
                    {workstation}
                </Text>

                {current?.current_order_data ?
                    <TouchableOpacity
                        style={styles.statusCard}
                        activeOpacity={0.8}
                        disabled={openOrder.isPending}
                        onPress={() => openOrder.mutate()}>
                        <View style={styles.statusCardHeader}>
                            <Text variant="titleLarge" style={{ fontWeight: "bold" }}>
                                {current.current_order_data.productOrder}
                            </Text>
                            {openOrder.isPending ?
                                <ActivityIndicator size="small" />
                            :   <Ionicons name="open-outline" size={26} color="#ff5100" />}
                        </View>
                        <Text variant="bodyLarge" style={styles.orderMeta}>
                            {current.current_order_data.customerDesc}
                        </Text>
                        <Text variant="bodyMedium" style={styles.orderMeta}>
                            {current.current_order_data.productDesc}
                        </Text>
                        <Divider style={{ marginVertical: 12 }} />
                        <View style={styles.statusCardRow}>
                            <Text style={styles.label}>{t("workstations.label.project")}</Text>
                            <Text style={styles.value}>{current.current_order_data.projectNumber}</Text>
                        </View>
                        <View style={styles.statusCardRow}>
                            <Text style={styles.label}>{t("workstations.label.position")}</Text>
                            <Text style={styles.value}>{current.current_order_data.position}</Text>
                        </View>
                        <View style={styles.statusCardRow}>
                            <Text style={styles.label}>{t("workstations.label.cycle")}</Text>
                            <Text style={styles.value}>
                                {t("workstations.cycleValue", {
                                    current: current.cycle_index ?? 1,
                                    total: current.total_cycles ?? 1,
                                })}
                            </Text>
                        </View>
                        <Text style={styles.tapHint}>{t("kiosk.tapToOpen")}</Text>
                    </TouchableOpacity>
                :   <View style={styles.idleBody}>
                        <Ionicons name="cube-outline" size={72} color="#e0e0e0" />
                        <Text variant="bodyLarge" style={styles.idleHint}>
                            {t("workstations.noOrder")}
                        </Text>
                    </View>
                }
            </View>

            <Snackbar visible={snackbar.visible} onDismiss={() => setSnackbar({ ...snackbar, visible: false })}>
                {snackbar.message}
            </Snackbar>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#fff" },
    center: { flex: 1, justifyContent: "center", alignItems: "center" },
    backBtn: { flexDirection: "row", alignItems: "center", padding: 16 },
    backBtnText: { color: "#ff5100", fontWeight: "600", marginLeft: 6 },
    pickerTitle: { paddingHorizontal: 16, fontWeight: "bold" },
    list: { padding: 16 },
    workstationCard: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        padding: 20,
        borderWidth: 1,
        borderColor: "#eee",
        borderRadius: 12,
        marginBottom: 12,
    },
    workstationCardText: { fontSize: 18, fontWeight: "600" },
    modeList: { flexDirection: "row", padding: 16, gap: 16, flexWrap: "wrap" },
    modeCard: {
        flex: 1,
        minWidth: 200,
        borderWidth: 1,
        borderColor: "#eee",
        borderRadius: 16,
        padding: 24,
        alignItems: "center",
    },
    modeCardTitle: { fontSize: 17, fontWeight: "bold", marginTop: 12, textAlign: "center" },
    modeCardHint: { fontSize: 13, color: "#909090", marginTop: 6, textAlign: "center" },
    idleHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: 4,
    },
    connectionBadge: { flexDirection: "row", alignItems: "center", marginRight: 16 },
    dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
    connectionText: { fontSize: 13, color: "#909090" },
    idleBody: { flex: 1, justifyContent: "center", alignItems: "center" },
    idleWorkstation: { marginTop: 20, fontWeight: "bold", textAlign: "center" },
    idleHint: { marginTop: 8, color: "#909090" },
    statusBody: { flex: 1, padding: 20 },
    statusCard: {
        marginTop: 24,
        borderWidth: 1,
        borderColor: "#eee",
        borderRadius: 16,
        padding: 20,
    },
    statusCardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    statusCardRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
    label: { color: "#909090", fontSize: 14 },
    value: { fontSize: 14, fontWeight: "600" },
    tapHint: { textAlign: "center", color: "#ff5100", marginTop: 12, fontSize: 13, fontWeight: "600" },
    modal: {
        backgroundColor: "#fff",
        marginHorizontal: 24,
        borderRadius: 16,
        padding: 24,
        maxHeight: "85%",
    },
    orderMeta: { color: "#666", marginTop: 2 },
    sectionLabel: { color: "#909090", marginBottom: 8 },
    dropdown: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        borderWidth: 1,
        borderColor: "#ddd",
        borderRadius: 8,
        paddingHorizontal: 14,
        paddingVertical: 12,
    },
    dropdownText: { fontSize: 16 },
    dropdownPlaceholder: { fontSize: 16, color: "#aaa" },
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
    queueHint: { textAlign: "center", color: "#909090", marginTop: 12, fontSize: 13 },
});
