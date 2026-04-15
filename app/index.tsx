import React, { useEffect } from 'react';
import { FlatList, View, StyleSheet } from 'react-native';
import { List, FAB, ActivityIndicator, Text } from 'react-native-paper';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import apiClient from '../src/api/client';
import socket from '../src/services/socket';
import { Document } from '../src/types';

export default function DocumentListScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: documents, isLoading, isError } = useQuery<Document[]>({
    queryKey: ['documents'],
    queryFn: async () => {
      const response = await apiClient.get('/queue'); // Endpoint still named /queue for now
      return response.data;
    },
  });

  useEffect(() => {
    socket.on('queue-new-item', (newDoc: Document) => {
      queryClient.setQueryData(['documents'], (old: Document[] | undefined) => {
        return old ? [newDoc, ...old] : [newDoc];
      });
    });

    socket.on('queue-updated', (updatedDoc: Document) => {
      queryClient.setQueryData(['documents'], (old: Document[] | undefined) => {
        if (!old) return [updatedDoc];
        return old.map((doc) => (doc.id === updatedDoc.id ? updatedDoc : doc));
      });
    });

    return () => {
      socket.off('queue-new-item');
      socket.off('queue-updated');
    };
  }, [queryClient]);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.center}>
        <Text variant="titleMedium">Error loading documents</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={documents}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <List.Accordion
            title={item.name}
            description={`${item.revisions.length} revision(s)`}
            left={(props) => <List.Icon {...props} icon="file-pdf-box" />}
          >
            {item.revisions.map((rev) => (
              <List.Item
                key={rev.id}
                title={`Version ${rev.version}`}
                description={new Date(rev.created_at).toLocaleString()}
                onPress={() => {
                  router.push({
                    pathname: `/document/${item.id}`,
                    params: { filename: rev.filename, version: rev.version }
                  });
                }}
                left={(props) => <List.Icon {...props} icon="history" />}
              />
            ))}
          </List.Accordion>
        )}
      />
      <FAB
        style={styles.fab}
        icon="plus"
        onPress={async () => {
          try {
            await apiClient.post('/queue', { filename: 'sample_document.pdf' });
          } catch (e) {
            console.error(e);
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
  },
});
