import React, { useState, useMemo, useRef, useEffect } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Appbar, Snackbar } from 'react-native-paper';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import apiClient, { BASE_URL } from '../../src/api/client';
import { Document } from '../../src/types';

type AnnotationPayload = {
  page: number;
  width: number;
  height: number;
  d: string;
};

export default function DocumentViewerScreen() {
  const { id, filename, version, annotations } = useLocalSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const webviewRef = useRef<any>(null);

  const initialAnnotations = useMemo<AnnotationPayload[]>(() => {
    try {
      const raw = annotations ? JSON.parse(annotations as string) : [];
      if (!Array.isArray(raw)) {
        return [];
      }

      if (raw.length === 0) {
        return [];
      }

      if (typeof raw[0] === 'string') {
        return (raw as string[]).map(path => ({ page: 1, width: 0, height: 0, d: path }));
      }

      return (raw as AnnotationPayload[]).map(item => ({
        page: item.page || 1,
        width: item.width || 0,
        height: item.height || 0,
        d: item.d || '',
      }));
    } catch (e) {
      return [];
    }
  }, [annotations]);

  const [annotationPaths, setAnnotationPaths] = useState<AnnotationPayload[]>(initialAnnotations);
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });
  const [mode, setMode] = useState<'navigate' | 'draw'>('navigate');

  const uploadMutation = useMutation({
    mutationFn: async () => {
      console.log('--- STARTING UPLOAD PROCESS ---');

      const documents = queryClient.getQueryData<Document[]>(['documents']);
      const currentDoc = documents?.find(d => d.id === Number(id));
      const originalName = currentDoc?.name || (filename as string);

      const pdfUrl = `${BASE_URL}/files/${originalName}`;
      const localUri = `${FileSystem.cacheDirectory}${originalName}`;

      console.log(`[Upload] Step 1: Downloading original PDF from ${pdfUrl}...`);
      const downloadResult = await FileSystem.downloadAsync(pdfUrl, localUri);

      if (downloadResult.status !== 200) {
        throw new Error(`Failed to download original PDF (Status: ${downloadResult.status})`);
      }
      console.log(`[Upload] Step 2: Downloaded to ${downloadResult.uri}`);

      const formData = new FormData();

      if (Platform.OS !== 'web') {
        const file = {
          uri: downloadResult.uri,
          name: originalName,
          type: 'application/pdf',
        } as any;
        formData.append('file', file);
      } else {
        const blob = new Blob(['dummy'], { type: 'application/pdf' });
        formData.append('file', blob, originalName);
      }

      formData.append('annotations', JSON.stringify(annotationPaths));
      formData.append('canvasWidth', annotationPaths[0]?.width?.toString() || '0');
      formData.append('canvasHeight', annotationPaths[0]?.height?.toString() || '0');

      const response = await apiClient.post(`/files/${id}/revise`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        transformRequest: data => data,
        timeout: 60000,
      });

      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      setSnackbar({ visible: true, message: 'Revision saved successfully!' });
      setTimeout(() => router.back(), 1500);
    },
    onError: (error: any) => {
      const errorMsg = error?.response?.data?.error || error.message;
      setSnackbar({ visible: true, message: `Save failed: ${errorMsg}` });
    },
  });

  const pdfUrl = `${BASE_URL}/files/${filename}`;

  const pdfHtml = useMemo(() => {
    const encodedAnnotations = JSON.stringify(initialAnnotations);
    return `
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=5.0, user-scalable=yes" />
        <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js"></script>
        <style>
          html, body { width: 100%; height: 100%; margin: 0; padding: 0; background: #f0f0f0; touch-action: pan-x pan-y pinch-zoom; overflow: auto; -webkit-overflow-scrolling: touch; }
          body { user-select: none; }
          #viewer { position: relative; width: 100%; }
          .page-container { position: relative; width: 100%; display: inline-block; margin-bottom: 8px; }
          .page-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
          .page-number { position: absolute; top: 10px; left: 10px; background: rgba(0,0,0,0.65); color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; z-index: 10; }
        </style>
      </head>
      <body>
        <div id="viewer"></div>
        <script>
          const url = '${pdfUrl}';
          const initialAnnotations = ${encodedAnnotations};
          const pdfjsLib = window['pdfjs-dist/build/pdf'];
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

          const viewer = document.getElementById('viewer');
          let currentMode = 'navigate';
          const annotations = Array.isArray(initialAnnotations) ? initialAnnotations : [];

          const sendAnnotations = () => {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ANNOTATIONS', annotations }));
          };

          const setMode = (mode) => {
            currentMode = mode;
            document.body.style.touchAction = mode === 'draw' ? 'none' : 'pan-x pan-y pinch-zoom';
            document.querySelectorAll('.page-overlay').forEach((overlay) => {
              overlay.style.pointerEvents = mode === 'draw' ? 'auto' : 'none';
            });
          };

          const createOverlay = (pageNumber, width, height) => {
            const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            overlay.setAttribute('class', 'page-overlay');
            overlay.setAttribute('data-page', String(pageNumber));
            overlay.setAttribute('width', String(width));
            overlay.setAttribute('height', String(height));
            overlay.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
            overlay.style.pointerEvents = currentMode === 'draw' ? 'auto' : 'none';
            overlay.style.background = 'transparent';

            let currentPath = null;
            let currentString = '';

            const getLocalPoint = (event) => {
              const rect = overlay.getBoundingClientRect();
              const x = event.clientX - rect.left;
              const y = event.clientY - rect.top;
              const svgX = x * (width / rect.width);
              const svgY = y * (height / rect.height);
              return { x: svgX, y: svgY };
            };

            const finishPath = () => {
              if (!currentString) return;
              annotations.push({ page: pageNumber, width, height, d: currentString });
              sendAnnotations();
              currentPath = null;
              currentString = '';
            };

            overlay.addEventListener('pointerdown', (event) => {
              if (currentMode !== 'draw') return;
              event.preventDefault();
              overlay.setPointerCapture(event.pointerId);
              const point = getLocalPoint(event);
              currentString = 'M' + point.x + ',' + point.y;
              currentPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
              currentPath.setAttribute('d', currentString);
              currentPath.setAttribute('stroke', 'red');
              currentPath.setAttribute('stroke-width', '3');
              currentPath.setAttribute('fill', 'none');
              overlay.appendChild(currentPath);
            });

            overlay.addEventListener('pointermove', (event) => {
              if (!currentPath || currentMode !== 'draw') return;
              event.preventDefault();
              const point = getLocalPoint(event);
              currentString += ' L' + point.x + ',' + point.y;
              currentPath.setAttribute('d', currentString);
            });

            overlay.addEventListener('pointerup', (event) => {
              if (currentMode !== 'draw') return;
              event.preventDefault();
              finishPath();
            });
            overlay.addEventListener('pointercancel', () => finishPath());
            overlay.addEventListener('pointerleave', () => finishPath());

            return overlay;
          };

          const renderSavedAnnotations = (overlay, pageNumber) => {
            annotations.forEach((annotation) => {
              if (annotation.page !== pageNumber) return;
              const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
              pathEl.setAttribute('d', annotation.d);
              pathEl.setAttribute('stroke', 'red');
              pathEl.setAttribute('stroke-width', '3');
              pathEl.setAttribute('fill', 'none');
              overlay.appendChild(pathEl);
            });
          };

          const loadPdf = async () => {
            const loadingTask = pdfjsLib.getDocument(url);
            const pdf = await loadingTask.promise;
            for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
              const page = await pdf.getPage(pageNumber);
              const viewport = page.getViewport({ scale: 1.5 });
              const pageContainer = document.createElement('div');
              pageContainer.className = 'page-container';
              pageContainer.style.width = '100%';

              const pageNumberBadge = document.createElement('div');
              pageNumberBadge.className = 'page-number';
              pageNumberBadge.textContent = 'Page ' + pageNumber;

              const canvas = document.createElement('canvas');
              canvas.width = viewport.width;
              canvas.height = viewport.height;
              canvas.style.width = '100%';
              canvas.style.height = 'auto';
              canvas.style.display = 'block';

              const context = canvas.getContext('2d');
              await page.render({ canvasContext: context, viewport }).promise;

              const overlay = createOverlay(pageNumber, viewport.width, viewport.height);
              renderSavedAnnotations(overlay, pageNumber);

              pageContainer.appendChild(pageNumberBadge);
              pageContainer.appendChild(canvas);
              pageContainer.appendChild(overlay);
              viewer.appendChild(pageContainer);
            }
          };

          const handleMessage = (event) => {
            try {
              const msg = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
              if (msg.type === 'SET_MODE') {
                setMode(msg.mode);
              }
            } catch (error) {
              // ignore
            }
          };

          window.addEventListener('message', handleMessage);
          document.addEventListener('message', handleMessage);
          setMode('navigate');
          loadPdf().catch((error) => {
            document.body.innerHTML = '<h1>Error: ' + error.message + '</h1>';
          });
        </script>
      </body>
    </html>
  `;
  }, [pdfUrl, initialAnnotations]);

  const handleWebViewMessage = (event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'ANNOTATIONS') {
        setAnnotationPaths(msg.annotations || []);
      }
    } catch (e) {
      // ignore non-JSON messages
    }
  };

  useEffect(() => {
    if (webviewRef.current) {
      webviewRef.current.postMessage(JSON.stringify({ type: 'SET_MODE', mode }));
    }
  }, [mode]);

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={`${filename}`} subtitle={`Version ${version}`} />
        <Appbar.Action
          icon="check"
          onPress={() => uploadMutation.mutate()}
          disabled={uploadMutation.isPending}
        />
      </Appbar.Header>

      <View style={styles.modeToggleRow}>
        <Button
          mode={mode === 'navigate' ? 'contained' : 'outlined'}
          onPress={() => setMode('navigate')}
          style={styles.modeButton}
        >
          Navigate
        </Button>
        <Button
          mode={mode === 'draw' ? 'contained' : 'outlined'}
          onPress={() => setMode('draw')}
          style={styles.modeButton}
        >
          Draw
        </Button>
      </View>

      <View style={styles.viewerContainer}>
        {Platform.OS === 'web' ? (
          <iframe src={pdfUrl} style={{ width: '100%', height: '100%', border: 'none' }} />
        ) : (
          <WebView
            ref={webviewRef}
            source={{ html: pdfHtml }}
            style={{ flex: 1 }}
            originWhitelist={['*']}
            javaScriptEnabled={true}
            scrollEnabled={true}
            scalesPageToFit={true}
            onMessage={handleWebViewMessage}
          />
        )}
      </View>

      <View style={styles.footer}>
        <Button
          mode="contained"
          onPress={() => uploadMutation.mutate()}
          loading={uploadMutation.isPending}
          icon="content-save-move"
          disabled={
            annotationPaths.length === initialAnnotations.length && !uploadMutation.isPending
          }
        >
          Save as New Revision
        </Button>
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
  modeToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
    paddingVertical: 10,
    backgroundColor: '#fafafa',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modeButton: {
    flex: 1,
    marginHorizontal: 4,
  },
  viewerContainer: { flex: 1, position: 'relative', backgroundColor: '#f0f0f0' },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: '#e0e0e0' },
});
