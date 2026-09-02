import { useSyncExternalStore } from "react";
import { subscribeLanguage, getLanguage, setLanguage, Language } from "../i18n";

/**
 * Reactive view of the active language. Note: switching languages doesn't
 * automatically re-render every screen that calls t() directly (most of
 * the app does, as a plain function call rather than through a hook) — see
 * app/_layout.tsx, which remounts the whole navigator tree on language
 * change instead. This hook is for components that specifically need to
 * know/display the current language, like the switcher itself.
 */
export function useLanguage() {
    const language = useSyncExternalStore(subscribeLanguage, getLanguage);
    return { language, setLanguage: (lang: Language) => void setLanguage(lang) };
}
