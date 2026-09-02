describe("i18n", () => {
    let i18n: typeof import("../index");
    let AsyncStorage: any;

    beforeEach(async () => {
        jest.resetModules();
        // Required fresh, after resetModules(), so this refers to the SAME
        // mock module instance i18n's internal require() gets below —
        // otherwise this and i18n end up talking to two independent mock
        // storages and every assertion here would silently see nothing.
        // No `.default` here — the mock is a plain CJS export; TS's
        // `import X from ...` interop is what adds `.default` at compile
        // time, and a raw require() bypasses that.
        AsyncStorage = require("@react-native-async-storage/async-storage");
        await AsyncStorage.clear();
        i18n = require("../index");
    });

    it("defaults to Czech", () => {
        expect(i18n.getLanguage()).toBe("cs");
        expect(i18n.t("workstations.title")).toBe("Pracoviště");
    });

    it("t() switches dictionaries immediately after setLanguage", async () => {
        await i18n.setLanguage("en");
        expect(i18n.getLanguage()).toBe("en");
        expect(i18n.t("workstations.title")).toBe("Workstations");
    });

    it("setLanguage persists the choice to AsyncStorage", async () => {
        await i18n.setLanguage("en");
        expect(await AsyncStorage.getItem("paperless_mobile_language")).toBe("en");
    });

    it("loadPersistedLanguage restores a previously saved choice", async () => {
        await AsyncStorage.setItem("paperless_mobile_language", "en");

        const loaded = await i18n.loadPersistedLanguage();

        expect(loaded).toBe("en");
        expect(i18n.getLanguage()).toBe("en");
        expect(i18n.t("workstations.title")).toBe("Workstations");
    });

    it("loadPersistedLanguage falls back to the default when nothing is stored", async () => {
        const loaded = await i18n.loadPersistedLanguage();
        expect(loaded).toBe("cs");
    });

    it("ignores a corrupted/unknown stored value and keeps the default", async () => {
        await AsyncStorage.setItem("paperless_mobile_language", "fr");

        const loaded = await i18n.loadPersistedLanguage();

        expect(loaded).toBe("cs");
    });

    it("notifies subscribers when the language changes", async () => {
        const listener = jest.fn();
        i18n.subscribeLanguage(listener);

        await i18n.setLanguage("en");

        expect(listener).toHaveBeenCalled();
    });

    it("unsubscribe stops further notifications", async () => {
        const listener = jest.fn();
        const unsubscribe = i18n.subscribeLanguage(listener);
        unsubscribe();

        await i18n.setLanguage("en");

        expect(listener).not.toHaveBeenCalled();
    });

    it("interpolates params the same way in both languages", async () => {
        expect(i18n.t("search.resultOrder", { code: "12345" })).toBe("Zakázka 12345");
        await i18n.setLanguage("en");
        expect(i18n.t("search.resultOrder", { code: "12345" })).toBe("Order 12345");
    });

    it("falls back to the key itself for a completely unknown key with no defaultValue", () => {
        expect(i18n.t("this.key.does.not.exist")).toBe("this.key.does.not.exist");
    });

    it("uses defaultValue when provided for an unknown key", () => {
        expect(i18n.t("this.key.does.not.exist", { defaultValue: "Fallback text" })).toBe("Fallback text");
    });
});
