import React, { useState } from "react";
import { StyleSheet, ActivityIndicator, TouchableOpacity } from "react-native";
import { Portal, Modal, Text, TextInput } from "react-native-paper";
import apiClient from "../api/client";
import { t } from "../i18n";

/**
 * Asks for the admin PIN (backend EMPLOYEE_ADMIN_PIN) behind the hidden
 * admin actions — the admin screen (Stats tab) and manual completion
 * (document viewer). The PIN is verified with a real request before
 * onUnlocked is called, so a wrong guess never gets further; the caller
 * keeps the verified PIN only as long as it needs it (in memory).
 */
export default function AdminPinModal({
    visible,
    onDismiss,
    onUnlocked,
}: {
    visible: boolean;
    onDismiss: () => void;
    onUnlocked: (pin: string) => void;
}) {
    const [pin, setPin] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [verifying, setVerifying] = useState(false);

    const close = () => {
        setPin("");
        setError(null);
        onDismiss();
    };

    const unlock = async () => {
        if (!pin || verifying) return;
        setVerifying(true);
        setError(null);
        try {
            await apiClient.get("/employees/admin", { headers: { "X-Admin-Pin": pin } });
            const verifiedPin = pin;
            setPin("");
            onUnlocked(verifiedPin);
        } catch (err: any) {
            setError(err?.response?.status === 401 ? t("stats.adminPinWrong") : t("stats.adminPinError"));
        } finally {
            setVerifying(false);
        }
    };

    return (
        <Portal>
            <Modal visible={visible} onDismiss={close} contentContainerStyle={styles.modal}>
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
                    onSubmitEditing={unlock}
                />
                {error && <Text style={{ color: "#c62828", marginTop: 8 }}>{error}</Text>}
                <TouchableOpacity
                    style={[styles.confirmBtn, (!pin || verifying) && styles.confirmBtnDisabled]}
                    activeOpacity={0.8}
                    disabled={!pin || verifying}
                    onPress={unlock}>
                    {verifying ?
                        <ActivityIndicator size="small" color="#fff" />
                    :   <Text style={styles.confirmBtnText}>{t("stats.adminUnlock")}</Text>}
                </TouchableOpacity>
            </Modal>
        </Portal>
    );
}

const styles = StyleSheet.create({
    modal: { backgroundColor: "#fff", marginHorizontal: 24, borderRadius: 16, padding: 24 },
    confirmBtn: {
        backgroundColor: "#ff5100",
        borderRadius: 10,
        paddingVertical: 16,
        alignItems: "center",
        marginTop: 12,
    },
    confirmBtnDisabled: { backgroundColor: "#f0c4a8" },
    confirmBtnText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
});
