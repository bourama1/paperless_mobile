// Keeps android.versionCode in sync with expo.version via a monotonic
// encoding (major*10000 + minor*100 + patch, e.g. "1.2.15" -> 10215), so
// there's one number (version) to bump instead of two, and it stays
// strictly increasing across minor/major bumps too — not just patch ones.
// Run before every native build (see .vscode/tasks.json — wired as a
// dependsOn of the prebuild tasks) since Android rejects installing an APK
// whose versionCode isn't strictly greater than what's already installed.
//
// Limits: minor and patch must each stay below 100 (two digits) — e.g.
// 1.2.100 would collide with 1.3.0 (both encode to 10300). Bump major/minor
// instead of letting patch reach 100 if that's ever a risk.
const fs = require("fs");
const path = require("path");

const APP_JSON_PATH = path.join(__dirname, "..", "app.json");

const raw = fs.readFileSync(APP_JSON_PATH, "utf-8");
const config = JSON.parse(raw);

const version = config.expo?.version;
if (typeof version !== "string") {
    throw new Error(`app.json expo.version is missing or not a string: ${version}`);
}

const parts = version.split(".");
if (parts.length !== 3 || parts.some((p) => !/^\d+$/.test(p))) {
    throw new Error(`expo.version "${version}" isn't a plain major.minor.patch (all-numeric) semver string`);
}
const [major, minor, patch] = parts.map(Number);
if (minor >= 100 || patch >= 100) {
    throw new Error(
        `expo.version "${version}" has a minor or patch >= 100, which would collide with another version ` +
            "under this script's encoding (major*10000 + minor*100 + patch) — bump major/minor instead",
    );
}
const versionCode = major * 10000 + minor * 100 + patch;

config.expo.android = config.expo.android || {};
const previous = config.expo.android.versionCode;
config.expo.android.versionCode = versionCode;

if (previous === versionCode) {
    console.log(`[sync-version-code] versionCode already ${versionCode} (from version ${version}) — no change`);
} else {
    fs.writeFileSync(APP_JSON_PATH, JSON.stringify(config, null, 4) + "\n", "utf-8");
    console.log(`[sync-version-code] versionCode ${previous ?? "(unset)"} -> ${versionCode} (from version ${version})`);
}
