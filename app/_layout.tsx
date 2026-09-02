import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { PaperProvider, MD3LightTheme } from "react-native-paper";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { t, loadPersistedLanguage } from "../src/i18n";
import { useLanguage } from "../src/hooks/useLanguage";
import ConnectionErrorOverlay from "../src/components/ConnectionErrorOverlay";
import { retryNow } from "../src/services/connectivity";

const queryClient = new QueryClient();

const theme = {
    ...MD3LightTheme,
    colors: {
        ...MD3LightTheme.colors,
        primary: "#ff5100",
        secondary: "#909090",
        tertiary: "#909090",
        primaryContainer: "#ffefe6",
        secondaryContainer: "#f0f0f0",
        outline: "#909090",
    },
};

export default function RootLayout() {
    // Proactively check reachability the moment the app starts, rather than
    // waiting for the first user-triggered request to fail — a kiosk tablet
    // that boots up on a dead network should show the overlay immediately.
    useEffect(() => {
        void retryNow();
    }, []);

    // Load the persisted language choice before the first real render, so
    // there's no flash of the default (Czech) language on startup for a
    // tablet that's been switched to English. The gap is tiny (one
    // AsyncStorage read) — a blank frame is preferable to a flash of the
    // wrong language on a kiosk display.
    const [languageLoaded, setLanguageLoaded] = useState(false);
    useEffect(() => {
        loadPersistedLanguage().finally(() => setLanguageLoaded(true));
    }, []);

    // Most of the app calls t() directly as a plain function rather than
    // through a hook (see src/i18n/index.ts), so switching languages alone
    // wouldn't re-render already-mounted screens. Keying the whole
    // navigator on the active language forces React to remount everything
    // underneath it on a switch, which is what actually makes every
    // screen's t() calls re-evaluate with the new dictionary. Switching
    // languages is a rare, deliberate action (not a per-frame event), so a
    // full remount here is cheap enough not to matter.
    const { language } = useLanguage();

    if (!languageLoaded) {
        return (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" }}>
                <ActivityIndicator size="large" color="#ff5100" />
            </View>
        );
    }

    return (
        <QueryClientProvider client={queryClient}>
            <SafeAreaProvider style={{ flex: 1, backgroundColor: "#fff" }}>
                <PaperProvider theme={theme}>
                    <Stack
                        key={language}
                        screenOptions={{
                            headerStyle: { backgroundColor: "#fff" },
                            headerTintColor: "#ff5100",
                            headerTitleStyle: { fontWeight: "bold" },
                        }}>
                        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                        <Stack.Screen name="kiosk" options={{ headerShown: false }} />
                        <Stack.Screen
                            name="document/[id]"
                            options={{ title: t("document.title"), headerShown: false }}
                        />
                    </Stack>
                    <ConnectionErrorOverlay />
                </PaperProvider>
            </SafeAreaProvider>
        </QueryClientProvider>
    );
}
