import React, { useState } from 'react';
import { FlatList, View, StyleSheet, TouchableOpacity } from 'react-native';
import {
  Card, Text, ActivityIndicator, FAB, TextInput, Button, Divider, Snackbar,
} from 'react-native-paper';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import apiClient from '../../src/api/client';

interface SearchResult {
  customer_code: number;
  order_code: number;
  position_code: number;
}

export default function SearchScreen() {
  const router = useRouter();
  const [orderCode, setOrderCode] = useState('');
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });

  const {
    data: results,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuery<SearchResult[]>({
    queryKey: ['search-pbom', orderCode],
    queryFn: async () => {
      const response = await apiClient.get('/workstations/search-pbom', {
        params: { order_code: orderCode },
      });
      return response.data;
    },
    enabled: false,
  });

  const importPbom = useMutation({
    mutationFn: async (item: SearchResult) => {
      const response = await apiClient.post('/workstations/import-pbom', {
        projectNumber: String(item.order_code),
        position: String(item.position_code),
        customer: String(item.customer_code),
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
    onError: (error: any) => {
      const msg = error?.response?.data?.error || error.message;
      setSnackbar({ visible: true, message: `Chyba: ${msg}` });
    },
  });

  const handleSearch = () => {
    if (!orderCode.trim()) return;
    refetch();
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <TextInput
          mode="outlined"
          label="Kód zakázky"
          value={orderCode}
          onChangeText={setOrderCode}
          style={styles.input}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
        />
        <Button
          mode="text"
          onPress={handleSearch}
          loading={isRefetching}
          disabled={!orderCode.trim() || isRefetching}
          style={styles.searchBtn}
          textColor="#ff5100"
        >
          Hledat
        </Button>
      </View>

      <Divider />

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Text variant="titleMedium">Hledání selhalo</Text>
          <FAB style={{ marginTop: 20 }} icon="refresh" label="Znovu" onPress={handleSearch} />
        </View>
      ) : results && results.length > 0 ? (
        <FlatList
          data={results}
          keyExtractor={(item, i) => `${item.order_code}-${item.position_code}-${i}`}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => importPbom.mutate(item)}
              disabled={importPbom.isPending}
              activeOpacity={0.7}
            >
              <Card style={styles.card} mode="outlined">
                <Card.Title
                  title={`Zakázka ${item.order_code}`}
                  titleStyle={styles.cardTitle}
                  subtitle={`Pozice ${item.position_code}`}
                />
              </Card>
            </TouchableOpacity>
          )}
        />
      ) : results ? (
        <View style={styles.center}>
          <Text variant="bodyLarge">Pro tuto zakázku nebyly nalezeny žádné pozice.</Text>
          <Text variant="bodySmall" style={{ color: '#999', marginTop: 8 }}>
            Zkuste jiný kód zakázky
          </Text>
        </View>
      ) : (
        <View style={styles.center}>
          <Text variant="bodyLarge">Zadejte kód zakázky pro vyhledávání</Text>
          <Text variant="bodySmall" style={{ color: '#999', marginTop: 8 }}>
            Pro každou pozici budou otevřeny dokumenty
          </Text>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  searchBar: {
    flexDirection: 'row',
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
  input: { flex: 1 },
  searchBtn: { borderRadius: 20, paddingHorizontal: 16 },
  list: { padding: 12 },
  card: { marginBottom: 12 },
  cardTitle: { fontWeight: 'bold' },
  detailRow: { flexDirection: 'row', marginTop: 4 },
  label: { fontWeight: '600', width: 100, color: '#666' },
});
