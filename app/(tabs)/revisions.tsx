import React, { useState, useCallback, useLayoutEffect } from "react";
import { FlatList, View, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Card, Text, Chip, Divider } from "react-native-paper";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect, useRouter, useNavigation } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import apiClient from "../../src/api/client";
import { DocumentsOverviewResponse, DocumentOverviewItem, CompletionStatus } from "../../src/types";
import { t } from "../../src/i18n";

function formatTime(iso: string): string {
    return new Date(iso).toLocaleString("cs-CZ", {
        day: "numeric",
        month: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

const STATUS_FILTERS: { value: CompletionStatus; label: string; color: string }[] = [
    { value: "complete", label: "docs.filterComplete", color: "#2e7d32" },
    { value: "missing_product", label: "docs.filterMissing", color: "#f9a825" },
    { value: "shipped_incomplete", label: "docs.filterIncomplete", color: "#c62828" },
];

const STATUS_META: Record<CompletionStatus, { label: string; color: string }> = {
    complete: { label: "docs.statusComplete", color: "#2e7d32" },
    missing_product: { label: "docs.statusMissing", color: "#f9a825" },
    shipped_incomplete: { label: "docs.statusIncomplete", color: "#c62828" },
};

export default function DocumentsScreen() {
    const router = useRouter();
    const navigation = useNavigation();
    const [statusFilters, setStatusFilters] = useState<Set<CompletionStatus>>(new Set());
    const [revisionedOnly, setRevisionedOnly] = useState(false);

    const statusParam = Array.from(statusFilters).join(",");

    const {
        data: overview,
        isLoading,
        isError,
        refetch,
        isRefetching,
    } = useQuery<DocumentsOverviewResponse>({
        queryKey: ["documents-overview", statusParam, revisionedOnly],
        queryFn: async () => {
            const response = await apiClient.get("/files", {
                params: {
                    ...(statusParam ? { status: statusParam } : {}),
                    ...(revisionedOnly ? { revisioned: "true" } : {}),
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
                <TouchableOpacity onPress={() => refetch()} disabled={isRefetching} style={{ marginRight: 16 }}>
                    {isRefetching ?
                        <ActivityIndicator size="small" color="#ff5100" />
                    :   <Ionicons name="refresh" size={22} color="#ff5100" />}
                </TouchableOpacity>
            ),
        });
    }, [navigation, refetch, isRefetching]);

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
                    keyExtractor={(item) => item.document_id.toString()}
                    onRefresh={refetch}
                    refreshing={isRefetching}
                    contentContainerStyle={styles.list}
                    renderItem={({ item }) => <DocumentCard item={item} router={router} />}
                />
            :   <View style={styles.center}>
                    <Text variant="bodyLarge">{t("revisions.empty")}</Text>
                </View>
            }
        </View>
    );
}

function DocumentCard({ item, router }: { item: DocumentOverviewItem; router: ReturnType<typeof useRouter> }) {
    const statusMeta = item.status ? STATUS_META[item.status] : null;
    const latest = item.revisions[0]; // revisions come back version-desc from the backend

    return (
        <TouchableOpacity
            onPress={() =>
                router.push({
                    pathname: `/document/${item.document_id}`,
                    params: {
                        filename: latest?.filename || "",
                        version: latest?.version || 1,
                    },
                })
            }
            activeOpacity={0.7}>
            <Card style={styles.card} mode="outlined">
                <Card.Title
                    title={item.document_name}
                    titleStyle={styles.cardTitle}
                    subtitle={
                        item.project_number && item.position ? `${item.project_number} / ${item.position}` : undefined
                    }
                    right={() => (
                        <View style={styles.chipRow}>
                            {item.revisioned && (
                                <Chip mode="flat" compact style={styles.revisionedChip} textStyle={styles.chipText}>
                                    {t("docs.filterRevisioned")}
                                </Chip>
                            )}
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
                    )}
                />
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
