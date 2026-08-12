# Paperless Mobile

Expo/React Native app for shop-floor staff: view live workstation status,
open and annotate production documents, browse document revisions, search
the BOM archive, and run a kiosk mode for order-completion and
prep-station label printing.

It is the client for the companion **`paperless_backend`** service

---

## 1. Tech stack

| Layer              | Choice                                                  |
| ------------------ | ------------------------------------------------------- |
| Framework          | Expo SDK 54 / React Native 0.81, React 19               |
| Routing            | `expo-router` (file-based, in `app/`)                   |
| Data fetching      | `@tanstack/react-query` + Axios                         |
| Realtime           | `socket.io-client`                                      |
| UI kit             | `react-native-paper`, `@expo/vector-icons`              |
| Drawing/annotation | `react-native-svg` + a custom `DrawingCanvas`           |
| Localization       | Custom lightweight `t()` helper, Czech (`cs.json`) only |
| Testing            | Jest + `jest-expo` + `@testing-library/react-native`    |

## 2. Project layout

```
app/                           # expo-router screens (file-based routing)
├── _layout.tsx                 # Root layout (providers, query client)
├── (tabs)/
│   ├── _layout.tsx              # Bottom tab bar: Workstations / Search / Revisions / Prep queue
│   ├── index.tsx                 # Workstations tab — live status cards
│   ├── search.tsx                # P-BOM / document search
│   ├── revisions.tsx             # Document revision browser
│   └── prep-queue.tsx            # Prep-station queue by date/workplace
├── document/[id].tsx            # Document viewer + annotation (DrawingCanvas)
└── kiosk.tsx                    # Kiosk mode: order completion & prep label printing

src/
├── api/client.ts                # Axios instance; resolves backend base URL
├── services/socket.ts           # Socket.IO client, connects to backend
├── components/                  # DrawingCanvas + other shared UI
│   └── __tests__/                # Component tests + snapshots
├── hooks/
├── i18n/                        # cs.json + t() lookup helper
└── types/index.ts               # Shared TS types (Workstation, Document, etc.)
```

## 3. Screens at a glance

- **Workstations** (`(tabs)/index.tsx`) — cards for each tracked workstation
  with current order + cycle progress, live-updated via Socket.IO
  (`workstation-order-update`, `workstations-updated`) rather than
  polling. Supports importing a product BOM for the current order.
- **Search** — look up P-BOM documents.
- **Revisions** — browse document revision history.
- **Prep queue** — upcoming prep-station work, filterable by date and
  workplace, backed by `GET /prep-queue`.
- **Document viewer** (`document/[id].tsx`) — opens a PDF, lets staff draw
  annotations with `DrawingCanvas`, and saves edited revisions back to the
  server.
- **Kiosk** (`kiosk.tsx`) — a fixed-station mode (keeps the screen awake via
  `expo-keep-awake`) with two sub-modes:
  - *Completion*: pick a workplace, mark an order `complete` /
    `missing_product` / `shipped_incomplete`.
  - *Status*: print prep labels for a selected station.

## 4. Connecting to the backend

`src/api/client.ts` resolves the backend URL automatically depending on how
the app is running:

```ts
// Expo Go / dev client → use the dev machine's IP (from Constants.expoConfig.hostUri)
// Standalone build      → localhost in __DEV__, otherwise a hardcoded prod IP
export const BASE_URL = debuggerHost
  ? `http://${ip}:5300`
  : `http://${__DEV__ ? "localhost" : "10.110.10.6"}:5300`;
```

`src/services/socket.ts` connects a `socket.io-client` instance to that same
`BASE_URL` on load, with `autoConnect: true`.

> **Note:** the production fallback IP (`10.110.10.6`) and port (`5300`) are
> hardcoded. If the backend's deployment host changes, update this file.

## 5. Running locally

```bash
npm install
npm start          # expo start — scan QR with Expo Go, or press a/i/w
npm run android     # expo start --android
npm run ios         # expo start --ios
npm run web          # expo start --web
npm test             # jest (jest-expo preset)
```

The backend (`paperless_backend`) must be running and reachable from your
device/emulator on port `5300` — see its README for setup. When testing on
a physical device via Expo Go, the app auto-detects your dev machine's IP;
no manual config needed as long as phone and computer are on the same
network.

## 6. Localization

UI strings are Czech-only, resolved through a minimal `t(key, params?)`
helper in `src/i18n/index.ts` against `src/i18n/cs.json`. There is no
language switcher or fallback locale — add new strings directly to
`cs.json`.

## 7. How this connects to the backend

This app is a **thin client** over the `paperless_backend` service — almost
no state lives on-device beyond React Query's cache:

| Mobile does this…                             | …by calling backend                                                                                 |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Show live workstation cards                   | `GET /workstations`, refreshed on `workstation-order-update` / `workstations-updated` socket events |
| Import a product BOM for an order             | `POST /workstations/import-pbom`                                                                    |
| Search P-BOM documents                        | `GET /workstations/search-pbom`, `GET /workstations/pbom-types`                                     |
| Browse prep queue                             | `GET /prep-queue`, `GET /prep-queue/workplaces`                                                     |
| Open/view a document                          | `GET /files/:id`, `GET /workstations/documents/:id/render`                                          |
| Save an annotated document                    | `POST /workstations/save-edited`                                                                    |
| Kiosk: mark order completion                  | `POST /workstations/order-completion`                                                               |
| Kiosk: print a prep-station label             | `POST /workstations/print-prep-label`                                                               |
| List employees (kiosk completion attribution) | `GET /employees`, `POST /employees`                                                                 |

The backend is also the one that receives the **actual production-floor
events** (`POST /workstations/order-update` from the production system),
prints the hardware labels, and fans updates out over Socket.IO — the
mobile app never talks to the production system or the label printer
directly. See the [backend repo's README](https://github.com/bourama1/paperless_backend/README.md)
for the full API surface and event list.
