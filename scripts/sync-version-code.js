// Auto-bumps expo.version's patch number, then keeps android.versionCode in
// sync with it via a monotonic encoding (major*10000 + minor*100 + patch,
// e.g. "1.2.15" -> 10215), so there's nothing to bump by hand for a local
// build — major/minor are still bumped manually when that's warranted.
// Run before every native build (see .vscode/tasks.json — wired as a
// dependsOn of the prebuild tasks) since Android rejects installing an APK
// whose versionCode isn't strictly greater than what's already installed.
//
// Limits: minor and patch must each stay below 100 (two digits) — e.g.
// 1.2.100 would collide with 1.3.0 (both encode to 10300). Bump major/minor
// by hand instead of letting patch reach 100 if that's ever a risk — this
// script throws rather than silently colliding once it would.
const fs = require("fs");
const path = require("path");

function bumpVersion(previousVersion) {
    const parts = previousVersion.split(".");
    if (parts.length !== 3 || parts.some((p) => !/^\d+$/.test(p))) {
        throw new Error(`expo.version "${previousVersion}" isn't a plain major.minor.patch (all-numeric) semver string`);
    }
    const [major, minor, previousPatch] = parts.map(Number);
    const patch = previousPatch + 1;
    if (minor >= 100 || patch >= 100) {
        throw new Error(
            `Bumping expo.version "${previousVersion}" to patch ${patch} would give it a minor or patch >= 100, ` +
                "which would collide with another version under this script's encoding " +
                "(major*10000 + minor*100 + patch) — bump major/minor by hand instead",
        );
    }
    return {
        version: `${major}.${minor}.${patch}`,
        versionCode: major * 10000 + minor * 100 + patch,
    };
}

module.exports = { bumpVersion };

// Only touch app.json when run directly (`node sync-version-code.js`), not
// when required by tests importing bumpVersion.
if (require.main === module) {
    const APP_JSON_PATH = path.join(__dirname, "..", "app.json");
    const config = JSON.parse(fs.readFileSync(APP_JSON_PATH, "utf-8"));

    const previousVersion = config.expo?.version;
    if (typeof previousVersion !== "string") {
        throw new Error(`app.json expo.version is missing or not a string: ${previousVersion}`);
    }

    const { version, versionCode } = bumpVersion(previousVersion);

    config.expo.version = version;
    config.expo.android = config.expo.android || {};
    const previousVersionCode = config.expo.android.versionCode;
    config.expo.android.versionCode = versionCode;

    fs.writeFileSync(APP_JSON_PATH, JSON.stringify(config, null, 4) + "\n", "utf-8");
    console.log(
        `[sync-version-code] version ${previousVersion} -> ${version}, versionCode ${previousVersionCode ?? "(unset)"} -> ${versionCode}`,
    );
}
