// Self-contained base64 encoder — avoids depending on btoa being polyfilled
// in the RN/Hermes runtime, which isn't guaranteed.
const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let result = "";
    for (let i = 0; i < bytes.length; i += 3) {
        const b1 = bytes[i]!;
        const b2 = i + 1 < bytes.length ? bytes[i + 1]! : undefined;
        const b3 = i + 2 < bytes.length ? bytes[i + 2]! : undefined;
        const triplet = (b1 << 16) | ((b2 ?? 0) << 8) | (b3 ?? 0);
        result += BASE64_CHARS[(triplet >> 18) & 0x3f];
        result += BASE64_CHARS[(triplet >> 12) & 0x3f];
        result += b2 !== undefined ? BASE64_CHARS[(triplet >> 6) & 0x3f] : "=";
        result += b3 !== undefined ? BASE64_CHARS[triplet & 0x3f] : "=";
    }
    return result;
}
