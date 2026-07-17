import React, { useState, useCallback, useLayoutEffect } from "react";
import { FlatList, View, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Card, Text, Chip, Divider } from "react-native-paper";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect, useRouter, useNavigation } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import apiClient from "../../src/api/client";
import { RevisionsResponse, RevisionOverviewItem } from "../../src/types";
import { t } from "../../src/i18n";

function formatDateKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function formatDisplayDate(date: Date): string {
    const today = new Date();
    if (formatDateKey(date) === formatDateKey(today)) {
        return t("revisions.today");
    }
    return date.toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" });
}

function formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
}

export default function RevisionsScreen() {
    const router = useRouter();
    const navigation = useNavigation();
    const [selectedDate, setSelectedDate] = useState(() => new Date());

    const dateKey = formatDateKey(selectedDate);

    const {
        data: revisionsData,
        isLoading,
        isError,
        refetch,
        isRefetching,
    } = useQuery<RevisionsResponse>({
        queryKey: ["revisions", dateKey],
        queryFn: async () => {
            const response = await apiClient.get("/files", { params: { date: dateKey } });
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

    const goToPrevDay = () => {
        const prev = new Date(selectedDate);
        prev.setDate(prev.getDate() - 1);
        setSelectedDate(prev);
    };

    const goToNextDay = () => {
        const next = new Date(selectedDate);
        next.setDate(next.getDate() + 1);
        setSelectedDate(next);
    };

    const goToToday = () => {
        setSelectedDate(new Date());
    };

    const items = revisionsData?.items ?? [];

    if (isLoading && !isRefetching) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" />
            </View>
        );
    }

    if (isError) {
        return (
            <View style={styles.center}>
                <Text variant="titleMedium">{t("revisions.error")}</Text>
                <TouchableOpacity
                    style={[styles.pillBtn, styles.pillBtnPrimary]}
                    activeOpacity={0.8}
                    onPress={() => refetch()}>
                    <Text style={styles.pillBtnText}>{t("workstations.retry")}</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.dateNav}>
                <TouchableOpacity onPress={goToPrevDay} style={styles.dateArrow} activeOpacity={0.6}>
                    <Ionicons name="chevron-back" size={24} color="#ff5100" />
                </TouchableOpacity>
                <TouchableOpacity onPress={goToToday} activeOpacity={0.6}>
                    <Text variant="titleMedium" style={styles.dateText}>
                        {formatDisplayDate(selectedDate)}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={goToNextDay} style={styles.dateArrow} activeOpacity={0.6}>
                    <Ionicons name="chevron-forward" size={24} color="#ff5100" />
                </TouchableOpacity>
            </View>
            {items.length > 0 ?
                <FlatList
                    data={items}
                    keyExtractor={(item) => item.document_id.toString()}
                    onRefresh={refetch}
                    refreshing={isRefetching}
                    contentContainerStyle={styles.list}
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            onPress={() => {
                                const latest = item.revisions[item.revisions.length - 1];
                                router.push({
                                    pathname: `/document/${item.document_id}`,
                                    params: {
                                        filename: latest?.filename || "",
                                        version: latest?.version || 1,
                                    },
                                });
                            }}
                            activeOpacity={0.7}>
                            <Card style={styles.card} mode="outlined">
                                <Card.Title
                                    title={item.document_name}
                                    titleStyle={styles.cardTitle}
                                    right={() => (
                                        <View style={styles.chipRow}>
                                            {item.revisions.some((r) => r.has_annotations) && (
                                                <Chip
                                                    mode="flat"
                                                    compact
                                                    style={styles.annotatedChip}
                                                    textStyle={styles.chipText}>
                                                    {t("revisions.annotated")}
                                                </Chip>
                                            )}
                                            <Chip
                                                mode="flat"
                                                compact
                                                style={styles.revisionChip}
                                                textStyle={styles.chipText}>
                                                {item.revisions.length} {t("revisions.revisions")}
                                            </Chip>
                                        </View>
                                    )}
                                />
                                <Card.Content>
                                    <Divider style={{ marginBottom: 8 }} />
                                    {item.revisions.slice().reverse().map((rev) => (
                                        <View key={rev.id} style={styles.revisionRow}>
                                            <Text variant="bodySmall" style={styles.revisionFilename} numberOfLines={1}>
                                                v{rev.version} — {rev.filename}
                                            </Text>
                                            <Text variant="bodySmall" style={styles.revisionTime}>
                                                {formatTime(rev.created_at)}
                                            </Text>
                                        </View>
                                    ))}
                                </Card.Content>
                            </Card>
                        </TouchableOpacity>
                    )}
                />
            :   <View style={styles.center}>
                    <Text variant="bodyLarge">{t("revisions.empty")}</Text>
                </View>
            }
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#fff" },
    center: { flex: 1, justifyContent: "center", alignItems: "center" },
    dateNav: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: "#e0e0e0",
    },
    dateArrow: { padding: 8 },
    dateText: { fontWeight: "bold", marginHorizontal: 16 },
    list: { padding: 12 },
    card: { marginBottom: 12 },
    cardTitle: { fontWeight: "bold", flex: 1 },
    chipRow: { flexDirection: "row", marginRight: 12, gap: 6 },
    annotatedChip: { backgroundColor: "#ff5100" },
    revisionChip: { backgroundColor: "#e0e0e0" },
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
    pillBtnText: { color: "#fff", fontSize: 14, fontWeight: "600" },
});
