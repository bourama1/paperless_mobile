import React, { useState } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Appbar, Text } from 'react-native-paper';
import apiClient, { BASE_URL } from '../../src/api/client';
import DrawingCanvas from '../../src/components/DrawingCanvas';

export default function DocumentViewerScreen() {
  const { id, filename, version } = useLocalSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [paths, setPaths] = useState<string[]>([]);

  const uploadMutation = useMutation({
    mutationFn: async () => {
      // In a real app, we would send the actual annotated file.
      // For this prototype, we just trigger a new revision on the backend.
      const formData = new FormData();
      // Dummy file for the prototype
      const dummyFile = {
        uri: 'dummy',
        name: filename as string,
        type: 'application/pdf',
      } as any;
      
      formData.append('file', dummyFile);
      
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
      router.back();
    },
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
             <Text>PDF Viewer for {filename}</Text>
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
         >
           Save as New Revision
         </Button>
      </View>
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
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
});
