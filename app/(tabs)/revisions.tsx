import React, { useState, useCallback, useLayoutEffect } from "react";
import { FlatList, View, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { Card, Text, Chip, Divider, Snackbar } from "react-native-paper";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect, useRouter, useNavigation } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import apiClient from "../../src/api/client";
import { DocumentsOverviewResponse, DocumentOverviewItem, CompletionStatus } from "../../src/types";
import { t } from "../../src/i18n";
import LanguageSwitcher from "../../src/components/LanguageSwitcher";
import { useBarcodeScan } from "../../src/hooks/useBarcodeScan";
import BarcodeScannerModal from "../../src/components/BarcodeScannerModal";
import PbomTypePickerModal from "../../src/components/PbomTypePickerModal";

// Explicit timeZone — the factory's tablets/web browsers can't be trusted
// to have their OS clock set to the right zone, and without this,
// toLocaleString silently uses whatever zone the device happens to be in,
// shifting displayed times away from the real (correct, UTC-stored) value.
const FACTORY_TIME_ZONE = "Europe/Prague";

function formatTime(iso: string): string {
    return new Date(iso).toLocaleString("cs-CZ", {
        timeZone: FACTORY_TIME_ZONE,
        day: "numeric",
        month: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

const STATUS_FILTERS: { value: CompletionStatus; label: string; color: string }[] = [
    { value: "complete", label: "docs.filterComplete", color: "#2e7d32" },
    { value: "complete_with_changes", label: "docs.filterCompleteWithChanges", color: "#00838f" },
    { value: "missing_product", label: "docs.filterMissing", color: "#f9a825" },
    { value: "shipped_incomplete", label: "docs.filterIncomplete", color: "#c62828" },
];

const STATUS_META: Record<CompletionStatus, { label: string; color: string }> = {
    complete: { label: "docs.statusComplete", color: "#2e7d32" },
    complete_with_changes: { label: "docs.statusCompleteWithChanges", color: "#00838f" },
    missing_product: { label: "docs.statusMissing", color: "#f9a825" },
    shipped_incomplete: { label: "docs.statusIncomplete", color: "#c62828" },
};

export default function DocumentsScreen() {
    const router = useRouter();
    const navigation = useNavigation();
    const [statusFilters, setStatusFilters] = useState<Set<CompletionStatus>>(new Set());
    const [revisionedOnly, setRevisionedOnly] = useState(false);
    const [uncheckedOnly, setUncheckedOnly] = useState(false);
    const order = useBarcodeScan();

    const statusParam = Array.from(statusFilters).join(",");

    const {
        data: overview,
        isLoading,
        isError,
        refetch,
        isRefetching,
    } = useQuery<DocumentsOverviewResponse>({
        queryKey: ["documents-overview", statusParam, revisionedOnly, uncheckedOnly],
        queryFn: async () => {
            const response = await apiClient.get("/files", {
                params: {
                    ...(statusParam ? { status: statusParam } : {}),
                    ...(revisionedOnly ? { revisioned: "true" } : {}),
                    ...(uncheckedOnly ? { unchecked: "true" } : {}),
                },
            });
            return response.data;
        },
    });

    useFocusEffect(
        useCallback(() => {
            refetch();
        }, [refetch]),
    );

    useLayoutEffect(() => {
        navigation.setOptions({
            headerRight: () => (
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <TouchableOpacity onPress={order.scanner.open} style={{ marginRight: 16 }}>
                        <Ionicons name="barcode-outline" size={22} color="#ff5100" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => refetch()} disabled={isRefetching} style={{ marginRight: 16 }}>
                        {isRefetching ?
                            <ActivityIndicator size="small" color="#ff5100" />
                        :   <Ionicons name="refresh" size={22} color="#ff5100" />}
                    </TouchableOpacity>
                    <LanguageSwitcher />
                </View>
            ),
        });
    }, [navigation, refetch, isRefetching, order.scanner.open]);

    const toggleStatus = (value: CompletionStatus) => {
        setStatusFilters((prev) => {
            const next = new Set(prev);
            if (next.has(value)) next.delete(value);
            else next.add(value);
            return next;
        });
    };

    const items = overview?.items ?? [];

    return (
        <View style={styles.container}>
            <View style={styles.filterRow}>
                {STATUS_FILTERS.map((f) => (
                    <Chip
                        key={f.value}
                        mode={statusFilters.has(f.value) ? "flat" : "outlined"}
                        selected={statusFilters.has(f.value)}
                        onPress={() => toggleStatus(f.value)}
                        style={[styles.filterChip, statusFilters.has(f.value) && { backgroundColor: f.color }]}
                        textStyle={statusFilters.has(f.value) ? styles.filterChipTextSelected : styles.filterChipText}>
                        {t(f.label)}
                    </Chip>
                ))}
                <Chip
                    mode={revisionedOnly ? "flat" : "outlined"}
                    selected={revisionedOnly}
                    onPress={() => setRevisionedOnly((v) => !v)}
                    style={[styles.filterChip, revisionedOnly && { backgroundColor: "#ff5100" }]}
                    textStyle={revisionedOnly ? styles.filterChipTextSelected : styles.filterChipText}>
                    {t("docs.filterRevisioned")}
                </Chip>
                <Chip
                    mode={uncheckedOnly ? "flat" : "outlined"}
                    selected={uncheckedOnly}
                    onPress={() => setUncheckedOnly((v) => !v)}
                    style={[styles.filterChip, uncheckedOnly && { backgroundColor: "#c62828" }]}
                    textStyle={uncheckedOnly ? styles.filterChipTextSelected : styles.filterChipText}>
                    {t("docs.filterUnchecked")}
                </Chip>
            </View>
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
            : items.length > 0 ?
                <FlatList
                    data={items}
                    keyExtractor={(item) =>
                        item.document_id != null
                            ? item.document_id.toString()
                            : `${item.project_number}-${item.position}`
                    }
                    onRefresh={refetch}
                    refreshing={isRefetching}
                    contentContainerStyle={styles.list}
                    renderItem={({ item }) => <DocumentCard item={item} router={router} />}
                />
            :   <View style={styles.center}>
                    <Text variant="bodyLarge">{t("revisions.empty")}</Text>
                </View>
            }

            <PbomTypePickerModal
                visible={order.picker.visible}
                options={order.picker.options}
                disabled={order.picker.disabled}
                onDismiss={order.picker.onDismiss}
                onSelect={order.picker.onSelect}
            />

            <BarcodeScannerModal
                visible={order.scanner.visible}
                onDismiss={order.scanner.onDismiss}
                onScanned={order.scanner.onScanned}
                resolving={order.scanner.resolving}
                errorMessage={order.scanner.errorMessage}
            />

            <Snackbar visible={order.snackbar.visible} onDismiss={order.snackbar.onDismiss}>
                {order.snackbar.message}
            </Snackbar>
        </View>
    );
}

function DocumentCard({ item, router }: { item: DocumentOverviewItem; router: ReturnType<typeof useRouter> }) {
    const [importing, setImporting] = useState(false);
    const statusMeta = item.status ? STATUS_META[item.status] : null;
    const latest = item.revisions[0]; // revisions come back version-desc from the backend

    // This order reached a kiosk finishing state but its BOM was never
    // opened/imported in-app (e.g. finished via the prep queue's direct
    // print mode) — there's no documents row/id to navigate to yet, so
    // create one on demand (find-or-create on the backend) before opening it.
    const handlePress = async () => {
        if (item.document_id != null) {
            router.push({
                pathname: `/document/${item.document_id}`,
                params: {
                    filename: latest?.filename || "",
                    version: latest?.version || 1,
                },
            });
            return;
        }

        setImporting(true);
        try {
            const response = await apiClient.post("/workstations/import-pbom", {
                projectNumber: item.project_number,
                position: item.position,
                workplace: item.workstation,
            });
            const doc = response.data;
            const rev = doc.revisions?.[0];
            router.push({
                pathname: `/document/${doc.id}`,
                params: {
                    filename: rev?.filename || doc.name || "",
                    version: rev?.version || 1,
                },
            });
        } catch (error: any) {
            Alert.alert(t("docs.openError"), error?.response?.data?.error || error.message);
        } finally {
            setImporting(false);
        }
    };

    return (
        <TouchableOpacity onPress={handlePress} activeOpacity={0.7} disabled={importing}>
            <Card style={styles.card} mode="outlined">
                <Card.Title
                    title={item.document_name || `${t("workstations.label.project")} ${item.project_number}`}
                    titleStyle={styles.cardTitle}
                    subtitle={
                        (item.project_number && item.position
                            ? `${t("workstations.label.project")} ${item.project_number}  ·  ${t("workstations.label.position")} ${item.position}`
                            : item.project_number
                              ? `${t("workstations.label.project")} ${item.project_number}`
                              : "") +
                        `  ·  ${t("docs.completedAt")}: ${formatTime(item.completed_at)}`
                    }
                    right={() => (importing ? <ActivityIndicator size="small" style={{ marginRight: 12 }} /> : (
                        <View style={styles.chipRow}>
                            {item.revisioned && (
                                <Chip mode="flat" compact style={styles.revisionedChip} textStyle={styles.chipText}>
                                    {t("docs.filterRevisioned")}
                                </Chip>
                            )}
                            <Chip
                                mode="flat"
                                compact
                                style={[styles.statusChip, item.checked ? styles.checkedChip : styles.uncheckedChip]}
                                textStyle={styles.chipText}>
                                {item.checked ?
                                    t("docs.checked")
                                :   t("docs.checkedProgress", {
                                        checked: item.checked_cycles,
                                        total: item.total_cycles,
                                    })}
                            </Chip>
                            {statusMeta && (
                                <Chip
                                    mode="flat"
                                    compact
                                    style={[styles.statusChip, { backgroundColor: statusMeta.color }]}
                                    textStyle={styles.chipText}>
                                    {t(statusMeta.label)}
                                </Chip>
                            )}
                        </View>
                    ))}
                />
                {!item.checked && item.unchecked_cycles.length > 0 && (
                    <Card.Content style={styles.uncheckedCyclesRow}>
                        <Text variant="bodySmall" style={styles.uncheckedCyclesText}>
                            {t("docs.uncheckedCycles", {
                                cycles: item.unchecked_cycles.join(", "),
                            })}
                        </Text>
                    </Card.Content>
                )}
                {item.revisions.length > 0 && (
                    <Card.Content>
                        <Divider style={{ marginBottom: 8 }} />
                        {item.revisions.map((rev) => (
                            <View key={rev.id} style={styles.revisionRow}>
                                <Text variant="bodySmall" style={styles.revisionFilename} numberOfLines={1}>
                                    {rev.is_edited ? `v${rev.version} — ${rev.filename}` : t("docs.originalImport")}
                                </Text>
                                <Text variant="bodySmall" style={styles.revisionTime}>
                                    {formatTime(rev.created_at)}
                                </Text>
                            </View>
                        ))}
                    </Card.Content>
                )}
            </Card>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#fff" },
    center: { flex: 1, justifyContent: "center", alignItems: "center" },
    filterRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
        padding: 12,
    },
    filterChip: {},
    filterChipText: { color: "#333" },
    filterChipTextSelected: { color: "#fff" },
    list: { padding: 12 },
    card: { marginBottom: 12 },
    cardTitle: { fontWeight: "bold", flex: 1 },
    chipRow: { flexDirection: "row", marginRight: 12, gap: 6 },
    revisionedChip: { backgroundColor: "#607d8b" },
    statusChip: {},
    checkedChip: { backgroundColor: "#2e7d32" },
    uncheckedChip: { backgroundColor: "#c62828" },
    uncheckedCyclesRow: { paddingTop: 0, paddingBottom: 8 },
    uncheckedCyclesText: { color: "#c62828" },
    chipText: { fontSize: 11, color: "#fff" },
    revisionRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: 4,
    },
    revisionFilename: { flex: 1, color: "#666" },
    revisionTime: { marginLeft: 8, color: "#999" },
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
});
