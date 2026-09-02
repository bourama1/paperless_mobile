import React from "react";
import { View, StyleSheet } from "react-native";
import { Text, Button, ActivityIndicator } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { useConnectivity } from "../hooks/useConnectivity";
import { t } from "../i18n";

/**
 * Rendered once at the root of the app (see app/_layout.tsx), sitting on
 * top of whatever screen is currently active. Previously, losing the
 * connection to the backend left the app on a blank/frozen screen with no
 * explanation — this instead covers the screen with a clear message and a
 * retry option the moment either the REST API or the socket connection
 * drops, and hides itself the instant connectivity is confirmed again.
 */
export default function ConnectionErrorOverlay() {
    const { isReachable, retrying, retry } = useConnectivity();

    if (isReachable) return null;

    return (
        <View style={styles.overlay} pointerEvents="auto">
            <Ionicons name="cloud-offline-outline" size={64} color="#909090" />
            <Text variant="titleLarge" style={styles.title}>
                {t("connectivity.title")}
            </Text>
            <Text variant="bodyMedium" style={styles.subtitle}>
                {t("connectivity.subtitle")}
            </Text>
            {retrying ? (
                <View style={styles.retryingRow}>
                    <ActivityIndicator size="small" />
                    <Text variant="bodyMedium" style={styles.retryingText}>
                        {t("connectivity.retrying")}
                    </Text>
                </View>
            ) : (
                <Button mode="contained" onPress={retry} style={styles.retryButton}>
                    {t("connectivity.retry")}
                </Button>
            )}
            <Text variant="bodySmall" style={styles.autoRetryHint}>
                {t("connectivity.autoRetryHint")}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "#ffffff",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
        zIndex: 1000,
        elevation: 1000,
    },
    title: {
        marginTop: 16,
        textAlign: "center",
        fontWeight: "bold",
    },
    subtitle: {
        marginTop: 8,
        textAlign: "center",
        color: "#666666",
    },
    retryButton: {
        marginTop: 24,
        minWidth: 160,
    },
    retryingRow: {
        marginTop: 24,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    retryingText: {
        color: "#666666",
    },
    autoRetryHint: {
        marginTop: 16,
        textAlign: "center",
        color: "#a0a0a0",
    },
});
