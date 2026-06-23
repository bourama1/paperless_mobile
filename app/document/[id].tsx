import React, { useState, useCallback, useEffect, useRef } from "react";
import { View, StyleSheet, ActivityIndicator, Platform } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Appbar, Snackbar } from "react-native-paper";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import { Asset } from "expo-asset";
import { readAsStringAsync } from "expo-file-system/legacy";
import apiClient, { BASE_URL } from "../../src/api/client";

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

    // Clean up blob URL when leaving edit mode
    useEffect(() => {
        if (mode !== "edit" && blobUrlRef.current) {
            URL.revokeObjectURL(blobUrlRef.current);
            blobUrlRef.current = null;
        }
    }, [mode]);

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
            const msg = err?.message || "Nepodařilo se otevřít editor";
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
                setSnackbar({ visible: true, message: "Ukládání změn..." });
                try {
                    await apiClient.post("/workstations/save-edited", {
                        documentId: Number(id),
                        pdfBase64,
                        filename: e.data.fileName || filename,
                    });
                } catch {
                    /* ignore */
                }
            }
            setSnackbar({ visible: true, message: "Změny uloženy." });
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
                        setSnackbar({ visible: true, message: "Ukládání změn..." });
                        await apiClient.post("/workstations/save-edited", {
                            documentId: Number(id),
                            pdfBase64: msg.pdfBase64,
                            filename: msg.fileName || filename,
                        });
                    }
                    setSnackbar({ visible: true, message: "Změny uloženy." });
                    setTimeout(() => {
                            setRefreshKey((k) => k + 1);
                            setMode("view");
                            setEditHtml(null);
                        }, 500);
                }
            } catch {
                // ignore
            }
        },
        [id, filename],
    );

    const handleWebViewError = useCallback(
        (event: any) => {
            console.log("WebView error:", event.nativeEvent);
        },
        [],
    );

    // ── web render ──
    if (Platform.OS === "web") {
        return (
            <View style={styles.container}>
                <Appbar.Header>
                    <Appbar.BackAction onPress={() => router.back()} />
                    <Appbar.Content title={mode === "edit" ? "Úpravy..." : `${filename}`} />
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
                            title="PDF Editor"
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
            </View>
        );
    }

    // ── native render ──
    return (
        <View style={styles.container}>
            <Appbar.Header>
                <Appbar.BackAction onPress={() => router.back()} />
                <Appbar.Content title={mode === "edit" ? "Úpravy..." : `${filename}`} />
                {mode === "view" && <Appbar.Action icon="pencil" onPress={handleEdit} disabled={loading} />}
            </Appbar.Header>

            <View style={styles.viewerContainer}>
                {mode === "view" ?
                    <WebView
                        source={{ html: getPdfViewerHtml(pdfUrl) }}
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
        </View>
    );
}

function getPdfViewerHtml(url: string) {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=3.0">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #525659; }
    #viewer { width: 100%; }
    .page { display: flex; justify-content: center; margin-bottom: 8px; }
    .page canvas { box-shadow: 0 2px 8px rgba(0,0,0,0.3); }
    .error { color: #fff; text-align: center; padding: 40px 20px; font-family: sans-serif; font-size: 16px; }
    .loading { color: #aaa; text-align: center; padding: 40px 20px; font-family: sans-serif; font-size: 16px; }
  </style>
</head>
<body>
  <div id="viewer"><div class="loading">Načítání PDF...</div></div>
  <script>
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    pdfjsLib.getDocument('${url}').promise.then(function(pdf) {
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
      document.getElementById('viewer').innerHTML = '<div class="error">Chyba při načítání PDF: ' + err.message + '</div>';
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
});
