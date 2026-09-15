# Android build notes

The backend now has a publicly trusted Sectigo certificate
(tocz-app4.toors.cz), which Android and all browsers trust out of the box —
app-side cert pinning was removed. `EXPO_PUBLIC_BACKEND_USE_HTTPS` in
`mobile/.env` still controls which scheme `src/config/env.ts` builds
`BASE_URL` with (http:// for a plain-HTTP backend, https:// once a real
certificate is deployed).

## "SDK location not found" after a clean prebuild

If a Gradle build suddenly fails with `SDK location not found` right after
running `expo prebuild --clean`, that's why: a full clean regenerates
`android/` from scratch, which deletes `android/local.properties` — the
file that normally stores your Android SDK path. The routine
"Mobile: Prebuild Android (apply plugins)" VS Code task deliberately avoids
`--clean` for exactly this reason (see its description) — but the fix that
actually makes this stop being fragile is to set `ANDROID_HOME` as a
**permanent Windows environment variable**, so Gradle can always find the
SDK regardless of what happens to `local.properties`:

1. Find your SDK path — typically
   `C:\Users\<you>\AppData\Local\Android\Sdk` if installed via Android
   Studio (Android Studio → Settings → Languages & Frameworks → Android
   SDK shows the exact path).
2. Set it permanently: System Properties → Environment Variables → New
   (User variable) → Name `ANDROID_HOME`, Value that path. Or via terminal:
   `setx ANDROID_HOME "C:\Users\you\AppData\Local\Android\Sdk"`.
3. **Close and reopen VS Code / your terminal** — `setx` only affects new
   sessions, not ones already open.

Once `ANDROID_HOME` is set, even a full `--clean` prebuild (the
"Mobile: Full Clean Rebuild" task) won't break the next build — Gradle
falls back to `ANDROID_HOME` when `local.properties` is missing.

## Release signing (separate from the cert above)

If you're building locally via the VS Code tasks (`./gradlew bundleRelease`)
instead of EAS Build, you also need a real release keystore — Expo's
default template signs "release" builds with the debug key, which Google
Play rejects. This is handled by `plugins/withReleaseSigning.js`, driven by
four environment variables set on your machine (never committed):

```text
RELEASE_KEYSTORE_PATH        absolute path to your .keystore/.jks file
RELEASE_KEYSTORE_PASSWORD
RELEASE_KEY_ALIAS
RELEASE_KEY_PASSWORD
```

Generate the keystore once (keep the resulting file somewhere secure,
outside the repo — losing it means you can never update the app on Play
Store again under the same listing):

```bash
keytool -genkeypair -v -storetype PKCS12 \
  -keystore C:\secure\paperless-release.keystore \
  -alias paperless-release-key -keyalg RSA -keysize 2048 -validity 10000
```

Then set the four variables as **persistent Windows environment variables**
(System Properties → Environment Variables, or `setx NAME value` — note
`setx` only takes effect in new terminal windows, not ones already open),
so every prebuild picks them up automatically. Without them, prebuild still
succeeds but silently falls back to debug signing — check for a
`[withReleaseSigning]` warning in the task output to confirm which path it
took.
