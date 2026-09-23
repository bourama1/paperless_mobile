import React, { useState } from "react";
import { View, StyleSheet, ActivityIndicator, TouchableOpacity, FlatList } from "react-native";
import { Text, TextInput, IconButton, Divider } from "react-native-paper";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "../api/client";
import { t } from "../i18n";

interface PrepBaanCode {
    id: number;
    code: string;
    description: string | null;
}

/**
 * Admin panel for which BAAN codes the prep checklist shows, out of an
 * order's non-PTL items (see ptlPlanService on the backend). Codes can be
 * pasted as a whole block — one per line, or separated by spaces/commas.
 * An empty list means no filtering (every non-PTL item is shown).
 */
export default function BaanCodesAdmin({
    authHeaders,
    onMessage,
}: {
    authHeaders: Record<string, string>;
    onMessage: (message: string) => void;
}) {
    const queryClient = useQueryClient();
    const [codesInput, setCodesInput] = useState("");
    const [descriptionInput, setDescriptionInput] = useState("");

    const { data: codes, isLoading, isError } = useQuery<PrepBaanCode[]>({
        queryKey: ["prep-baan-codes"],
        queryFn: async () => (await apiClient.get("/employees/admin/prep-baan-codes", { headers: authHeaders })).data,
    });

    const onError = (error: any) => onMessage(error?.response?.data?.error || error.message);

    const addCodes = useMutation({
        mutationFn: async () =>
            (
                await apiClient.post(
                    "/employees/admin/prep-baan-codes",
                    { codes: codesInput, description: descriptionInput },
                    { headers: authHeaders },
                )
            ).data as { added: number; codes: PrepBaanCode[] },
        onSuccess: (data) => {
            queryClient.setQueryData(["prep-baan-codes"], data.codes);
            setCodesInput("");
            setDescriptionInput("");
            onMessage(t("admin.baanAdded", { count: data.added }));
        },
        onError,
    });

    const deleteCode = useMutation({
        mutationFn: async (id: number) =>
            apiClient.delete(`/employees/admin/prep-baan-codes/${id}`, { headers: authHeaders }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["prep-baan-codes"] }),
        onError,
    });

    return (
        <View style={styles.container}>
            <Text variant="bodySmall" style={styles.hint}>
                {t("admin.baanHint")}
            </Text>
            <TextInput
                mode="outlined"
                label={t("admin.baanCodes")}
                value={codesInput}
                onChangeText={setCodesInput}
                multiline
                autoCapitalize="characters"
                style={styles.input}
            />
            <TextInput
                mode="outlined"
                label={t("admin.baanDescription")}
                value={descriptionInput}
                onChangeText={setDescriptionInput}
                style={styles.input}
            />
            <TouchableOpacity
                style={[styles.addBtn, (!codesInput.trim() || addCodes.isPending) && styles.addBtnDisabled]}
                activeOpacity={0.8}
                disabled={!codesInput.trim() || addCodes.isPending}
                onPress={() => addCodes.mutate()}>
                {addCodes.isPending ?
                    <ActivityIndicator size="small" color="#fff" />
                :   <Text style={styles.addBtnText}>{t("admin.baanAdd")}</Text>}
            </TouchableOpacity>

            <Divider style={{ marginVertical: 12 }} />

            {isLoading ?
                <ActivityIndicator size="large" style={{ marginTop: 24 }} />
            : isError ?
                <Text style={styles.center}>{t("admin.loadError")}</Text>
            :   <FlatList
                    data={codes}
                    keyExtractor={(item) => String(item.id)}
                    ListHeaderComponent={
                        <Text variant="labelLarge" style={{ marginBottom: 4 }}>
                            {codes && codes.length > 0 ?
                                t("admin.baanCount", { count: codes.length })
                            :   t("admin.baanEmpty")}
                        </Text>
                    }
                    renderItem={({ item }) => (
                        <View style={styles.row}>
                            <View style={{ flex: 1 }}>
                                <Text variant="titleSmall">{item.code}</Text>
                                {item.description ?
                                    <Text variant="bodySmall" style={{ color: "#666" }}>
                                        {item.description}
                                    </Text>
                                :   null}
                            </View>
                            <IconButton
                                icon="delete-outline"
                                disabled={deleteCode.isPending}
                                onPress={() => deleteCode.mutate(item.id)}
                            />
                        </View>
                    )}
                />
            }
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 12 },
    hint: { color: "#666", marginBottom: 8 },
    input: { marginBottom: 8 },
    center: { textAlign: "center", marginTop: 24 },
    row: {
        flexDirection: "row",
        alignItems: "center",
        borderBottomWidth: 1,
        borderBottomColor: "#f0f0f0",
    },
    addBtn: { backgroundColor: "#ff5100", borderRadius: 10, paddingVertical: 14, alignItems: "center" },
    addBtnDisabled: { backgroundColor: "#f0c4a8" },
    addBtnText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
});
