import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { t } from "../../src/i18n";
import LanguageSwitcher from "../../src/components/LanguageSwitcher";

export default function TabLayout() {
    return (
        <Tabs
            screenOptions={{
                tabBarActiveTintColor: "#ff5100",
                tabBarInactiveTintColor: "#909090",
                tabBarStyle: {
                    backgroundColor: "#fff",
                    borderTopColor: "#e0e0e0",
                },
                headerStyle: { backgroundColor: "#fff" },
                headerTintColor: "#ff5100",
                headerTitleStyle: { fontWeight: "bold" },
                headerRight: () => <LanguageSwitcher />,
            }}>
            <Tabs.Screen
                name="index"
                options={{
                    title: t("workstations.title"),
                    tabBarIcon: ({ color, size }) => <Ionicons name="business" size={size} color={color} />,
                }}
            />
            <Tabs.Screen
                name="search"
                options={{
                    title: t("search.title"),
                    tabBarIcon: ({ color, size }) => <Ionicons name="search" size={size} color={color} />,
                }}
            />
            <Tabs.Screen
                name="revisions"
                options={{
                    title: t("revisions.title"),
                    tabBarIcon: ({ color, size }) => <Ionicons name="document-text" size={size} color={color} />,
                }}
            />
            <Tabs.Screen
                name="prep-queue"
                options={{
                    title: t("prepQueue.tabTitle"),
                    tabBarIcon: ({ color, size }) => <Ionicons name="cube-outline" size={size} color={color} />,
                }}
            />
        </Tabs>
    );
}
