import React, { useEffect } from 'react';
import { FlatList, View, StyleSheet } from 'react-native';
import { List, FAB, ActivityIndicator, Text, Appbar } from 'react-native-paper';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, Stack } from 'expo-router';
import apiClient from '../src/api/client';
import socket from '../src/services/socket';
import { Document } from '../src/types';

export default function DocumentListScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const {
    data: documents,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuery<Document[]>({
    queryKey: ['documents'],
    queryFn: async () => {
      console.log('Fetching documents...');
      const response = await apiClient.get('/queue');
      console.log('Documents fetched:', response.data.length);
      return response.data;
    },
  });

  useEffect(() => {
    console.log('DocumentListScreen mounted');
    socket.on('queue-new-item', (newDoc: Document) => {
      console.log('Socket: new item received');
      queryClient.setQueryData(['documents'], (old: Document[] | undefined) => {
        return old ? [newDoc, ...old] : [newDoc];
      });
    });

    socket.on('queue-updated', (updatedDoc: Document) => {
      console.log('Socket: item updated');
      queryClient.setQueryData(['documents'], (old: Document[] | undefined) => {
        if (!old) return [updatedDoc];
        return old.map(doc => (doc.id === updatedDoc.id ? updatedDoc : doc));
      });
    });

    return () => {
      socket.off('queue-new-item');
      socket.off('queue-updated');
    };
  }, [queryClient]);

  if (isLoading && !isRefetching) {
    console.log('Rendering loading state');
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (isError) {
    console.log('Rendering error state');
    return (
      <View style={styles.center}>
        <Text variant="titleMedium">Error loading documents</Text>
        <FAB style={{ marginTop: 20 }} icon="refresh" label="Retry" onPress={() => refetch()} />
      </View>
    );
  }

  console.log('Rendering document list, count:', documents?.length);

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Appbar.Action icon="refresh" onPress={() => refetch()} disabled={isRefetching} />
          ),
        }}
      />
      {documents && documents.length > 0 ? (
        <FlatList
          data={documents}
          keyExtractor={item => item.id.toString()}
          onRefresh={refetch}
          refreshing={isRefetching}
          renderItem={({ item }) => (
            <List.Accordion
              title={item.name}
              description={`${item.revisions.length} revision(s)`}
              left={props => <List.Icon {...props} icon="file-pdf-box" />}
            >
              {item.revisions.map(rev => (
                <List.Item
                  key={rev.id}
                  title={`Version ${rev.version}`}
                  description={new Date(rev.created_at).toLocaleString()}
                  onPress={() => {
                    router.push({
                      pathname: `/document/${item.id}`,
                      params: {
                        filename: rev.filename,
                        version: rev.version,
                        annotations: rev.annotations,
                      },
                    });
                  }}
                  left={props => <List.Icon {...props} icon="history" />}
                />
              ))}
            </List.Accordion>
          )}
        />
      ) : (
        <View style={styles.center}>
          <Text variant="bodyLarge">No documents found. Press + to add one.</Text>
          <FAB
            style={{ marginTop: 20 }}
            icon="refresh"
            label="Reload"
            onPress={() => refetch()}
            loading={isRefetching}
          />
        </View>
      )}
      <FAB
        style={styles.fab}
        icon="plus"
        onPress={async () => {
          console.log('FAB pressed: adding document');
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
    backgroundColor: '#fff',
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
