import React, { useCallback, useState } from "react";
import { FlatList, View, StyleSheet, ActivityIndicator, RefreshControl } from "react-native";
import { Card, Text, IconButton, SegmentedButtons } from "react-native-paper";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import apiClient from "../../src/api/client";
import { ProductStat } from "../../src/types";
import { t } from "../../src/i18n";

type Stage = "completed" | "checked";

function dateKey(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
}

// Monday of the week containing `d` (getDay(): 0=Sun..6=Sat).
function mondayOf(d: Date): Date {
    const day = d.getDay();
    return addDays(d, day === 0 ? -6 : 1 - day);
}

function formatShort(d: Date): string {
    return d.toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" });
}

export default function StatsScreen() {
    // 0 = this week, -1 = last week, etc. Never lets you page into the future.
    const [weekOffset, setWeekOffset] = useState(0);
    // "checked" by default — a cycle that finished but was never QC-checked
    // isn't really done yet, so that's the more meaningful default count.
    const [stage, setStage] = useState<Stage>("checked");
    const monday = addDays(mondayOf(new Date()), weekOffset * 7);
    const sunday = addDays(monday, 6);
    const from = dateKey(monday);
    const to = dateKey(sunday);

    const { data, isLoading, isError, refetch, isRefetching } = useQuery<ProductStat[]>({
        queryKey: ["stats", from, to, stage],
        queryFn: async () =>
            (await apiClient.get("/workstations/stats", { params: { from, to, stage } })).data,
    });

    // Refetch every time this tab comes into view — the count changes
    // throughout the shift, and there's no need for a background poll
    // since nobody stares at this tab continuously.
    useFocusEffect(
        useCallback(() => {
            refetch();
        }, [refetch]),
    );

    const total = data?.reduce((sum, s) => sum + s.count, 0) ?? 0;

    const weekNav = (
        <View style={styles.weekNav}>
            <IconButton icon="chevron-left" onPress={() => setWeekOffset((w) => w - 1)} />
            <Text variant="titleMedium">
                {formatShort(monday)} – {formatShort(sunday)}
            </Text>
            <IconButton
                icon="chevron-right"
                disabled={weekOffset >= 0}
                onPress={() => setWeekOffset((w) => Math.min(0, w + 1))}
            />
        </View>
    );

    if (isLoading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" />
            </View>
        );
    }

    if (isError) {
        return (
            <View style={styles.center}>
                <Text>{t("stats.error")}</Text>
            </View>
        );
    }

    return (
        <FlatList
            data={data}
            keyExtractor={(item) => item.productDesc}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
            ListHeaderComponent={
                <>
                    {weekNav}
                    <SegmentedButtons
                        value={stage}
                        onValueChange={(v) => setStage(v as Stage)}
                        style={styles.stageToggle}
                        buttons={[
                            { value: "completed", label: t("stats.stageCompleted") },
                            { value: "checked", label: t("stats.stageChecked") },
                        ]}
                    />
                    <Text variant="titleMedium" style={styles.total}>
                        {t("stats.total", { count: total })}
                    </Text>
                </>
            }
            ListEmptyComponent={
                <View style={styles.center}>
                    <Text>{t("stats.empty")}</Text>
                </View>
            }
            renderItem={({ item }) => (
                <Card style={styles.card}>
                    <Card.Content style={styles.row}>
                        <Text variant="titleMedium" style={styles.desc}>
                            {item.productDesc}
                        </Text>
                        <Text variant="headlineSmall" style={styles.count}>
                            {item.count}
                        </Text>
                    </Card.Content>
                </Card>
            )}
        />
    );
}

const styles = StyleSheet.create({
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
    list: { padding: 12, flexGrow: 1 },
    weekNav: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
    stageToggle: { marginBottom: 12 },
    total: { marginBottom: 12, marginLeft: 4, textAlign: "center" },
    card: { marginBottom: 8 },
    row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    desc: { flex: 1, marginRight: 12 },
    count: { color: "#ff5100", fontWeight: "bold" },
});
