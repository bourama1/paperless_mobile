import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from "react-native";
import { Text, Portal, Modal, Divider, Snackbar } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import apiClient from "../src/api/client";
import socket from "../src/services/socket";
import { Workstation, WorkstationOrder } from "../src/types";
import { t } from "../src/i18n";
import LanguageSwitcher from "../src/components/LanguageSwitcher";
import { useEmployees } from "../src/hooks/useEmployees";
import EmployeePicker from "../src/components/EmployeePicker";

// Sentinel value used when Completion mode should accept FINISHED events for any
// workplace without showing or storing a human-visible workplace label.
const ANY_WORKPLACE = "__ANY__";

// Workplaces whose orders MUST trigger the finishing screen — but only on a
// tablet that is already set up as a completion kiosk (mode === "completion").
// When an order finishes at one of these, the kiosk force-switches to that
// workplace and pops the modal, even if it was showing another workplace's
// completion kiosk. Status kiosks and the mode picker are never hijacked.
const FORCED_FINISH_WORKPLACES = new Set(["Hardware", "Motor"]);

interface OrderUpdatePayload {
    order: WorkstationOrder;
    cycleIndex: number;
    totalCycles: number;
    _id: string;
    datetime: string;
    action: "STARTED" | "FINISHED";
}

// order_id + cycleIndex is the identity of a pending completion queue entry
// throughout CompletionKiosk — the same pair the backend matches on for
// order-completed and for the completion-queue backlog.
function pendingKey(u: OrderUpdatePayload): string {
    return `${u.order._id}::${u.cycleIndex}`;
}

// Merges incoming entries into the queue without duplicating one already
// present — needed because an entry can arrive from two independent
// sources (the live socket push and the completion-queue backlog fetch)
// for the same order/cycle.
function upsertPending(prev: OrderUpdatePayload[], incoming: OrderUpdatePayload[]): OrderUpdatePayload[] {
    const seen = new Set(prev.map(pendingKey));
    const merged = [...prev];
    for (const item of incoming) {
        const key = pendingKey(item);
        if (!seen.has(key)) {
            merged.push(item);
            seen.add(key);
        }
    }
    return merged;
}

function removePending(prev: OrderUpdatePayload[], orderId: string, cycleIndex: number): OrderUpdatePayload[] {
    return prev.filter((p) => !(p.order._id === orderId && p.cycleIndex === cycleIndex));
}

type CompletionStatus = "complete" | "complete_with_changes" | "missing_product" | "shipped_incomplete";
type KioskMode = "completion" | "status";

const STATUS_OPTIONS: { value: CompletionStatus; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { value: "complete", label: "kiosk.statusComplete", icon: "checkmark-circle" },
    { value: "complete_with_changes", label: "kiosk.statusCompleteWithChanges", icon: "sync-outline" },
    { value: "missing_product", label: "kiosk.statusMissing", icon: "time" },
    { value: "shipped_incomplete", label: "kiosk.statusIncomplete", icon: "alert-circle" },
];

