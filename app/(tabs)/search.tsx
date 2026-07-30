import React, { useState } from "react";
import { FlatList, View, StyleSheet, TouchableOpacity, ActivityIndicator, Keyboard } from "react-native";
import { Card, Text, TextInput, Divider, Snackbar, Portal, Modal, List } from "react-native-paper";
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

interface PbomTypeOption {
    document_type: number;
    name: string; // machine name, e.g. "pbom_motor" — translate via docType.<name>
}

export default function SearchScreen() {
    const router = useRouter();
    const [orderCode, setOrderCode] = useState("");
    const [snackbar, setSnackbar] = useState({ visible: false, message: "" });

    // BOM-type picker modal state — shown when a searched position has more
    // than one BOM type available, so the person can pick which one to open.
    const [pickerVisible, setPickerVisible] = useState(false);
    const [pickerOptions, setPickerOptions] = useState<PbomTypeOption[]>([]);
    const [pickerTarget, setPickerTarget] = useState<SearchResult | null>(null);

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
        mutationFn: async ({ item, documentType }: { item: SearchResult; documentType?: number }) => {
            const response = await apiClient.post("/workstations/import-pbom", {
                projectNumber: String(item.order_code),
                position: String(item.position_code),
                customer: String(item.customer_code),
                documentType,
            });
            return response.data;
        },
        onSuccess: (doc) => {
            setPickerVisible(false);
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
            setPickerVisible(false);
            const msg = error?.response?.data?.error || error.message;
            setSnackbar({ visible: true, message: t("search.errorPrefix", { msg }) });
        },
    });

    // Find out which BOM types actually exist for the tapped position, then
    // either open the only one directly, or let the person choose.
    const fetchTypes = useMutation({
        mutationFn: async (item: SearchResult) => {
            const response = await apiClient.get("/workstations/pbom-types", {
                params: {
                    order_code: item.order_code,
                    position_code: item.position_code,
                },
            });
            return { item, types: response.data as PbomTypeOption[] };
        },
        onSuccess: ({ item, types }) => {
            if (types.length === 0) {
                setSnackbar({ visible: true, message: t("search.typesEmpty") });
                return;
            }
            if (types.length === 1) {
                importPbom.mutate({ item, documentType: types[0].document_type });
                return;
            }
            setPickerOptions(types);
            setPickerTarget(item);
            setPickerVisible(true);
        },
        onError: () => {
            setSnackbar({ visible: true, message: t("search.typesError") });
        },
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
                            onPress={() => fetchTypes.mutate(item)}
                            disabled={fetchTypes.isPending || importPbom.isPending}
                            activeOpacity={0.7}>
                            <Card style={[styles.card, { borderColor: "#ff5100" }]} mode="outlined">
                                <Card.Title
                                    title={t("search.resultOrder", { code: item.order_code })}
                                    titleStyle={styles.cardTitle}
                                    subtitle={t("search.resultPosition", { code: item.position_code })}
                                    right={(props) =>
                                        fetchTypes.isPending && fetchTypes.variables === item ?
                                            <ActivityIndicator size="small" style={{ marginRight: 12 }} />
                                        :   <Ionicons
                                                name="chevron-forward"
                                                size={20}
                                                color="#ccc"
                                                style={{ marginRight: 12 }}
                                            />

                                    }
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

            <Portal>
                <Modal
                    visible={pickerVisible}
                    onDismiss={() => setPickerVisible(false)}
                    contentContainerStyle={styles.modal}>
                    <Text variant="titleMedium" style={{ marginBottom: 4 }}>
                        {t("search.selectType")}
                    </Text>
                    <Text variant="bodySmall" style={{ color: "#999", marginBottom: 12 }}>
                        {t("search.selectTypeHint")}
                    </Text>
                    <FlatList
                        data={pickerOptions}
                        keyExtractor={(opt) => String(opt.document_type)}
                        renderItem={({ item: opt }) => (
                            <List.Item
                                title={t(`docType.${opt.name}`, { defaultValue: opt.name })}
                                onPress={() => {
                                    if (pickerTarget) {
                                        importPbom.mutate({ item: pickerTarget, documentType: opt.document_type });
                                    }
                                }}
                                right={(props) => <Ionicons name="chevron-forward" size={20} color="#ccc" />}
                                disabled={importPbom.isPending}
                            />
                        )}
                        ItemSeparatorComponent={Divider}
                    />
                    <TouchableOpacity
                        style={[styles.pillBtn, styles.pillBtnCancel]}
                        activeOpacity={0.8}
                        onPress={() => setPickerVisible(false)}>
                        <Text style={styles.pillBtnCancelText}>{t("search.cancel")}</Text>
                    </TouchableOpacity>
                </Modal>
            </Portal>

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
    modal: {
        backgroundColor: "#fff",
        marginHorizontal: 20,
        borderRadius: 12,
        padding: 20,
        maxHeight: "70%",
    },
    pillBtnCancel: {
        marginTop: 16,
        backgroundColor: "transparent",
        borderWidth: 1,
        borderColor: "#ddd",
    },
    pillBtnCancelText: {
        color: "#666",
        fontSize: 14,
        fontWeight: "600",
    },
});
