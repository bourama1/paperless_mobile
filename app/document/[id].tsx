import React, { useState, useMemo } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Appbar, Snackbar } from 'react-native-paper';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import apiClient, { BASE_URL } from '../../src/api/client';
import DrawingCanvas from '../../src/components/DrawingCanvas';
import { Document } from '../../src/types';

export default function DocumentViewerScreen() {
  const { id, filename, version, annotations } = useLocalSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  
  const initialPaths = useMemo(() => {
    try {
      return annotations ? JSON.parse(annotations as string) : [];
    } catch (e) {
      return [];
    }
  }, [annotations]);

  const [paths, setPaths] = useState<string[]>(initialPaths);
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });

  // Dimensions of the canvas overlay (full viewerContainer size)
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  // Dimensions of the actual rendered PDF page inside the WebView.
  // This is what pdf.js reports after rendering — width fills the screen,
  // height depends on the PDF's aspect ratio. It will be <= canvasSize.height.
  const [pdfRenderedSize, setPdfRenderedSize] = useState({ width: 0, height: 0 });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      console.log('--- STARTING UPLOAD PROCESS ---');
      
      const documents = queryClient.getQueryData<Document[]>(['documents']);
      const currentDoc = documents?.find(d => d.id === Number(id));
      const originalName = currentDoc?.name || filename as string;
      
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
      
      formData.append('annotations', JSON.stringify(paths));

      // Use the actual rendered PDF dimensions for coordinate mapping.
      // Fall back to canvas size if the WebView message hasn't arrived yet.
      const mappingWidth  = pdfRenderedSize.width  > 0 ? pdfRenderedSize.width  : canvasSize.width;
      const mappingHeight = pdfRenderedSize.height > 0 ? pdfRenderedSize.height : canvasSize.height;

      formData.append('canvasWidth',  mappingWidth.toString());
      formData.append('canvasHeight', mappingHeight.toString());

      console.log(`[Upload] Canvas overlay: ${canvasSize.width}x${canvasSize.height}`);
      console.log(`[Upload] PDF rendered:   ${pdfRenderedSize.width}x${pdfRenderedSize.height}`);
      console.log(`[Upload] Using for mapping: ${mappingWidth}x${mappingHeight}`);

      const response = await apiClient.post(`/files/${id}/revise`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        transformRequest: (data) => data,
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
    }
  });

  const pdfUrl = `${BASE_URL}/files/${filename}`;
  
  // After pdf.js renders the page it posts a message with the canvas pixel dimensions.
  // We use these (not the React Native overlay size) as the coordinate reference for scaling.
  const androidPdfHtml = useMemo(() => `
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js"></script>
        <style>
          body { margin: 0; padding: 0; background: #f0f0f0; }
          #pdf-canvas { width: 100%; height: auto; display: block; }
        </style>
      </head>
      <body>
        <canvas id="pdf-canvas"></canvas>
        <script>
          const url = '${pdfUrl}';
          const pdfjsLib = window['pdfjs-dist/build/pdf'];
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

          const loadingTask = pdfjsLib.getDocument(url);
          loadingTask.promise.then(pdf => {
            pdf.getPage(1).then(page => {
              const canvas = document.getElementById('pdf-canvas');
              const context = canvas.getContext('2d');
              const viewport = page.getViewport({ scale: 1.5 });
              canvas.height = viewport.height;
              canvas.width = viewport.width;
              page.render({ canvasContext: context, viewport: viewport }).promise.then(() => {
                // Report the rendered CSS size of the PDF canvas back to React Native.
                // getBoundingClientRect gives the display size after "width:100%" scaling is applied.
                const rect = canvas.getBoundingClientRect();
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'PDF_SIZE',
                  width: rect.width,
                  height: rect.height,
                }));
              });
            });
          }).catch(err => {
            document.body.innerHTML = '<h1>Error: ' + err.message + '</h1>';
          });
        </script>
      </body>
    </html>
  `, [pdfUrl]);

  // Handle the PDF_SIZE message posted by the WebView after pdf.js finishes rendering
  const handleWebViewMessage = (event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'PDF_SIZE') {
        console.log(`[PDFSize] Rendered PDF size: ${msg.width}x${msg.height}`);
        setPdfRenderedSize({ width: msg.width, height: msg.height });
      }
    } catch (e) {
      // ignore non-JSON messages
    }
  };

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={`${filename}`} subtitle={`Version ${version}`} />
        <Appbar.Action icon="check" onPress={() => uploadMutation.mutate()} disabled={uploadMutation.isPending} />
      </Appbar.Header>

      <View style={styles.viewerContainer}>
        {Platform.OS === 'web' ? (
          <iframe src={pdfUrl} style={{ width: '100%', height: '100%', border: 'none' }} />
        ) : Platform.OS === 'ios' ? (
          <WebView source={{ uri: pdfUrl }} style={{ flex: 1 }} />
        ) : (
          <WebView 
            source={{ html: androidPdfHtml }} 
            style={{ flex: 1 }} 
            originWhitelist={['*']}
            javaScriptEnabled={true}
            onMessage={handleWebViewMessage}
          />
        )}
        
        <DrawingCanvas
          initialPaths={initialPaths}
          onPathsChange={setPaths}
          onSizeChange={(w, h) => setCanvasSize({ width: w, height: h })}
        />
      </View>

      <View style={styles.footer}>
         <Button 
           mode="contained" 
           onPress={() => uploadMutation.mutate()} 
           loading={uploadMutation.isPending}
           icon="content-save-move"
           disabled={paths.length === initialPaths.length && !uploadMutation.isPending}
         >
           Save as New Revision
         </Button>
      </View>

      <Snackbar visible={snackbar.visible} onDismiss={() => setSnackbar({ ...snackbar, visible: false })}>
        {snackbar.message}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  viewerContainer: { flex: 1, position: 'relative', backgroundColor: '#f0f0f0' },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: '#e0e0e0' },
});