export default function KioskScreen() {
    const router = useRouter();
    const [mode, setMode] = useState<KioskMode | null>(null);
    const [selection, setSelection] = useState<string | null>(null);

    // FINISHED events for FORCED_FINISH_WORKPLACES land here (via the listener
    // below) so they survive the mode/selection switch and reach the
    // CompletionKiosk even though it mounts after the event was emitted.
    const [forcedFinishes, setForcedFinishes] = useState<OrderUpdatePayload[]>([]);

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

    // Force the finishing screen for the final workplaces — but only on a
    // tablet that is already set up as a completion kiosk. A status kiosk
    // (or the mode picker) is never hijacked: it stays on its own screen.
    // modeRef lets the socket listener read the current mode at event time
    // without re-registering on every mode change.
    const modeRef = useRef(mode);
    modeRef.current = mode;

    useEffect(() => {
        const onOrderUpdate = (update: OrderUpdatePayload) => {
            if (update.action !== "FINISHED") return;
            if (!FORCED_FINISH_WORKPLACES.has(update.order.workplace)) return;
            if (modeRef.current !== "completion") return;
            setMode("completion");
            setSelection(ANY_WORKPLACE);
            setForcedFinishes((prev) => [...prev, update]);
        };
        socket.on("workstation-order-update", onOrderUpdate);
        return () => {
            socket.off("workstation-order-update", onOrderUpdate);
        };
    }, []);

    const drainForcedFinishes = useCallback(() => setForcedFinishes([]), []);

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
                        onPress={() => {
                            // Default to finishing any workplace without requiring the user
                            // to pick a specific work-TYPE.
                            setMode("completion");
                            setSelection(ANY_WORKPLACE);
                        }}>
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
            <CompletionKiosk
                workstation={selection}
                forcedFinishes={forcedFinishes}
                onForcedFinishesDrained={drainForcedFinishes}
                onChangeWorkstation={reset}
            />
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
    forcedFinishes,
    onForcedFinishesDrained,
    onChangeWorkstation,
}: {
    workstation: string;
    forcedFinishes: OrderUpdatePayload[];
    onForcedFinishesDrained: () => void;
    onChangeWorkstation: () => void;
}) {
    const router = useRouter();
    const [pending, setPending] = useState<OrderUpdatePayload[]>([]);
    // Which entry of the queue is currently being viewed — lets the worker
    // browse with Prev/Next instead of only ever seeing the oldest one.
    const [viewIndex, setViewIndex] = useState(0);
    const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
    const [selectedStatus, setSelectedStatus] = useState<CompletionStatus | null>(null);
    const [connected, setConnected] = useState(socket.connected);
    const [snackbar, setSnackbar] = useState({ visible: false, message: "" });

    const workstationRef = useRef(workstation);
    workstationRef.current = workstation;

    // Clamped rather than reset on every change of `pending` — when an
    // entry ahead of viewIndex is removed (completed, or completed on
    // another tablet), whatever shifted into this slot is shown next,
    // instead of always jumping back to the first entry.
    const safeIndex = pending.length === 0 ? 0 : Math.min(viewIndex, pending.length - 1);
    const current = pending[safeIndex] ?? null;
    // Socket listeners below are registered once (empty deps, like the
    // existing workstationRef pattern) so they need a ref to read the
    // latest viewIndex rather than closing over a stale one.
    const viewIndexRef = useRef(safeIndex);
    viewIndexRef.current = safeIndex;
    // io.emit broadcasts order-completed to every connected tablet,
    // including whichever one just submitted the completion (it arrived
    // over plain HTTP, not that tablet's own socket connection, so the
    // server has no "sender" to exclude). If that broadcast round-trips
    // back here before our own request's response does, this ref lets
    // onOrderCompleted recognize "that's the thing I'm submitting myself"
    // and skip the "completed elsewhere" snackbar for it.
    const submittingRef = useRef<{ orderId: string; cycleIndex: number } | null>(null);

    const { data: employees } = useEmployees();

    // The durable backlog (see completionService.getCompletionQueue) —
    // fetched on mount so a tablet opening kiosk mode picks up anything
    // that finished while no tablet had it open, not just what arrives
    // live afterwards. Also gives us a manual refresh button for free.
    const workplaceParam = workstation !== ANY_WORKPLACE ? workstation : undefined;
    const {
        data: queueData,
        refetch: refetchQueue,
        isRefetching: isRefetchingQueue,
    } = useQuery<OrderUpdatePayload[]>({
        queryKey: ["completion-queue", workplaceParam],
        queryFn: async () => {
            const response = await apiClient.get("/workstations/completion-queue", {
                params: workplaceParam ? { workplace: workplaceParam } : {},
            });
            return response.data;
        },
    });

    useEffect(() => {
        if (!queueData) return;
        setPending((prev) => upsertPending(prev, queueData));
    }, [queueData]);

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
            // Hardware/Motor finishes are owned by KioskScreen's forced queue
            // (see FORCED_FINISH_WORKPLACES) — handling them here too would
            // double-add them to the pending queue.
            if (FORCED_FINISH_WORKPLACES.has(update.order.workplace)) return;
            if (workstationRef.current !== ANY_WORKPLACE && update.order.workplace !== workstationRef.current) return;
            setPending((prev) => upsertPending(prev, [update]));
        };
        socket.on("workstation-order-update", onOrderUpdate);
        return () => {
            socket.off("workstation-order-update", onOrderUpdate);
        };
    }, []);

    // Another kiosk tablet (a second physical location can run kiosk mode
    // at the same time) just completed this exact order/cycle — drop it
    // from our own queue too, so it can't be completed twice. Matched on
    // orderId + cycleIndex (not just orderId) so a still-pending cycle of
    // the same multi-cycle order isn't affected — applies to every
    // workstation, not just Motor, since Hardware batches can span cycles too.
    useEffect(() => {
        const onOrderCompleted = ({ orderId, cycleIndex }: { orderId: string; cycleIndex?: number }) => {
            setPending((prev) => {
                const idx = prev.findIndex((p) => p.order._id === orderId && p.cycleIndex === cycleIndex);
                if (idx === -1) return prev;
                const isOwnSubmission =
                    submittingRef.current?.orderId === orderId && submittingRef.current?.cycleIndex === cycleIndex;
                if (idx === viewIndexRef.current && !isOwnSubmission) {
                    setSelectedEmployee(null);
                    setSelectedStatus(null);
                    setSnackbar({ visible: true, message: t("kiosk.completedElsewhere") });
                }
                return prev.filter((_, i) => i !== idx);
            });
        };
        socket.on("order-completed", onOrderCompleted);
        return () => {
            socket.off("order-completed", onOrderCompleted);
        };
    }, []);

    // Drain forced finishes queued by KioskScreen into our pending queue.
    // They arrive after this kiosk mounts, so they can't go through the
    // socket listener above. The queue is cleared once merged so a later
    // remount of this kiosk doesn't re-show stale finishes.
    useEffect(() => {
        if (forcedFinishes.length === 0) return;
        setPending((prev) => upsertPending(prev, forcedFinishes));
        onForcedFinishesDrained();
    }, [forcedFinishes, onForcedFinishesDrained]);

    const submitCompletion = useMutation({
        // Takes the target item explicitly (rather than reading `current`
        // from closure) so that if the worker navigates to a different
        // queue entry with Prev/Next while this request is still in
        // flight, onSuccess below still removes the entry that was
        // actually submitted — not whatever happens to be `current` by
        // the time the response arrives.
        mutationFn: async (item: OrderUpdatePayload) => {
            if (!selectedEmployee || !selectedStatus) return;
            const res = await apiClient.post("/workstations/order-completion", {
                orderId: item.order._id,
                workstation: item.order.workplace,
                cycleIndex: item.cycleIndex,
                totalCycles: item.totalCycles,
                productOrder: item.order.productOrder,
                projectNumber: item.order.projectNumber,
                position: item.order.position,
                salesOrder: item.order.salesOrder,
                employeeName: selectedEmployee,
                status: selectedStatus,
                // Quantity for ERP closing: Motor orders can finish multiple
                // units at once (order.quantity > 1). Hardware and others
                // are always 1 per completion call.
                quantity: item.order.quantity ?? 1,
            });
            return { data: res.data, item };
        },
        onSuccess: (result) => {
            if (!result) return;
            const { data, item } = result;
            setPending((prev) => removePending(prev, item.order._id, item.cycleIndex));
            setSelectedEmployee(null);
            setSelectedStatus(null);

            // The backend only confirms the ERP close was QUEUED — it
            // doesn't wait for TOORS itself, so there's nothing more to
            // report here than "queued" or "couldn't even queue it".
            if (data?.toors) {
                if (data.toors.queued) {
                    setSnackbar({ visible: true, message: t("kiosk.toorsQueued") });
                } else if (data.toors.error) {
                    setSnackbar({
                        visible: true,
                        message: t("kiosk.toorsError", { error: data.toors.error }),
                    });
                }
            }
        },
        onError: () => {
            setSnackbar({ visible: true, message: t("kiosk.submitError") });
        },
    });

    submittingRef.current =
        submitCompletion.isPending && submitCompletion.variables
            ? {
                  orderId: submitCompletion.variables.order._id,
                  cycleIndex: submitCompletion.variables.cycleIndex,
              }
            : null;

    // Lets the operator open the order's document one last time from inside
    // the finishing modal, for a final edit/check before confirming — e.g.
    // fixing something they noticed while picking the completion status.
    // Uses the same import-pbom lookup the prep queue uses; navigating away
    // (router.push) keeps this screen mounted underneath, so the pending
    // queue and any employee/status selection already made aren't lost —
    // router.back() from the document viewer returns right to this modal.
    const openDocument = useMutation({
        mutationFn: async () => {
            if (!current) return;
            const response = await apiClient.post("/workstations/import-pbom", {
                projectNumber: current.order.projectNumber,
                position: current.order.position,
                workplace: current.order.workplace,
            });
            return response.data;
        },
        onSuccess: (doc: any) => {
            if (!doc) return;
            const latest = doc.revisions?.[0];
            router.push({
                pathname: `/document/${doc.id}`,
                params: {
                    filename: latest?.filename || doc.name || "",
                    version: latest?.version || 1,
                },
            });
        },
        onError: () => {
            setSnackbar({ visible: true, message: t("kiosk.openDocumentError") });
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
                <TouchableOpacity onPress={() => refetchQueue()} disabled={isRefetchingQueue} style={{ padding: 4 }}>
                    {isRefetchingQueue ?
                        <ActivityIndicator size="small" color="#ff5100" />
                    :   <Ionicons name="refresh" size={20} color="#ff5100" />}
                </TouchableOpacity>
                <LanguageSwitcher />
            </View>

            <View style={styles.idleBody}>
                <Ionicons name="checkmark-done-circle-outline" size={72} color="#e0e0e0" />
                <Text variant="headlineMedium" style={styles.idleWorkstation}>
                    {workstation !== ANY_WORKPLACE ? workstation : null}
                </Text>
                <Text variant="bodyLarge" style={styles.idleHint}>
                    {t("kiosk.waiting")}
                </Text>
            </View>

            <Portal>
                <Modal visible={!!current} dismissable={false} contentContainerStyle={styles.modal}>
                    {current && (
                        <>
                            <TouchableOpacity onPress={onChangeWorkstation} style={styles.modalBackBtn}>
                                <Ionicons name="arrow-back" size={18} color="#909090" />
                                <Text style={styles.modalBackBtnText}>{t("kiosk.changeWorkstation")}</Text>
                            </TouchableOpacity>
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
                                {t("kiosk.orderIdentifiers", {
                                    projectNumber: current.order.projectNumber,
                                    salesOrder: current.order.salesOrder,
                                })}
                            </Text>
                            <Text variant="bodyMedium" style={styles.orderMeta}>
                                {current.order.customerDesc} — {current.order.productDesc}
                            </Text>

                            <TouchableOpacity
                                style={styles.openDocBtn}
                                activeOpacity={0.7}
                                disabled={openDocument.isPending}
                                onPress={() => openDocument.mutate()}>
                                {openDocument.isPending ?
                                    <ActivityIndicator size="small" color="#ff5100" />
                                :   <Ionicons name="document-text-outline" size={18} color="#ff5100" />}
                                <Text style={styles.openDocBtnText}>{t("kiosk.openDocument")}</Text>
                            </TouchableOpacity>

                            <Divider style={{ marginVertical: 16 }} />

                            <Text variant="labelLarge" style={styles.sectionLabel}>
                                {t("kiosk.whoFinished")}
                            </Text>
                            <EmployeePicker
                                employees={employees}
                                selected={selectedEmployee}
                                onSelect={setSelectedEmployee}
                            />

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
                                onPress={() => submitCompletion.mutate(current)}>
                                {submitCompletion.isPending ?
                                    <ActivityIndicator size="small" color="#fff" />
                                :   <Text style={styles.confirmBtnText}>{t("kiosk.confirm")}</Text>}
                            </TouchableOpacity>

                            {pending.length > 1 && (
                                <View style={styles.queueNav}>
                                    <TouchableOpacity
                                        onPress={() => {
                                            setViewIndex((i) => Math.max(0, i - 1));
                                            setSelectedEmployee(null);
                                            setSelectedStatus(null);
                                        }}
                                        disabled={safeIndex === 0 || submitCompletion.isPending}
                                        style={styles.queueNavBtn}>
                                        <Ionicons
                                            name="chevron-back"
                                            size={22}
                                            color={safeIndex === 0 ? "#ccc" : "#ff5100"}
                                        />
                                    </TouchableOpacity>
                                    <Text style={styles.queueNavText}>
                                        {t("kiosk.queuePosition", { index: safeIndex + 1, total: pending.length })}
                                    </Text>
                                    <TouchableOpacity
                                        onPress={() => {
                                            setViewIndex((i) => Math.min(pending.length - 1, i + 1));
                                            setSelectedEmployee(null);
                                            setSelectedStatus(null);
                                        }}
                                        disabled={safeIndex === pending.length - 1 || submitCompletion.isPending}
                                        style={styles.queueNavBtn}>
                                        <Ionicons
                                            name="chevron-forward"
                                            size={22}
                                            color={safeIndex === pending.length - 1 ? "#ccc" : "#ff5100"}
                                        />
                                    </TouchableOpacity>
                                </View>
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
                <LanguageSwitcher />
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
                            <View>
                                <Text variant="bodySmall" style={styles.label}>
                                    {t("workstations.label.productOrder")}
                                </Text>
                                <Text variant="titleLarge" style={{ fontWeight: "bold" }}>
                                    {current.current_order_data.productOrder}
                                </Text>
                            </View>
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
    openDocBtn: {
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "flex-start",
        borderWidth: 1,
        borderColor: "#ff5100",
        borderRadius: 8,
        paddingVertical: 8,
        paddingHorizontal: 14,
        marginTop: 12,
        gap: 8,
    },
    openDocBtnText: { color: "#ff5100", fontWeight: "600" },
    sectionLabel: { color: "#909090", marginBottom: 8 },
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
    modalBackBtn: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
    modalBackBtnText: { color: "#909090", fontWeight: "600", marginLeft: 6 },
    queueNav: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        marginTop: 16,
    },
    queueNavBtn: { padding: 8 },
    queueNavText: { color: "#909090", fontSize: 13, minWidth: 80, textAlign: "center" },
});
