import React, { useState } from "react";
import { FlatList, View, StyleSheet, TouchableOpacity, ActivityIndicator, Keyboard } from "react-native";
import { Card, Text, TextInput, Divider, Snackbar } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import apiClient from "../../src/api/client";
import { t } from "../../src/i18n";
import { useBarcodeScan } from "../../src/hooks/useBarcodeScan";
import { OrderCodeResult } from "../../src/hooks/useOpenOrderByCode";
import BarcodeScannerModal from "../../src/components/BarcodeScannerModal";
import PbomTypePickerModal from "../../src/components/PbomTypePickerModal";

export default function SearchScreen() {
    const [orderCode, setOrderCode] = useState("");
    const order = useBarcodeScan();

    const {
        data: results,
        isLoading,
        isError,
        refetch,
        isRefetching,
    } = useQuery<OrderCodeResult[]>({
        queryKey: ["search-pbom", orderCode],
        queryFn: async () => {
            const response = await apiClient.get("/workstations/search-pbom", {
                params: { order_code: orderCode },
            });
            return response.data;
        },
        enabled: false,
    });

    const handleSearch = () => {
        if (!orderCode.trim()) return;
        Keyboard.dismiss();
        refetch();
    };

    return (
        <View style={styles.container}>
            <View style={styles.searchBar}>
                <TextInput
                    mode="outlined"
                    label={t("search.label")}
                    value={orderCode}
                    onChangeText={setOrderCode}
                    style={styles.input}
                    onSubmitEditing={handleSearch}
                    returnKeyType="search"
                />
                <TouchableOpacity
                    onPress={handleSearch}
                    disabled={!orderCode.trim() || isRefetching}
                    activeOpacity={0.8}
                    style={[
                        styles.searchBtn,
                        orderCode.trim() && !isRefetching ? styles.searchBtnActive : styles.searchBtnDisabled,
                    ]}>
                    {isRefetching ?
                        <ActivityIndicator size="small" color={orderCode.trim() ? "#fff" : "#999"} />
                    :   <Text style={[styles.searchBtnText, { color: orderCode.trim() ? "#fff" : "#999" }]}>
                            {t("search.button")}
                        </Text>
                    }
                </TouchableOpacity>
                <TouchableOpacity onPress={order.scanner.open} activeOpacity={0.8} style={styles.scanBtn}>
                    <Ionicons name="barcode-outline" size={24} color="#ff5100" />
                </TouchableOpacity>
            </View>

            <Divider />

            {isLoading ?
                <View style={styles.center}>
                    <ActivityIndicator size="large" />
                </View>
            : isError ?
                <View style={styles.center}>
                    <Text variant="titleMedium">{t("search.error")}</Text>
                    <TouchableOpacity
                        style={[styles.pillBtn, styles.pillBtnPrimary]}
                        activeOpacity={0.8}
                        onPress={handleSearch}>
                        <Text style={styles.pillBtnText}>{t("search.retry")}</Text>
                    </TouchableOpacity>
                </View>
            : results && results.length > 0 ?
                <FlatList
                    data={results}
                    keyExtractor={(item) => `${item.order_code}-${item.position_code}`}
                    contentContainerStyle={styles.list}
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            onPress={() => order.openResult(item)}
                            disabled={order.isOpening}
                            activeOpacity={0.7}>
                            <Card
                                style={[styles.card, item.locked ? styles.cardLocked : { borderColor: "#ff5100" }]}
                                mode="outlined">
                                <Card.Title
                                    title={t("search.resultOrder", { code: item.order_code })}
                                    titleStyle={[styles.cardTitle, item.locked && styles.cardTitleLocked]}
                                    subtitle={t("search.resultPosition", { code: item.position_code })}
                                    right={() =>
                                        order.isOpening && order.openingItem === item ?
                                            <ActivityIndicator size="small" style={{ marginRight: 12 }} />
                                        :   <View
                                                style={{
                                                    flexDirection: "row",
                                                    alignItems: "center",
                                                    marginRight: 12,
                                                    gap: 8,
                                                }}>
                                                {item.locked && (
                                                    <Ionicons name="lock-closed" size={18} color="#c62828" />
                                                )}
                                                <Ionicons name="chevron-forward" size={20} color="#ccc" />
                                            </View>
                                    }
                                />
                                {item.locked && (
                                    <Card.Content style={{ paddingTop: 0 }}>
                                        <View style={styles.lockedBanner}>
                                            <Ionicons name="lock-closed" size={14} color="#c62828" />
                                            <Text variant="bodySmall" style={styles.lockedBannerText}>
                                                {t("prepQueue.locked")}
                                            </Text>
                                        </View>
                                    </Card.Content>
                                )}
                            </Card>
                        </TouchableOpacity>
                    )}
                />
            : results ?
                <View style={styles.center}>
                    <Text variant="bodyLarge">{t("search.emptyResult")}</Text>
                    <Text variant="bodySmall" style={{ color: "#999", marginTop: 8 }}>
                        {t("search.emptyHint")}
                    </Text>
                </View>
            :   <View style={styles.center}>
                    <Text variant="bodyLarge">{t("search.prompt")}</Text>
                    <Text variant="bodySmall" style={{ color: "#999", marginTop: 8 }}>
                        {t("search.promptHint")}
                    </Text>
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

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#fff" },
    center: { flex: 1, justifyContent: "center", alignItems: "center" },
    searchBar: {
        flexDirection: "row",
        padding: 12,
        alignItems: "center",
        gap: 4,
    },
    input: { flex: 1 },
    searchBtn: {
        borderRadius: 20,
        paddingHorizontal: 20,
        height: 40,
        justifyContent: "center",
        alignItems: "center",
        minWidth: 80,
    },
    searchBtnActive: {
        backgroundColor: "#ff5100",
    },
    searchBtnDisabled: {
        backgroundColor: "transparent",
        borderWidth: 1,
        borderColor: "#ddd",
    },
    searchBtnText: {
        fontSize: 14,
        fontWeight: "600",
    },
    scanBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: "center",
        alignItems: "center",
        borderWidth: 1,
        borderColor: "#ddd",
    },
    pillBtn: {
        marginTop: 20,
        borderRadius: 20,
        paddingHorizontal: 24,
        height: 40,
        justifyContent: "center",
        alignItems: "center",
    },
    pillBtnPrimary: {
        backgroundColor: "#ff5100",
    },
    pillBtnText: {
        color: "#fff",
        fontSize: 14,
        fontWeight: "600",
    },
    list: { padding: 12 },
    card: { marginBottom: 12 },
    cardLocked: {
        borderColor: "#ef9a9a",
        backgroundColor: "#fff8f8",
    },
    cardTitle: { fontWeight: "bold" },
    cardTitleLocked: { color: "#c62828" },
    lockedBanner: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        backgroundColor: "#ffebee",
        borderRadius: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
        marginBottom: 8,
    },
    lockedBannerText: {
        color: "#c62828",
        fontWeight: "bold",
    },
});
