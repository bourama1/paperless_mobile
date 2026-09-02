import AsyncStorage from "@react-native-async-storage/async-storage";
import cs from "./cs.json";
import en from "./en.json";

export type Language = "cs" | "en";

const DEFAULT_LANGUAGE: Language = "cs";
const STORAGE_KEY = "paperless_mobile_language";

const dictionaries: Record<Language, Record<string, string>> = { cs, en };

let currentLanguage: Language = DEFAULT_LANGUAGE;
const listeners = new Set<() => void>();

function notify() {
    listeners.forEach((l) => l());
}

/** Subscribe to language changes — used by useLanguage() (useSyncExternalStore). */
export function subscribeLanguage(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function getLanguage(): Language {
    return currentLanguage;
}

/**
 * Switches the active language immediately (t() calls made after this
 * resolve use the new dictionary right away) and persists the choice so it
 * survives an app restart — these are shared/kiosk tablets, so the person
 * who sets English shouldn't have to reset it every time the app reopens.
 */
export async function setLanguage(lang: Language): Promise<void> {
    currentLanguage = lang;
    notify();
    try {
        await AsyncStorage.setItem(STORAGE_KEY, lang);
    } catch (e) {
        // Non-fatal — the language still applies for this session, it just
        // won't be remembered on next launch. Not worth surfacing to the
        // user over.
        console.error("[i18n] Failed to persist language choice", e);
    }
}

/**
 * Reads the persisted language preference at app startup. Call once, early
 * (see app/_layout.tsx), and await it before rendering so there's no flash
 * of the default language before the saved preference loads.
 */
export async function loadPersistedLanguage(): Promise<Language> {
    try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored === "cs" || stored === "en") {
            currentLanguage = stored;
            notify();
        }
    } catch (e) {
        console.error("[i18n] Failed to load persisted language, using default", e);
    }
    return currentLanguage;
}

export function t(key: string, params?: Record<string, string | number> & { defaultValue?: string }): string {
    const dict = dictionaries[currentLanguage];
    // Falls back to the default language's dictionary before giving up and
    // showing the raw key — keeps the UI readable even if a key is ever
    // added to one dictionary but not (yet) translated in the other.
    let val = dict[key] ?? dictionaries[DEFAULT_LANGUAGE][key] ?? params?.defaultValue ?? key;
    if (params) {
        for (const [k, v] of Object.entries(params)) {
            if (k === "defaultValue") continue;
            val = val.replaceAll(`{${k}}`, String(v));
        }
    }
    return val;
}
