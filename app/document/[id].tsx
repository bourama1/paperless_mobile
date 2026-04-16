import React, { useState } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Appbar, Text, Snackbar } from 'react-native-paper';
import { WebView } from 'react-native-webview';
import apiClient, { BASE_URL } from '../../src/api/client';
import DrawingCanvas from '../../src/components/DrawingCanvas';

export default function DocumentViewerScreen() {
  const { id, filename, version } = useLocalSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [paths, setPaths] = useState<string[]>([]);
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      console.log('Starting revision upload...');
      const formData = new FormData();
      
      if (Platform.OS !== 'web') {
        const base64Content = 'UERGIHBsYWNlaG9sZGVyIGNvbnRlbnQ=';
        const file = {
          uri: `data:application/pdf;base64,${base64Content}`,
          name: filename as string,
          type: 'application/pdf',
        } as any;
        formData.append('file', file);
      } else {
        const blob = new Blob(['dummy pdf content'], { type: 'application/pdf' });
        formData.append('file', blob, filename as string);
      }
      
      const response = await apiClient.post(`/files/${id}/revise`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['documents'], (old: any[] | undefined) => {
        if (!old) return [data];
        return old.map((doc) => (doc.id === data.id ? data : doc));
      });
      setSnackbar({ visible: true, message: 'Revision saved successfully!' });
      setTimeout(() => router.back(), 1500);
    },
    onError: (error: any) => {
      setSnackbar({ visible: true, message: `Save failed: ${error.message}` });
    }
  });

  const pdfUrl = `${BASE_URL}/files/${filename}`;
  
  // For Android, we use a PDF.js viewer via CDN because WebView doesn't render PDFs natively
  const androidPdfHtml = `
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
              page.render({ canvasContext: context, viewport: viewport });
            });
          }).catch(err => {
            document.body.innerHTML = '<h1>Error loading PDF: ' + err.message + '</h1><p>' + url + '</p>';
          });
        </script>
      </body>
    </html>
  `;

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
            mixedContentMode="always"
          />
        )}
        
        <DrawingCanvas onPathsChange={setPaths} />
      </View>

      <View style={styles.footer}>
         <Button 
           mode="contained" 
           onPress={() => uploadMutation.mutate()} 
           loading={uploadMutation.isPending}
           icon="content-save-move"
           disabled={paths.length === 0 && !uploadMutation.isPending}
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
