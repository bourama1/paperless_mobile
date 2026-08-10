import React, { useState, useMemo, useLayoutEffect } from "react";
import { FlatList, View, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Card, Text, Chip, Divider, Snackbar } from "react-native-paper";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigation, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import apiClient from "../../src/api/client";
import { t } from "../../src/i18n";

interface PrepQueueItem {
    id: number;
    workplace: string;
    sales_order: string | null;
    project_number: string;
    position: string;
    quantity: number;
    production_time: number | null;
    planned_date: string | null;
    plan_label: string | null;
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString("cs-CZ", {
        weekday: "short",
        day: "numeric",
        month: "numeric",
    });
}

function dateKey(iso: string): string {
    // Normalize to YYYY-MM-DD regardless of whether the API returned a bare
    // date or a full ISO timestamp for it.
    return iso.slice(0, 10);
}

export default function PrepQueueScreen() {
    const navigation = useNavigation();
    const router = useRouter();
    const queryClient = useQueryClient();
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [selectedWorkplaces, setSelectedWorkplaces] = useState<Set<string>>(new Set());
    const [snackbar, setSnackbar] = useState({ visible: false, message: "" });

    const {
        data,
        isLoading,
        isError,
        refetch,
        isRefetching,
    } = useQuery<{ items: PrepQueueItem[] }>({
        queryKey: ["prep-queue"],
        queryFn: async () => {
            const response = await apiClient.get("/prep-queue");
            return response.data;
        },
    });

    const refreshPlan = useMutation({
        mutationFn: async () => {
            const response = await apiClient.post("/prep-queue/refresh");
            return response.data as { newFile: boolean; rowCount?: number };
        },
        onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: ["prep-queue"] });
            setSnackbar({
                visible: true,
                message:
                    result.newFile ?
                        t("prepQueue.refreshFoundNew", { count: result.rowCount ?? 0 })
                    :   t("prepQueue.refreshNothingNew"),
            });
        },
        onError: () => {
            setSnackbar({ visible: true, message: t("prepQueue.refreshError") });
        },
    });

    useLayoutEffect(() => {
        navigation.setOptions({
            headerRight: () => (
                <TouchableOpacity
                    onPress={() => refreshPlan.mutate()}
                    disabled={refreshPlan.isPending}
                    style={{ marginRight: 16 }}>
                    {refreshPlan.isPending ?
                        <ActivityIndicator size="small" color="#ff5100" />
                    :   <Ionicons name="cloud-download-outline" size={22} color="#ff5100" />}
                </TouchableOpacity>
            ),
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [navigation, refreshPlan.isPending]);

    const items = data?.items ?? [];

    const dateOptions = useMemo(() => {
        const seen = new Map<string, string>(); // key -> original value for display
        for (const item of items) {
            if (item.planned_date) seen.set(dateKey(item.planned_date), item.planned_date);
        }
        return Array.from(seen.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => ({ key, label: formatDate(value) }));
    }, [items]);

    const workplaceOptions = useMemo(() => {
        return Array.from(new Set(items.map((i) => i.workplace))).sort();
    }, [items]);

    const filteredItems = useMemo(() => {
        return items.filter((item) => {
            if (selectedDate && (!item.planned_date || dateKey(item.planned_date) !== selectedDate)) return false;
            if (selectedWorkplaces.size > 0 && !selectedWorkplaces.has(item.workplace)) return false;
            return true;
        });
    }, [items, selectedDate, selectedWorkplaces]);

    const toggleWorkplace = (wp: string) => {
        setSelectedWorkplaces((prev) => {
            const next = new Set(prev);
            if (next.has(wp)) next.delete(wp);
            else next.add(wp);
            return next;
        });
    };

    // Opens the BOM for review — printing the prep label happens from the
    // document viewer itself (see app/document/[id].tsx), reached only via
    // this navigation (fromPrepQueue: "1"). The worker needs to actually
    // see what to prepare before finishing/printing, so "Prepare" is a
    // two-step flow: open the BOM here, then print from inside it once
    // they've reviewed it.
    const openBom = useMutation({
        mutationFn: async (item: PrepQueueItem) => {
            const response = await apiClient.post("/workstations/import-pbom", {
                projectNumber: item.project_number,
                position: item.position,
                workplace: item.workplace,
            });
            return response.data;
        },
        onSuccess: (doc: any) => {
            const latest = doc.revisions?.[0];
            router.push({
                pathname: `/document/${doc.id}`,
                params: {
                    filename: latest?.filename || doc.name || "",
                    version: latest?.version || 1,
                    fromPrepQueue: "1",
                },
            });
        },
        onError: (error: any) => {
            const msg = error?.response?.data?.error || error.message;
            setSnackbar({ visible: true, message: t("prepQueue.openBomError", { msg }) });
        },
    });

    return (
        <View style={styles.container}>
            <View style={styles.filterRow}>
                <Chip
                    mode={selectedDate === null ? "flat" : "outlined"}
                    selected={selectedDate === null}
                    onPress={() => setSelectedDate(null)}
                    style={[styles.filterChip, selectedDate === null && styles.filterChipActive]}
                    textStyle={selectedDate === null ? styles.filterChipTextSelected : styles.filterChipText}>
                    {t("prepQueue.filterAllDays")}
                </Chip>
                {dateOptions.map((opt) => (
                    <Chip
                        key={opt.key}
                        mode={selectedDate === opt.key ? "flat" : "outlined"}
                        selected={selectedDate === opt.key}
                        onPress={() => setSelectedDate(selectedDate === opt.key ? null : opt.key)}
                        style={[styles.filterChip, selectedDate === opt.key && styles.filterChipActive]}
                        textStyle={selectedDate === opt.key ? styles.filterChipTextSelected : styles.filterChipText}>
                        {opt.label}
                    </Chip>
                ))}
            </View>
            {workplaceOptions.length > 1 && (
                <View style={styles.filterRow}>
                    {workplaceOptions.map((wp) => (
                        <Chip
                            key={wp}
                            mode={selectedWorkplaces.has(wp) ? "flat" : "outlined"}
                            onPress={() => toggleWorkplace(wp)}
                            selected={selectedWorkplaces.has(wp)}
                            style={[styles.filterChip, selectedWorkplaces.has(wp) && styles.filterChipActive]}
                            textStyle={
                                selectedWorkplaces.has(wp) ? styles.filterChipTextSelected : styles.filterChipText
                            }>
                            {wp}
                        </Chip>
                    ))}
                </View>
            )}
            <Divider />

            {isLoading && !isRefetching ?
                <View style={styles.center}>
                    <ActivityIndicator size="large" />
                </View>
            : isError ?
                <View style={styles.center}>
                    <Text variant="titleMedium">{t("revisions.error")}</Text>
                    <TouchableOpacity
                        style={[styles.pillBtn, styles.pillBtnPrimary]}
                        activeOpacity={0.8}
                        onPress={() => refetch()}>
                        <Text style={styles.pillBtnText}>{t("workstations.retry")}</Text>
                    </TouchableOpacity>
                </View>
            : filteredItems.length > 0 ?
                <FlatList
                    data={filteredItems}
                    keyExtractor={(item) => item.id.toString()}
                    onRefresh={refetch}
                    refreshing={isRefetching}
                    contentContainerStyle={styles.list}
                    renderItem={({ item }) => (
                        <PrepQueueCard
                            item={item}
                            isOpening={openBom.isPending && openBom.variables?.id === item.id}
                            disabled={openBom.isPending}
                            onPrepare={() => openBom.mutate(item)}
                        />
                    )}
                />
            :   <View style={styles.center}>
                    <Text variant="bodyLarge">{t("prepQueue.empty")}</Text>
                </View>
            }

            <Snackbar
                visible={snackbar.visible}
                onDismiss={() => setSnackbar({ visible: false, message: "" })}
                duration={4000}>
                {snackbar.message}
            </Snackbar>
        </View>
    );
}

function PrepQueueCard({
    item,
    isOpening,
    disabled,
    onPrepare,
}: {
    item: PrepQueueItem;
    isOpening: boolean;
    disabled: boolean;
    onPrepare: () => void;
}) {
    return (
        <Card style={styles.card} mode="outlined">
            <Card.Title
                title={`${item.project_number} / ${item.position}`}
                titleStyle={styles.cardTitle}
                subtitle={item.sales_order ? `${t("prepQueue.salesOrder")} ${item.sales_order}` : undefined}
                right={() => (
                    <Chip mode="flat" compact style={styles.workplaceChip} textStyle={styles.chipText}>
                        {item.workplace}
                    </Chip>
                )}
            />
            <Card.Content>
                <Divider style={{ marginBottom: 8 }} />
                <View style={styles.metaRow}>
                    <Text variant="bodySmall" style={styles.metaLabel}>
                        {t("prepQueue.quantity")}
                    </Text>
                    <Text variant="bodySmall">{item.quantity}</Text>
                </View>
                {item.planned_date && (
                    <View style={styles.metaRow}>
                        <Text variant="bodySmall" style={styles.metaLabel}>
                            {t("prepQueue.plannedDate")}
                        </Text>
                        <Text variant="bodySmall">{formatDate(item.planned_date)}</Text>
                    </View>
                )}
                {item.plan_label && (
                    <View style={styles.metaRow}>
                        <Text variant="bodySmall" style={styles.metaLabel}>
                            {t("prepQueue.label")}
                        </Text>
                        <Text variant="bodySmall">{item.plan_label}</Text>
                    </View>
                )}
            </Card.Content>
            <Card.Actions>
                <TouchableOpacity
                    style={[styles.confirmBtn, styles.cardConfirmBtn, disabled && styles.confirmBtnDisabled]}
                    activeOpacity={0.8}
                    disabled={disabled}
                    onPress={onPrepare}>
                    {isOpening ?
                        <ActivityIndicator size="small" color="#fff" />
                    :   <Text style={styles.confirmBtnText}>{t("prepQueue.openBom")}</Text>}
                </TouchableOpacity>
            </Card.Actions>
        </Card>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#fff" },
    center: { flex: 1, justifyContent: "center", alignItems: "center" },
    filterRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
        paddingHorizontal: 12,
        paddingTop: 12,
    },
    filterChip: {},
    filterChipActive: { backgroundColor: "#ff5100" },
    filterChipText: { color: "#333" },
    filterChipTextSelected: { color: "#fff" },
    list: { padding: 12 },
    card: { marginBottom: 12 },
    cardTitle: { fontWeight: "bold" },
    workplaceChip: { backgroundColor: "#607d8b", marginRight: 12 },
    chipText: { fontSize: 11, color: "#fff" },
    metaRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        paddingVertical: 2,
    },
    metaLabel: { color: "#999" },
    pillBtn: {
        marginTop: 20,
        borderRadius: 20,
        paddingHorizontal: 24,
        height: 40,
        justifyContent: "center",
        alignItems: "center",
    },
    pillBtnPrimary: { backgroundColor: "#ff5100" },
    pillBtnText: { color: "#fff", fontWeight: "600" },
    confirmBtn: {
        backgroundColor: "#ff5100",
        borderRadius: 10,
        paddingVertical: 16,
        alignItems: "center",
    },
    cardConfirmBtn: { flex: 1, paddingVertical: 10 },
    confirmBtnDisabled: { backgroundColor: "#f0c4a8" },
    confirmBtnText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
});
