import React, { useState } from "react";
import { FlatList, View, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Card, Text, TextInput, Divider, Snackbar } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import apiClient from "../../src/api/client";
import { t } from "../../src/i18n";

interface SearchResult {
    customer_code: number;
    order_code: number;
    position_code: number;
}

export default function SearchScreen() {
    const router = useRouter();
    const [orderCode, setOrderCode] = useState("");
    const [snackbar, setSnackbar] = useState({ visible: false, message: "" });

    const {
        data: results,
        isLoading,
        isError,
        refetch,
        isRefetching,
    } = useQuery<SearchResult[]>({
        queryKey: ["search-pbom", orderCode],
        queryFn: async () => {
            const response = await apiClient.get("/workstations/search-pbom", {
                params: { order_code: orderCode },
            });
            return response.data;
        },
        enabled: false,
    });

    const importPbom = useMutation({
        mutationFn: async (item: SearchResult) => {
            const response = await apiClient.post("/workstations/import-pbom", {
                projectNumber: String(item.order_code),
                position: String(item.position_code),
                customer: String(item.customer_code),
            });
            return response.data;
        },
        onSuccess: (doc) => {
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

    const handleSearch = () => {
        if (!orderCode.trim()) return;
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
                    keyExtractor={(item, i) => `${item.order_code}-${item.position_code}-${i}`}
                    contentContainerStyle={styles.list}
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            onPress={() => importPbom.mutate(item)}
                            disabled={importPbom.isPending}
                            activeOpacity={0.7}>
                            <Card style={[styles.card, { borderColor: "#ff5100" }]} mode="outlined">
                                <Card.Title
                                    title={t("search.resultOrder", { code: item.order_code })}
                                    titleStyle={styles.cardTitle}
                                    subtitle={t("search.resultPosition", { code: item.position_code })}
                                    right={(props) => (
                                        <Ionicons
                                            name="chevron-forward"
                                            size={20}
                                            color="#ccc"
                                            style={{ marginRight: 12 }}
                                        />
                                    )}
                                />
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

            <Snackbar visible={snackbar.visible} onDismiss={() => setSnackbar({ ...snackbar, visible: false })}>
                {snackbar.message}
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
    cardTitle: { fontWeight: "bold" },
    detailRow: { flexDirection: "row", marginTop: 4 },
    label: { fontWeight: "600", width: 100, color: "#666" },
});
