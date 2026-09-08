const { escapePropertiesValue } = require("../withReleaseSigning");

/**
 * A precise reimplementation of java.util.Properties.load()'s unescaping
 * rules (what Gradle actually uses to read gradle.properties): backslash
 * starts an escape; \\, \t, \n, \r, \f are recognized; any other \X drops
 * the backslash and keeps X. This is the exact mechanism that silently
 * corrupted Windows keystore paths before escapePropertiesValue existed —
 * see plugins/withReleaseSigning.js's comment on escapePropertiesValue for
 * the full story. Used here to prove escapePropertiesValue's output
 * actually round-trips through a real Properties parser, not just that it
 * "looks escaped".
 */
function javaPropertiesUnescape(s) {
    let out = "";
    for (let i = 0; i < s.length; i++) {
        if (s[i] === "\\" && i + 1 < s.length) {
            const next = s[i + 1];
            const recognized = { "\\": "\\", t: "\t", n: "\n", r: "\r", f: "\f" };
            out += recognized[next] !== undefined ? recognized[next] : next;
            i++;
        } else {
            out += s[i];
        }
    }
    return out;
}

describe("escapePropertiesValue", () => {
    it("escapes a Windows path so it round-trips through a real Properties parser", () => {
        const original = "D:\\secure\\paperless-release.keystore";
        const escaped = escapePropertiesValue(original);
        expect(javaPropertiesUnescape(escaped)).toBe(original);
    });

    it("without escaping, the same path would corrupt exactly as observed in production", () => {
        // Documents WHY this function exists: this is the literal bug that
        // was shipped and caused a real failed build (Gradle's
        // "Keystore file ... not found" with a corrupted path).
        const original = "D:\\secure\\paperless-release.keystore";
        expect(javaPropertiesUnescape(original)).toBe("D:securepaperless-release.keystore");
    });

    it("leaves a value with no backslashes unchanged", () => {
        expect(escapePropertiesValue("mykey")).toBe("mykey");
        expect(escapePropertiesValue("simplePassword123")).toBe("simplePassword123");
    });

    it("escapes multiple backslashes in one value", () => {
        const original = "C:\\Users\\me\\keys\\release.keystore";
        expect(javaPropertiesUnescape(escapePropertiesValue(original))).toBe(original);
    });

    it("escapes newlines defensively, even though unlikely in real values", () => {
        const original = "line1\nline2";
        expect(javaPropertiesUnescape(escapePropertiesValue(original))).toBe(original);
    });
});
