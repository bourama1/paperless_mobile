import React, { useCallback, useState } from "react";
import { FlatList, View, StyleSheet, ActivityIndicator, RefreshControl, TouchableOpacity } from "react-native";
import { Card, Text, IconButton, SegmentedButtons } from "react-native-paper";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import apiClient from "../../src/api/client";
import { ProductStat } from "../../src/types";
import { t } from "../../src/i18n";
import { setAdminPin } from "../../src/services/adminAuth";
import AdminPinModal from "../../src/components/AdminPinModal";

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

function formatDay(d: Date): string {
    return d.toLocaleDateString("cs-CZ", {
        weekday: "short",
        day: "numeric",
        month: "numeric",
        year: "numeric",
    });
}

export default function StatsScreen() {
    const router = useRouter();
    // 0 = today, -1 = yesterday, etc. Never lets you page into the future.
    const [dayOffset, setDayOffset] = useState(0);
    // "checked" by default — a cycle that finished but was never QC-checked
    // isn't really done yet, so that's the more meaningful default count.
    const [stage, setStage] = useState<Stage>("checked");
    const day = addDays(new Date(), dayOffset);
    const from = dateKey(day);
    const to = from;

    // ── hidden employee-admin entry point ──
    // Long-press the date label to reveal a PIN prompt — deliberately not a
    // visible button, since this unlocks create/rename/hide for the names
    // used across every completion/check picker in the app. Verified here
    // (a real GET, not just "does it look like 4 digits") before ever
    // navigating, so a wrong guess never even reaches the admin screen.
    // The PIN itself is handed off via adminAuth's in-memory holder, never
    // as a route param — on the web build a route param would show up in
    // the address bar and browser history.
    const [pinModalVisible, setPinModalVisible] = useState(false);

    const { data, isLoading, isError, refetch, isRefetching } = useQuery<ProductStat[]>({
        queryKey: ["stats", from, to, stage],
        queryFn: async () => (await apiClient.get("/workstations/stats", { params: { from, to, stage } })).data,
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

    const dayNav = (
        <View style={styles.dayNav}>
            <IconButton icon="chevron-left" onPress={() => setDayOffset((d) => d - 1)} />
            {/* Plain Text's onLongPress isn't wired up on the web build
                (react-native-web only implements the long-press timer for
                Touchable/Pressable, not bare Text) — TouchableOpacity works
                on every platform. */}
            <TouchableOpacity onLongPress={() => setPinModalVisible(true)} delayLongPress={500}>
                <Text variant="titleMedium">{formatDay(day)}</Text>
            </TouchableOpacity>
            <IconButton
                icon="chevron-right"
                disabled={dayOffset >= 0}
                onPress={() => setDayOffset((d) => Math.min(0, d + 1))}
            />
        </View>
    );

    const pinModal = (
        <AdminPinModal
            visible={pinModalVisible}
            onDismiss={() => setPinModalVisible(false)}
            onUnlocked={(pin) => {
                setPinModalVisible(false);
                setAdminPin(pin);
                router.push("/admin/employees");
            }}
        />
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
        <>
            {pinModal}
            <FlatList
                data={data}
                keyExtractor={(item) => item.productDesc}
                contentContainerStyle={styles.list}
                refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
                ListHeaderComponent={
                    <>
                        {dayNav}
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
        </>
    );
}

const styles = StyleSheet.create({
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
    list: { padding: 12, flexGrow: 1 },
    dayNav: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
    stageToggle: { marginBottom: 12 },
    total: { marginBottom: 12, marginLeft: 4, textAlign: "center" },
    card: { marginBottom: 8 },
    row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    desc: { flex: 1, marginRight: 12 },
    count: { color: "#ff5100", fontWeight: "bold" },
});
