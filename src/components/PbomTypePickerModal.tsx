import React from "react";
import { FlatList, StyleSheet, TouchableOpacity } from "react-native";
import { Portal, Modal, Text, Divider, List } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { t } from "../i18n";
import { PbomTypeOption } from "../hooks/useOpenOrderByCode";

export interface PbomTypePickerModalProps {
    visible: boolean;
    options: PbomTypeOption[];
    disabled?: boolean;
    onDismiss: () => void;
    onSelect: (documentType: number) => void;
}

/** Shown when a resolved order/position has more than one BOM type available
 * — reused by both the Search tab and the barcode scanner. */
export default function PbomTypePickerModal({
    visible,
    options,
    disabled,
    onDismiss,
    onSelect,
}: PbomTypePickerModalProps) {
    return (
        <Portal>
            <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={styles.modal}>
                <Text variant="titleMedium" style={{ marginBottom: 4 }}>
                    {t("search.selectType")}
                </Text>
                <Text variant="bodySmall" style={{ color: "#999", marginBottom: 12 }}>
                    {t("search.selectTypeHint")}
                </Text>
                <FlatList
                    data={options}
                    keyExtractor={(opt) => String(opt.document_type)}
                    renderItem={({ item: opt }) => (
                        <List.Item
                            title={t(`docType.${opt.name}`, { defaultValue: opt.name })}
                            onPress={() => onSelect(opt.document_type)}
                            right={() => <Ionicons name="chevron-forward" size={20} color="#ccc" />}
                            disabled={disabled}
                        />
                    )}
                    ItemSeparatorComponent={Divider}
                />
                <TouchableOpacity style={styles.pillBtnCancel} activeOpacity={0.8} onPress={onDismiss}>
                    <Text style={styles.pillBtnCancelText}>{t("search.cancel")}</Text>
                </TouchableOpacity>
            </Modal>
        </Portal>
    );
}

const styles = StyleSheet.create({
    modal: {
        backgroundColor: "#fff",
        marginHorizontal: 20,
        borderRadius: 12,
        padding: 20,
        maxHeight: "70%",
    },
    pillBtnCancel: {
        marginTop: 16,
        borderRadius: 20,
        paddingHorizontal: 24,
        height: 40,
        justifyContent: "center",
        alignItems: "center",
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
