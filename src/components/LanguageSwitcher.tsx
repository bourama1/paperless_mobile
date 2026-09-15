import React from "react";
import { TouchableOpacity, StyleSheet } from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { useLanguage } from "../hooks/useLanguage";
import { Language, LANGUAGES } from "../i18n";
import { t } from "../i18n";

// Display code shown on the button for each language — "UA" rather than the
// ISO "UK" for Ukrainian, since "UK" reads as United Kingdom/English here.
const LABELS: Record<Language, string> = { cs: "CS", en: "EN", uk: "UA" };

/**
 * A compact cycle through the supported languages: tapping always shows and
 * switches to the NEXT one (cs → en → uk → cs → ...), so this stays a single
 * small button instead of a picker/menu regardless of how many languages
 * are configured.
 *
 * Switching takes effect immediately and persists across app restarts —
 * see setLanguage in src/i18n/index.ts. It does NOT need to trigger a
 * re-render here manually: app/_layout.tsx remounts the whole navigator
 * tree on language change, which is what actually makes every screen's
 * already-rendered t() calls pick up the new language.
 */
export default function LanguageSwitcher() {
    const { language, setLanguage } = useLanguage();
    const currentIndex = LANGUAGES.indexOf(language);
    const next = LANGUAGES[(currentIndex + 1) % LANGUAGES.length]!;

    return (
        <TouchableOpacity
            onPress={() => setLanguage(next)}
            style={styles.button}
            accessibilityLabel={t("language.label")}
            accessibilityRole="button">
            <Ionicons name="language-outline" size={16} color="#ff5100" />
            <Text style={styles.label}>{LABELS[next]}</Text>
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
