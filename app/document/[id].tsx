import React, { useState } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Appbar, Text, Snackbar } from 'react-native-paper';
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
      
      // On mobile, we need to provide a real-looking file object.
      // For this prototype, we'll create a small blob.
      if (Platform.OS !== 'web') {
        // Base64 for "PDF placeholder content"
        const base64Content = 'UERGIHBsYWNlaG9sZGVyIGNvbnRlbnQ=';
        const file = {
          uri: `data:application/pdf;base64,${base64Content}`,
          name: filename as string,
          type: 'application/pdf',
        } as any;
        formData.append('file', file);
      } else {
        // Web can use a simple Blob
        const blob = new Blob(['dummy pdf content'], { type: 'application/pdf' });
        formData.append('file', blob, filename as string);
      }
      
      const response = await apiClient.post(`/files/${id}/revise`, formData, {
        headers: { 
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data;
    },
    onSuccess: (data) => {
      console.log('Revision saved successfully');
      queryClient.setQueryData(['documents'], (old: any[] | undefined) => {
        if (!old) return [data];
        return old.map((doc) => (doc.id === data.id ? data : doc));
      });
      setSnackbar({ visible: true, message: 'Revision saved successfully!' });
      setTimeout(() => router.back(), 1500);
    },
    onError: (error: any) => {
      console.error('Upload failed:', error?.response?.data || error.message);
      setSnackbar({ visible: true, message: `Save failed: ${error.message}` });
    }
  });

  const pdfUrl = `${BASE_URL}/files/${filename}`;

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

      <View style={styles.viewerContainer}>
        {Platform.OS === 'web' ? (
          <iframe 
            src={pdfUrl} 
            style={{ width: '100%', height: '100%', border: 'none' }} 
          />
        ) : (
          <View style={styles.mobilePlaceholder}>
             <Text variant="titleMedium">PDF Viewer: {filename}</Text>
             <Text variant="bodySmall">Annotations: {paths.length} lines</Text>
          </View>
        )}
        
        {/* Annotation Overlay */}
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

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ ...snackbar, visible: false })}
        duration={3000}
      >
        {snackbar.message}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  viewerContainer: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#f0f0f0',
  },
  mobilePlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
});
