import React, { useEffect, useRef } from "react";
import { Modal, StyleSheet, View, TouchableOpacity } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { t } from "../i18n";

export interface BarcodeScannerModalProps {
    visible: boolean;
    onDismiss: () => void;
    onScanned: (code: string) => void;
    /** True while the caller is resolving the last scanned code — new scans
     * are ignored until it goes back to false, so the same still-visible
     * barcode can't fire a second lookup mid-request. */
    resolving: boolean;
    /** Shown over the camera when the last scan didn't resolve to anything
     * — the camera stays open/active so the worker can immediately retry. */
    errorMessage?: string | null;
}

/** Full-screen Code 39 barcode scanner, used to jump straight to an order's
 * BOM from its prep-label barcode instead of searching for it by hand. */
export default function BarcodeScannerModal({
    visible,
    onDismiss,
    onScanned,
    resolving,
    errorMessage,
}: BarcodeScannerModalProps) {
    const [permission, requestPermission] = useCameraPermissions();
    // Guards against CameraView firing onBarcodeScanned repeatedly for the
    // same still-visible barcode before `resolving` has flipped true.
    const scannedRef = useRef(false);

    useEffect(() => {
        if (visible) scannedRef.current = false;
    }, [visible]);
    useEffect(() => {
        if (!resolving) scannedRef.current = false;
    }, [resolving]);

    const handleScanned = ({ data }: { data: string }) => {
        if (scannedRef.current || resolving) return;
        scannedRef.current = true;
        onScanned(data);
    };

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onDismiss}>
            <View style={styles.container}>
                {/* RN's Modal keeps its subtree mounted even while
                    visible=false, so the camera itself is gated on `visible`
                    here too — otherwise it'd keep the sensor/preview running
                    in the background after the modal is dismissed. */}
                {!visible ? null : !permission ? null : !permission.granted ? (
                    <View style={styles.permissionContainer}>
                        <Text variant="bodyLarge" style={styles.permissionText}>
                            {t("scan.permissionHint")}
                        </Text>
                        <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
                            <Text style={styles.permissionBtnText}>{t("scan.permissionAllow")}</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <CameraView
                        style={StyleSheet.absoluteFill}
                        facing="back"
                        barcodeScannerSettings={{ barcodeTypes: ["code39"] }}
                        onBarcodeScanned={handleScanned}
                    />
                )}

                {!!errorMessage && (
                    <View style={styles.errorBanner}>
                        <Text style={styles.errorText}>{errorMessage}</Text>
                    </View>
                )}

                <TouchableOpacity style={styles.closeBtn} onPress={onDismiss} activeOpacity={0.8}>
                    <Ionicons name="close" size={28} color="#fff" />
                </TouchableOpacity>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#000" },
    permissionContainer: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
    },
    permissionText: { color: "#fff", textAlign: "center", marginBottom: 20 },
    permissionBtn: {
        backgroundColor: "#ff5100",
        borderRadius: 10,
        paddingVertical: 12,
        paddingHorizontal: 24,
    },
    permissionBtnText: { color: "#fff", fontWeight: "bold" },
    closeBtn: {
        position: "absolute",
        top: 48,
        right: 20,
        backgroundColor: "rgba(0,0,0,0.5)",
        borderRadius: 20,
        padding: 6,
    },
    errorBanner: {
        position: "absolute",
        bottom: 48,
        left: 20,
        right: 20,
        backgroundColor: "rgba(198,40,40,0.9)",
        borderRadius: 10,
        padding: 14,
    },
    errorText: { color: "#fff", textAlign: "center", fontWeight: "600" },
});
