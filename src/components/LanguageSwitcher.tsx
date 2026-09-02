import React from "react";
import { TouchableOpacity, View, StyleSheet } from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { useLanguage } from "../hooks/useLanguage";
import { Language } from "../i18n";
import { t } from "../i18n";

/**
 * A compact toggle between the two supported languages. Since there are
 * only ever two, it shows the language you'd switch TO (tapping "EN"
 * switches into English, and the button then reads "CS" to switch back) —
 * simpler than a picker/menu for a two-option choice, and small enough to
 * sit in a header.
 *
 * Switching takes effect immediately and persists across app restarts —
 * see setLanguage in src/i18n/index.ts. It does NOT need to trigger a
 * re-render here manually: app/_layout.tsx remounts the whole navigator
 * tree on language change, which is what actually makes every screen's
 * already-rendered t() calls pick up the new language.
 */
export default function LanguageSwitcher() {
    const { language, setLanguage } = useLanguage();
    const other: Language = language === "cs" ? "en" : "cs";
    const otherLabel = other === "cs" ? "CS" : "EN";

    return (
        <TouchableOpacity
            onPress={() => setLanguage(other)}
            style={styles.button}
            accessibilityLabel={t("language.label")}
            accessibilityRole="button">
            <Ionicons name="language-outline" size={16} color="#ff5100" />
            <Text style={styles.label}>{otherLabel}</Text>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    button: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 6,
        marginRight: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "#ff5100",
    },
    label: {
        color: "#ff5100",
        fontWeight: "bold",
        fontSize: 12,
    },
});
