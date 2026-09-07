# Backend TLS certificate (for app-side pinning)

`backend-ca.pem` in this folder is bundled into the Android build by the
`withBackendCertPinning` config plugin (see `../plugins/withBackendCertPinning.js`
and the `plugins` entry in `app.json`) so the app trusts the backend's
self-signed HTTPS certificate without needing it manually installed on every
tablet.

## ⚠️ Replace this before your first production build

The file currently in this folder is a **placeholder** generated for
`CN=10.110.10.6` (matching the backend's documented deployment IP) — it does
NOT match your real server's private key, so it will NOT work as-is. It
exists so the plugin has something to build against.

Before running `eas build --profile production`:

1. On the backend server, generate (or locate) the real certificate — see
   the backend README's TLS section, e.g.:

   ```bash
   openssl req -x509 -newkey rsa:2048 -nodes \
     -keyout server.key -out server.crt -days 825 \
     -subj "/CN=<your-server-LAN-IP>"
   ```

2. Copy that server's `.crt` (the public certificate — never the `.key`
   file) here, replacing this file:

   ```bash
   cp /path/to/server.crt mobile/certs/backend-ca.pem
   ```

3. If the server's IP/hostname is anything other than `10.110.10.6`, update
   the `hostnames` option for the plugin in `app.json` to match.
4. Rebuild: `eas build --profile production --platform android`.

Only the public certificate goes here — never copy the server's private key
(`.key` file) into the mobile project.

## Deploying before you have a certificate at all

You don't need a certificate to deploy — you can ship over plain HTTP now
and switch to HTTPS later, as a deliberate two-phase rollout, using a
single switch: `EXPO_PUBLIC_BACKEND_USE_HTTPS` in `mobile/.env`.

**Why this needs a real switch, not just "leave the cert out":** Android
9+ (this app targets SDK 36) blocks plain HTTP by default. Without
explicitly telling Android's network security policy to allow it for the
backend's hostname, the app doesn't just skip cert-checking — it refuses
to connect at all, failing with `CLEARTEXT communication ... not
permitted`. `EXPO_PUBLIC_BACKEND_USE_HTTPS` is read by both
`src/config/env.ts` (picks the URL scheme the app connects with) and
`plugins/withBackendCertPinning.js` (decides whether to explicitly permit
cleartext for that hostname), so they can't drift out of sync.

**Phase 1 — no certificate yet:**

1. Leave `EXPO_PUBLIC_BACKEND_USE_HTTPS` unset (or `false`) in `mobile/.env`.
2. Leave the backend's `SSL_CERT_PATH`/`SSL_KEY_PATH` unset too — it
   automatically falls back to plain HTTP (see backend README).
3. Build and deploy normally. The placeholder cert in this folder is never
   used in this phase — nothing needs updating here yet.

**Phase 2 — once you have a real certificate:**

1. Generate the backend's TLS certificate (see the top of this file) and
   copy `server.crt` into `certs/backend-ca.pem`, replacing the placeholder.
2. Set the backend's `SSL_CERT_PATH`/`SSL_KEY_PATH` and redeploy it.
3. Set `EXPO_PUBLIC_BACKEND_USE_HTTPS=true` in `mobile/.env`.
4. Rebuild the mobile app from scratch — prebuild, then the release
   build — and redistribute it. This is a real rebuild, not a config
   change on an already-installed app: the scheme and cleartext policy are
   both baked in at build time.

Prebuild logs which mode it picked, so you can confirm before building:
`[withBackendCertPinning] EXPO_PUBLIC_BACKEND_USE_HTTPS is not "true" — building for plain HTTP ...`
means phase 1; silence from that plugin means phase 2 (HTTPS, cert pinned).

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

```
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
