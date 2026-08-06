import React, { useState, useCallback, useEffect, useRef } from "react";
import { View, StyleSheet, ActivityIndicator, Platform, TouchableOpacity } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Appbar, Snackbar, Portal, Modal, Menu, Text } from "react-native-paper";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import { Asset } from "expo-asset";
import { readAsStringAsync, writeAsStringAsync, cacheDirectory, EncodingType } from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import apiClient, { BASE_URL } from "../../src/api/client";
import { t } from "../../src/i18n";
import { CompletionContext, CompletionStatus } from "../../src/types";

interface Employee {
    id: number;
    name: string;
}

interface DocumentMeta {
    project_number: string | null;
    position: string | null;
    status: CompletionStatus | null;
    revisioned: boolean;
    completion: CompletionContext | null;
}

// Statuses that represent an order closed out without actually being
// finished — the "Finish order" action only applies to these.
const UNFINISHED_STATUSES: CompletionStatus[] = ["missing_product", "shipped_incomplete"];

interface Employee {
    id: number;
    name: string;
}

// Self-contained base64 encoder — avoids depending on btoa being polyfilled
// in the RN/Hermes runtime, which isn't guaranteed.
const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let result = "";
    for (let i = 0; i < bytes.length; i += 3) {
        const b1 = bytes[i]!;
        const b2 = i + 1 < bytes.length ? bytes[i + 1]! : undefined;
        const b3 = i + 2 < bytes.length ? bytes[i + 2]! : undefined;
        const triplet = (b1 << 16) | ((b2 ?? 0) << 8) | (b3 ?? 0);
        result += BASE64_CHARS[(triplet >> 18) & 0x3f];
        result += BASE64_CHARS[(triplet >> 12) & 0x3f];
        result += b2 !== undefined ? BASE64_CHARS[(triplet >> 6) & 0x3f] : "=";
        result += b3 !== undefined ? BASE64_CHARS[triplet & 0x3f] : "=";
    }
    return result;
}

