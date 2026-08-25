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
