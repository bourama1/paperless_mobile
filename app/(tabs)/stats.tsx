import React, { useCallback, useState } from "react";
import { FlatList, View, StyleSheet, ActivityIndicator, RefreshControl, TouchableOpacity } from "react-native";
import { Card, Text, IconButton, SegmentedButtons, Portal, Modal, TextInput } from "react-native-paper";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import apiClient from "../../src/api/client";
import { ProductStat } from "../../src/types";
import { t } from "../../src/i18n";
import { setAdminPin } from "../../src/services/adminAuth";

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
    const [pin, setPin] = useState("");
    const [pinError, setPinError] = useState<string | null>(null);
    const [verifyingPin, setVerifyingPin] = useState(false);

    const closePinModal = useCallback(() => {
        setPinModalVisible(false);
        setPin("");
        setPinError(null);
    }, []);

    const unlockAdmin = useCallback(async () => {
        setVerifyingPin(true);
        setPinError(null);
        try {
            await apiClient.get("/employees/admin", { headers: { "X-Admin-Pin": pin } });
            setAdminPin(pin);
            closePinModal();
            router.push("/admin/employees");
        } catch (err: any) {
            setPinError(
                err?.response?.status === 401 ? t("stats.adminPinWrong") : t("stats.adminPinError"),
            );
        } finally {
            setVerifyingPin(false);
        }
    }, [pin, closePinModal, router]);

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
        <Portal>
            <Modal visible={pinModalVisible} onDismiss={closePinModal} contentContainerStyle={styles.modal}>
                <Text variant="titleLarge" style={{ marginBottom: 12 }}>
                    {t("stats.adminPinTitle")}
                </Text>
                <TextInput
                    mode="outlined"
                    value={pin}
                    onChangeText={setPin}
                    secureTextEntry
                    keyboardType="number-pad"
                    autoFocus
                    onSubmitEditing={unlockAdmin}
                />
                {pinError && (
                    <Text style={{ color: "#c62828", marginTop: 8 }}>{pinError}</Text>
                )}
                <TouchableOpacity
                    style={[styles.confirmBtn, (!pin || verifyingPin) && styles.confirmBtnDisabled]}
                    activeOpacity={0.8}
                    disabled={!pin || verifyingPin}
                    onPress={unlockAdmin}>
                    {verifyingPin ?
                        <ActivityIndicator size="small" color="#fff" />
                    :   <Text style={styles.confirmBtnText}>{t("stats.adminUnlock")}</Text>}
                </TouchableOpacity>
            </Modal>
        </Portal>
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
    modal: { backgroundColor: "#fff", marginHorizontal: 24, borderRadius: 16, padding: 24 },
    confirmBtn: { backgroundColor: "#ff5100", borderRadius: 10, paddingVertical: 16, alignItems: "center" },
    confirmBtnDisabled: { backgroundColor: "#f0c4a8" },
    confirmBtnText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
});
