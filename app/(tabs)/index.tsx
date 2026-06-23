import React, { useCallback } from 'react';
import { FlatList, View, StyleSheet, TouchableOpacity } from 'react-native';
import { Card, Text, ActivityIndicator, FAB, Appbar, Chip, Divider } from 'react-native-paper';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useFocusEffect, useRouter } from 'expo-router';
import apiClient from '../../src/api/client';
import { Workstation } from '../../src/types';

export default function WorkstationsScreen() {
  const router = useRouter();

  const {
    data: workstations,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuery<Workstation[]>({
    queryKey: ['workstations'],
    queryFn: async () => {
      const response = await apiClient.get('/workstations');
      return response.data;
    },
  });

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const importPbom = useMutation({
    mutationFn: async (order: NonNullable<Workstation['current_order_data']>) => {
      const response = await apiClient.post('/workstations/import-pbom', {
          projectNumber: order.projectNumber || order.salesOrder,
          position: order.position,
          customer: order.customer,
          productOrder: order.productOrder,
          productDesc: order.productDesc,
        });
      return response.data;
    },
    onSuccess: (doc) => {
      const rev = doc.revisions?.[0];
      router.push({
        pathname: `/document/${doc.id}`,
        params: {
          filename: rev?.filename || '',
          version: rev?.version || 1,
          annotations: rev?.annotations || '',
        },
      });
    },
  });

  const sorted = workstations?.slice().sort((a, b) => a.name.localeCompare(b.name));

  if (isLoading && !isRefetching) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.center}>
        <Text variant="titleMedium">Error loading workstations</Text>
        <FAB style={{ marginTop: 20 }} icon="refresh" label="Retry" onPress={() => refetch()} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {sorted && sorted.length > 0 ? (
        <FlatList
          data={sorted}
          keyExtractor={item => item.id.toString()}
          onRefresh={refetch}
          refreshing={isRefetching}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => {
                if (item.current_order_data) {
                  importPbom.mutate(item.current_order_data);
                }
              }}
              disabled={importPbom.isPending}
              activeOpacity={0.7}
            >
              <Card style={styles.card} mode="outlined">
                <Card.Title
                  title={item.name}
                  titleStyle={styles.cardTitle}
                  right={props => (
                    <Chip
                      mode="flat"
                      compact
                      style={{
                        backgroundColor: item.current_order_id ? '#ff5100' : '#e0e0e0',
                        marginRight: 12,
                      }}
                      textStyle={{
                        color: item.current_order_id ? '#fff' : '#666',
                        fontSize: 12,
                      }}
                    >
                      {item.current_order_id ? 'BUSY' : 'FREE'}
                    </Chip>
                  )}
                />
                {item.current_order_data ? (
                  <Card.Content>
                    <Divider style={{ marginBottom: 12 }} />
                    <Text variant="titleMedium">
                      {item.current_order_data.productDesc}
                    </Text>
                    {item.current_order_data.productOrder ? (
                      <View style={styles.detailRow}>
                        <Text variant="bodySmall" style={styles.label}>Order:</Text>
                        <Text variant="bodySmall" style={styles.value} numberOfLines={1}>{item.current_order_data.productOrder}</Text>
                      </View>
                    ) : null}
                    {item.current_order_data.salesOrder ? (
                      <View style={styles.detailRow}>
                        <Text variant="bodySmall" style={styles.label}>Sales Order:</Text>
                        <Text variant="bodySmall" style={styles.value} numberOfLines={1}>{item.current_order_data.salesOrder}</Text>
                      </View>
                    ) : null}
                    {item.current_order_data.position ? (
                      <View style={styles.detailRow}>
                        <Text variant="bodySmall" style={styles.label}>Position:</Text>
                        <Text variant="bodySmall" style={styles.value}>{item.current_order_data.position}</Text>
                      </View>
                    ) : null}
                    {item.current_order_data.customerDesc ? (
                      <View style={styles.detailRow}>
                        <Text variant="bodySmall" style={styles.label}>Customer:</Text>
                        <Text variant="bodySmall" style={styles.value} numberOfLines={1}>{item.current_order_data.customerDesc}</Text>
                      </View>
                    ) : null}
                    {item.current_order_data.quantity > 1 && (
                      <View style={styles.detailRow}>
                        <Text variant="bodySmall" style={styles.label}>Quantity:</Text>
                        <Text variant="bodySmall" style={styles.value}>{item.current_order_data.quantity}</Text>
                      </View>
                    )}
                  </Card.Content>
                ) : (
                  <Card.Content>
                    <Text variant="bodyMedium" style={{ color: '#999' }}>No active order</Text>
                  </Card.Content>
                )}
              </Card>
            </TouchableOpacity>
          )}
        />
      ) : (
        <View style={styles.center}>
          <Text variant="bodyLarge">No workstations found.</Text>
          <FAB
            style={{ marginTop: 20 }}
            icon="refresh"
            label="Reload"
            onPress={() => refetch()}
            loading={isRefetching}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 12 },
  card: { marginBottom: 12 },
  cardTitle: { fontWeight: 'bold' },
  detailRow: { flexDirection: 'row', marginTop: 4 },
  label: { fontWeight: '600', width: 100, color: '#666' },
  value: { flex: 1 },
});
