import React, { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Appbar, Snackbar } from 'react-native-paper';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import apiClient, { BASE_URL } from '../../src/api/client';

export default function DocumentViewerScreen() {
  const { id, filename } = useLocalSearchParams();
  const router = useRouter();
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [editUrl, setEditUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });
  const [refreshKey, setRefreshKey] = useState(0);

  // Listen for SAVED messages from the editor (opened in a new tab on web).
  // Increment refreshKey to force the iframe/WebView to re-fetch the PDF.
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'SAVED') {
        setRefreshKey((k) => k + 1);
        setSnackbar({ visible: true, message: 'Changes saved.' });
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const pdfUrl = `${BASE_URL}/workstations/documents/${id}/render?t=${refreshKey}`;

  const handleEdit = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.post('/workstations/open-editor', {
        documentId: Number(id),
        filename,
      });
      const url = res.data.editUrl;

      if (Platform.OS === 'web') {
        window.open(url, '_blank');
      } else {
        setEditUrl(url);
        setMode('edit');
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error || err.message || 'Failed to open editor';
      setSnackbar({ visible: true, message: msg });
    } finally {
      setLoading(false);
    }
  }, [id, filename]);

  const handleWebViewMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'SAVED') {
        setSnackbar({ visible: true, message: 'Changes saved.' });
        setTimeout(() => router.back(), 1200);
      }
    } catch {
      // ignore
    }
  }, [router]);

  if (Platform.OS === 'web') {
    return (
      <View style={styles.container}>
        <Appbar.Header>
          <Appbar.BackAction onPress={() => router.back()} />
          <Appbar.Content title={`${filename}`} />
          <Appbar.Action icon="pencil" onPress={handleEdit} disabled={loading} />
        </Appbar.Header>
        <View style={styles.viewerContainer}>
          <iframe
            src={pdfUrl}
            style={{ width: '100%', height: '100%', border: 'none' }}
            title={filename as string}
          />
        </View>
        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#fff" />
          </View>
        )}
        <Snackbar
          visible={snackbar.visible}
          onDismiss={() => setSnackbar({ ...snackbar, visible: false })}
        >
          {snackbar.message}
        </Snackbar>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={`${filename}`} />
        {mode === 'view' && (
          <Appbar.Action icon="pencil" onPress={handleEdit} disabled={loading} />
        )}
      </Appbar.Header>

      <View style={styles.viewerContainer}>
        {mode === 'view' ? (
          <WebView
            source={{ uri: pdfUrl }}
            style={{ flex: 1 }}
            originWhitelist={['*']}
            javaScriptEnabled={true}
            scrollEnabled={true}
          />
        ) : (
          <WebView
            source={{ uri: editUrl! }}
            style={{ flex: 1 }}
            originWhitelist={['*']}
            javaScriptEnabled={true}
            scrollEnabled={true}
            onMessage={handleWebViewMessage}
            sharedCookiesEnabled={true}
            domStorageEnabled={true}
          />
        )}
        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#fff" />
          </View>
        )}
      </View>

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ ...snackbar, visible: false })}
      >
        {snackbar.message}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  viewerContainer: { flex: 1, position: 'relative', backgroundColor: '#f5f5f5' },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
