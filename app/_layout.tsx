import { Stack } from 'expo-router';
import { PaperProvider } from 'react-native-paper';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const queryClient = new QueryClient();

export default function RootLayout() {
  console.log('RootLayout rendering');
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider style={{ flex: 1, backgroundColor: '#fff' }}>
        <PaperProvider>
          <Stack>
            <Stack.Screen name="index" options={{ title: 'Document Library' }} />
            <Stack.Screen name="document/[id]" options={{ title: 'Document View' }} />
          </Stack>
        </PaperProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