export default function DocumentViewerScreen() {
    const { id, filename } = useLocalSearchParams();
    const router = useRouter();
    const webViewRef = useRef<WebView>(null);
    const [mode, setMode] = useState<"view" | "edit">("view");
    const [loading, setLoading] = useState(false);
    const [snackbar, setSnackbar] = useState({ visible: false, message: "" });
    const [refreshKey, setRefreshKey] = useState(0);
    const [editSrc, setEditSrc] = useState<string | null>(null);
    const [editHtml, setEditHtml] = useState<string | null>(null);
    const blobUrlRef = useRef<string | null>(null);

    // ── prep-station "print label" action ──
    // Needs this document's projectNumber/position, which the route params
    // don't carry — fetched from its own record.
    const { data: docMeta } = useQuery({
        queryKey: ["document-meta", id],
        queryFn: async () => {
            const response = await apiClient.get(`/files/${id}`);
            return response.data as DocumentMeta;
        },
    });
    const canPrintLabel = !!(docMeta?.project_number && docMeta?.position);

    // ── "Finish order" action ──
    // Only offered from inside an opened, revisioned document whose order
    // was closed as missing_product/shipped_incomplete — i.e. someone has
    // actually reviewed this document before finishing the order, not just
    // tapped a button from the overview list.
    const canFinishOrder =
        !!docMeta &&
        docMeta.revisioned &&
        !!docMeta.status &&
        UNFINISHED_STATUSES.includes(docMeta.status) &&
        !!docMeta.completion;

    const queryClient = useQueryClient();
    const [finishModalVisible, setFinishModalVisible] = useState(false);
    const [finishEmployeeMenuVisible, setFinishEmployeeMenuVisible] = useState(false);
    const [finishSelectedEmployee, setFinishSelectedEmployee] = useState<string | null>(null);

    const { data: finishEmployees } = useQuery<Employee[]>({
        queryKey: ["employees"],
        queryFn: async () => {
            const response = await apiClient.get("/employees");
            return response.data;
        },
        enabled: finishModalVisible,
    });

    const finishOrder = useMutation({
        mutationFn: async () => {
            if (!docMeta?.completion || !finishSelectedEmployee) return;
            const c = docMeta.completion;
            await apiClient.post("/workstations/order-completion", {
                orderId: c.order_id,
                workstation: c.workstation,
                cycleIndex: c.cycle_index,
                totalCycles: c.total_cycles,
                productOrder: c.product_order,
                projectNumber: docMeta.project_number,
                position: docMeta.position,
                salesOrder: c.sales_order,
                employeeName: finishSelectedEmployee,
                status: "complete",
            });
        },
        onSuccess: () => {
            setFinishModalVisible(false);
            setFinishSelectedEmployee(null);
            setSnackbar({ visible: true, message: t("document.finishSuccess") });
            queryClient.invalidateQueries({ queryKey: ["document-meta", id] });
            queryClient.invalidateQueries({ queryKey: ["documents-overview"] });
        },
        onError: (error: any) => {
            const msg = error?.response?.data?.error || error.message;
            setSnackbar({ visible: true, message: t("document.finishError", { msg }) });
        },
    });

    const [labelPickerVisible, setLabelPickerVisible] = useState(false);
    const [employeeMenuVisible, setEmployeeMenuVisible] = useState(false);
    const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);

    const { data: employees } = useQuery<Employee[]>({
        queryKey: ["employees"],
        queryFn: async () => {
            const response = await apiClient.get("/employees");
            return response.data;
        },
        enabled: labelPickerVisible,
    });

    const printLabel = useMutation({
        mutationFn: async () => {
            if (!docMeta?.project_number || !docMeta?.position || !selectedEmployee) return;
            const response = await apiClient.post(
                "/workstations/print-prep-label",
                {
                    projectNumber: docMeta.project_number,
                    position: docMeta.position,
                    employeeName: selectedEmployee,
                },
                { responseType: "arraybuffer" },
            );
            const filename = `label_${docMeta.project_number}_${docMeta.position}.pdf`;

            if (Platform.OS === "web") {
                const blob = new Blob([response.data], { type: "application/pdf" });
                const url = URL.createObjectURL(blob);
                window.open(url, "_blank");
                setTimeout(() => URL.revokeObjectURL(url), 60000);
                return;
            }

            const base64 = arrayBufferToBase64(response.data);
            const fileUri = `${cacheDirectory}${filename}`;
            await writeAsStringAsync(fileUri, base64, { encoding: EncodingType.Base64 });

            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(fileUri, {
                    mimeType: "application/pdf",
                    dialogTitle: t("document.printLabel"),
                    UTI: "com.adobe.pdf",
                });
            } else {
                throw new Error(t("document.sharingUnavailable"));
            }
        },
        onSuccess: () => {
            setLabelPickerVisible(false);
            setSelectedEmployee(null);
            setSnackbar({ visible: true, message: t("document.labelPrinted") });
        },
        onError: (error: any) => {
            const msg = error?.response?.data?.error || error.message;
            setSnackbar({ visible: true, message: t("document.labelPrintError", { msg }) });
        },
    });

    // Clean up blob URL when leaving edit mode or unmounting
    useEffect(() => {
        if (mode !== "edit" && blobUrlRef.current) {
            URL.revokeObjectURL(blobUrlRef.current);
            blobUrlRef.current = null;
        }
    }, [mode]);

    useEffect(() => {
        return () => {
            if (blobUrlRef.current) {
                URL.revokeObjectURL(blobUrlRef.current);
                blobUrlRef.current = null;
            }
        };
    }, []);

    const pdfUrl = `${BASE_URL}/workstations/documents/${id}/render?t=${refreshKey}`;

    // ── handle "edit" press ──
    const handleEdit = useCallback(async () => {
        setLoading(true);
        try {
            // Fetch PDF as base64
            const res = await apiClient.get(`/workstations/documents/${id}/render`, {
                responseType: "arraybuffer",
            });
            const pdfBytes = new Uint8Array(res.data);
            let binary = "";
            const chunk = 8192;
            for (let i = 0; i < pdfBytes.length; i += chunk) {
                binary += String.fromCharCode(...pdfBytes.slice(i, i + chunk));
            }
            const pdfBase64 = btoa(binary);

            if (Platform.OS === "web") {
                // ── Web: embed editor in-page via blob URL iframe ──
                const editorRes = await fetch(`/editor/index.html`);
                let html = await editorRes.text();

                const patch = `
<script>
window.__INLINE_MODE__=true;
window.__INLINE_PDF_DATA__="${pdfBase64}";
window.__INLINE_FILE_NAME__="${filename}";
window.ReactNativeWebView={postMessage:function(m){window.parent.postMessage(JSON.parse(m),"*")}};
</script>`;
                html = html.replace("</head>", patch + "</head>");
                if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
                const blob = new Blob([html], { type: "text/html" });
                blobUrlRef.current = URL.createObjectURL(blob);
                setEditSrc(blobUrlRef.current);
                setMode("edit");
            } else {
                // ── Native: read asset, patch PDF inline, use source={{ html }} ──
                const asset = Asset.fromModule(require("../../assets/editor/index.html"));
                await asset.downloadAsync();
                let html = await readAsStringAsync(asset.localUri!);
                const patch = `<script>window.__INLINE_MODE__=true;window.__INLINE_PDF_DATA__="${pdfBase64}";window.__INLINE_FILE_NAME__="${filename}";</script>`;
                html = html.replace("</head>", patch + "</head>");
                setEditHtml(html);
                setMode("edit");
            }
        } catch (err: any) {
            const msg = err?.message || t("document.editorError");
            setSnackbar({ visible: true, message: msg });
        } finally {
            setLoading(false);
        }
    }, [id, filename]);

    // ── listen for SAVED from editor (web iframe or window.open) ──
    useEffect(() => {
        if (Platform.OS !== "web") return;
        const handler = async (e: MessageEvent) => {
            if (e.data?.type !== "SAVED") return;
            const pdfBase64 = e.data.pdfBase64;
            if (pdfBase64) {
                setSnackbar({ visible: true, message: t("document.saving") });
                try {
                    await apiClient.post("/workstations/save-edited", {
                        documentId: Number(id),
                        pdfBase64,
                        filename: e.data.fileName || filename,
                    });
                    setSnackbar({ visible: true, message: t("document.saved") });
                } catch (err: any) {
                    setSnackbar({ visible: true, message: err?.response?.data?.error || err?.message || t("document.editorError") });
                    return;
                }
            }
            setTimeout(() => {
                setRefreshKey((k) => k + 1);
                setMode("view");
                setEditSrc(null);
            }, 500);
        };
        window.addEventListener("message", handler);
        return () => window.removeEventListener("message", handler);
    }, [id, filename]);

    // ── handle SAVED from native WebView ──
    const handleWebViewMessage = useCallback(
        async (event: WebViewMessageEvent) => {
            try {
                const msg = JSON.parse(event.nativeEvent.data);
                if (msg.type === "SAVED") {
                    if (msg.pdfBase64) {
                        setSnackbar({ visible: true, message: t("document.saving") });
                        try {
                            await apiClient.post("/workstations/save-edited", {
                                documentId: Number(id),
                                pdfBase64: msg.pdfBase64,
                                filename: msg.fileName || filename,
                            });
                            setSnackbar({ visible: true, message: t("document.saved") });
                        } catch (err: any) {
                            setSnackbar({ visible: true, message: err?.response?.data?.error || err?.message || t("document.editorError") });
                            return;
                        }
                    }
                    setTimeout(() => {
                        setRefreshKey((k) => k + 1);
                        setMode("view");
                        setEditHtml(null);
                    }, 500);
                }
            } catch (err: any) {
                setSnackbar({ visible: true, message: err?.message || t("document.editorError") });
            }
        },
        [id, filename],
    );

    const handleWebViewError = useCallback((event: any) => {
        console.log("WebView error:", event.nativeEvent);
    }, []);

    const employeePickerModal = (
        <Portal>
            <Modal
                visible={labelPickerVisible}
                onDismiss={() => setLabelPickerVisible(false)}
                contentContainerStyle={styles.modal}>
                <Text variant="titleLarge" style={{ marginBottom: 4 }}>
                    {t("document.printLabel")}
                </Text>
                <Text variant="bodyMedium" style={{ color: "#666", marginBottom: 16 }}>
                    {t("document.printLabelHint")}
                </Text>
                <Menu
                    visible={employeeMenuVisible}
                    onDismiss={() => setEmployeeMenuVisible(false)}
                    anchor={
                        <TouchableOpacity style={styles.dropdown} onPress={() => setEmployeeMenuVisible(true)}>
                            <Text style={selectedEmployee ? styles.dropdownText : styles.dropdownPlaceholder}>
                                {selectedEmployee ?? t("kiosk.selectEmployee")}
                            </Text>
                        </TouchableOpacity>
                    }>
                    {(employees ?? []).map((emp) => (
                        <Menu.Item
                            key={emp.id}
                            title={emp.name}
                            onPress={() => {
                                setSelectedEmployee(emp.name);
                                setEmployeeMenuVisible(false);
                            }}
                        />
                    ))}
                    {(employees ?? []).length === 0 && <Menu.Item title={t("kiosk.noEmployees")} disabled />}
                </Menu>
                <TouchableOpacity
                    style={[styles.confirmBtn, (!selectedEmployee || printLabel.isPending) && styles.confirmBtnDisabled]}
                    activeOpacity={0.8}
                    disabled={!selectedEmployee || printLabel.isPending}
                    onPress={() => printLabel.mutate()}>
                    {printLabel.isPending ?
                        <ActivityIndicator size="small" color="#fff" />
                    :   <Text style={styles.confirmBtnText}>{t("document.printLabelConfirm")}</Text>}
                </TouchableOpacity>
            </Modal>
        </Portal>
    );

    const finishModal = (
        <Portal>
            <Modal
                visible={finishModalVisible}
                onDismiss={() => setFinishModalVisible(false)}
                contentContainerStyle={styles.modal}>
                <Text variant="titleLarge" style={{ marginBottom: 4 }}>
                    {t("document.finishTitle")}
                </Text>
                <Text variant="bodyMedium" style={{ color: "#666", marginBottom: 16 }}>
                    {t("document.finishHint")}
                </Text>
                <Menu
                    visible={finishEmployeeMenuVisible}
                    onDismiss={() => setFinishEmployeeMenuVisible(false)}
                    anchor={
                        <TouchableOpacity style={styles.dropdown} onPress={() => setFinishEmployeeMenuVisible(true)}>
                            <Text style={finishSelectedEmployee ? styles.dropdownText : styles.dropdownPlaceholder}>
                                {finishSelectedEmployee ?? t("kiosk.selectEmployee")}
                            </Text>
                        </TouchableOpacity>
                    }>
                    {(finishEmployees ?? []).map((emp) => (
                        <Menu.Item
                            key={emp.id}
                            title={emp.name}
                            onPress={() => {
                                setFinishSelectedEmployee(emp.name);
                                setFinishEmployeeMenuVisible(false);
                            }}
                        />
                    ))}
                    {(finishEmployees ?? []).length === 0 && <Menu.Item title={t("kiosk.noEmployees")} disabled />}
                </Menu>
                <TouchableOpacity
                    style={[
                        styles.confirmBtn,
                        (!finishSelectedEmployee || finishOrder.isPending) && styles.confirmBtnDisabled,
                    ]}
                    activeOpacity={0.8}
                    disabled={!finishSelectedEmployee || finishOrder.isPending}
                    onPress={() => finishOrder.mutate()}>
                    {finishOrder.isPending ?
                        <ActivityIndicator size="small" color="#fff" />
                    :   <Text style={styles.confirmBtnText}>{t("document.finishConfirm")}</Text>}
                </TouchableOpacity>
            </Modal>
        </Portal>
    );

    // ── web render ──
    if (Platform.OS === "web") {
        return (
            <View style={styles.container}>
                <Appbar.Header>
                    <Appbar.BackAction onPress={() => router.back()} />
                    <Appbar.Content title={mode === "edit" ? t("document.editing") : `${filename}`} />
                    {mode === "view" && canFinishOrder && (
                        <Appbar.Action
                            icon="flag-checkered"
                            color="#2e7d32"
                            onPress={() => setFinishModalVisible(true)}
                            disabled={loading}
                        />
                    )}
                    {mode === "view" && canPrintLabel && (
                        <Appbar.Action icon="printer" onPress={() => setLabelPickerVisible(true)} disabled={loading} />
                    )}
                    {mode === "view" && <Appbar.Action icon="pencil" onPress={handleEdit} disabled={loading} />}
                </Appbar.Header>
                <View style={styles.viewerContainer}>
                    {mode === "view" ?
                        <iframe
                            src={pdfUrl}
                            style={{ width: "100%", height: "100%", border: "none" }}
                            title={filename as string}
                        />
                    : editSrc ?
                        <iframe
                            src={editSrc}
                            style={{ width: "100%", height: "100%", border: "none" }}
                            title={t("document.iframeTitle")}
                        />
                    :   null}
                </View>
                {loading && (
                    <View style={styles.loadingOverlay}>
                        <ActivityIndicator size="large" color="#fff" />
                    </View>
                )}
                <Snackbar visible={snackbar.visible} onDismiss={() => setSnackbar({ ...snackbar, visible: false })}>
                    {snackbar.message}
                </Snackbar>
                {employeePickerModal}
                {finishModal}
            </View>
        );
    }

    // ── native render ──
    return (
        <View style={styles.container}>
            <Appbar.Header>
                <Appbar.BackAction onPress={() => router.back()} />
                <Appbar.Content title={mode === "edit" ? t("document.editing") : `${filename}`} />
                {mode === "view" && canFinishOrder && (
                    <Appbar.Action
                        icon="flag-checkered"
                        color="#2e7d32"
                        onPress={() => setFinishModalVisible(true)}
                        disabled={loading}
                    />
                )}
                {mode === "view" && canPrintLabel && (
                    <Appbar.Action icon="printer" onPress={() => setLabelPickerVisible(true)} disabled={loading} />
                )}
                {mode === "view" && <Appbar.Action icon="pencil" onPress={handleEdit} disabled={loading} />}
            </Appbar.Header>

            <View style={styles.viewerContainer}>
                {mode === "view" ?
                    <WebView
                        source={{
                            html: getPdfViewerHtml(
                                pdfUrl,
                                filename as string,
                                t("document.viewerLoading"),
                                t("document.viewerError"),
                            ),
                        }}
                        style={{ flex: 1 }}
                        originWhitelist={["*"]}
                        javaScriptEnabled={true}
                        scrollEnabled={true}
                    />
                : editHtml ?
                    <WebView
                        ref={webViewRef}
                        source={{ html: editHtml }}
                        style={{ flex: 1 }}
                        originWhitelist={["*"]}
                        javaScriptEnabled={true}
                        scrollEnabled={true}
                        onMessage={handleWebViewMessage}
                        onError={handleWebViewError}
                    />
                :   null}
                {loading && (
                    <View style={styles.loadingOverlay}>
                        <ActivityIndicator size="large" color="#fff" />
                    </View>
                )}
            </View>

            <Snackbar visible={snackbar.visible} onDismiss={() => setSnackbar({ ...snackbar, visible: false })}>
                {snackbar.message}
            </Snackbar>
            {employeePickerModal}
            {finishModal}
        </View>
    );
}

