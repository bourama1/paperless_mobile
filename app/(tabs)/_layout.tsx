import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#ff5100',
        tabBarInactiveTintColor: '#909090',
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopColor: '#e0e0e0',
        },
        headerStyle: { backgroundColor: '#fff' },
        headerTintColor: '#ff5100',
        headerTitleStyle: { fontWeight: 'bold' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Pracoviště',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="business" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Hledat PBOM',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="search" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