function getPdfViewerHtml(url: string, docName: string, loadingText: string, errorPrefix: string) {
    const safeUrl = JSON.stringify(url);
    const safeDocName = docName.replace(/[<>]/g, "");
    const safeLoadingText = loadingText.replace(/[<>]/g, "");
    const safeErrorPrefix = errorPrefix.replace(/[<>]/g, "");
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=3.0">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #525659; font-family: sans-serif; overflow-x: auto; }
    #viewer { width: 100%; }
    .page { display: flex; justify-content: flex-start; margin-bottom: 8px; padding-left: 8px; }
    .page canvas { box-shadow: 0 2px 8px rgba(0,0,0,0.3); }
    .error { color: #fff; text-align: center; padding: 40px 20px; font-size: 16px; }
    .loading-wrap { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:60px 20px; gap:16px; }
    .spinner { width:32px; height:32px; border:3px solid rgba(255,255,255,0.15); border-top-color:#ff5100; border-radius:50%; animation:spin .8s linear infinite; }
    @keyframes spin { to { transform:rotate(360deg); } }
    .loading-name { color:#aaa; font-size:13px; text-align:center; }
  </style>
</head>
<body>
  <div id="viewer"><div class="loading-wrap"><div class="spinner"></div><div class="loading-name">${safeLoadingText}<br>${safeDocName}</div></div></div>
  <script>
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    pdfjsLib.getDocument(${safeUrl}).promise.then(function(pdf) {
      document.getElementById('viewer').innerHTML = '';
      for (var i = 1; i <= pdf.numPages; i++) {
        (function(pageNum) {
          pdf.getPage(pageNum).then(function(page) {
            var scale = (window.devicePixelRatio || 1) * 1.25;
            var viewport = page.getViewport({ scale: scale });
            var wrapper = document.createElement('div');
            wrapper.className = 'page';
            var canvas = document.createElement('canvas');
            canvas.style.width = (viewport.width / scale) + 'px';
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            wrapper.appendChild(canvas);
            document.getElementById('viewer').appendChild(wrapper);
            page.render({
              canvasContext: canvas.getContext('2d'),
              viewport: viewport
            });
          });
        })(i);
      }
    }).catch(function(err) {
      document.getElementById('viewer').innerHTML = '<div class="error">' + safeErrorPrefix + ' ' + err.message + '</div>';
    });
  </script>
</body>
</html>`;
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#fff" },
    viewerContainer: { flex: 1, position: "relative", backgroundColor: "#f5f5f5" },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(0,0,0,0.3)",
        justifyContent: "center",
        alignItems: "center",
    },
    modal: {
        backgroundColor: "#fff",
        marginHorizontal: 24,
        borderRadius: 16,
        padding: 24,
    },
    dropdown: {
        borderWidth: 1,
        borderColor: "#ddd",
        borderRadius: 8,
        paddingHorizontal: 14,
        paddingVertical: 12,
        marginBottom: 16,
    },
    dropdownText: { fontSize: 16 },
    dropdownPlaceholder: { fontSize: 16, color: "#aaa" },
    confirmBtn: {
        backgroundColor: "#ff5100",
        borderRadius: 10,
        paddingVertical: 16,
        alignItems: "center",
    },
    confirmBtnDisabled: { backgroundColor: "#f0c4a8" },
    confirmBtnText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
});
