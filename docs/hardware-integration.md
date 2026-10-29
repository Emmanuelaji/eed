# Connecting a real fingerprint scanner

**No scanner model has been verified with this project.** A web page cannot talk to arbitrary USB fingerprint readers, so EED uses an adapter interface (`src/services/biometric/BiometricInterface.js`):

`getDeviceStatus()`, `enroll(studentReference)`, `identify()`, `verify(studentReference)`, `remove(studentReference)`

Adapters: `MockBiometricAdapter` (development only), `LocalBiometricBridgeAdapter` (HTTP to a trusted local program), `HardwareBiometricAdapter` (placeholder; intentionally unimplemented).

## Recommended architecture
Scanner → vendor SDK/driver → **local bridge** (small service on the attendance PC, listening on `127.0.0.1`) → browser (`VITE_BIOMETRIC_MODE=bridge`).
The bridge captures and **matches on the device/PC**; EED only receives an **opaque template reference** and stores that reference (`biometric_enrollments.template_ref`). Never send raw images or templates to Supabase.

## Bridge HTTP contract (JSON)
| Request | Response |
|---|---|
| `GET /status` | `{ "connected": true, "deviceId": "...", "model": "...", "message": "" }` |
| `POST /enroll` `{ "studentReference": "CSC/22/001" }` | `{ "success": true, "templateReference": "<opaque, ≥ 8 chars, unique per finger>" }` or `{ "success": false, "code": "DEVICE_ERROR", "message": "..." }` |
| `POST /identify` `{}` (blocks until a finger is placed or times out) | `{ "success": true, "templateReference": "..." }` or `{ "success": false, "code": "NO_MATCH" \| "TIMEOUT" \| "DEVICE_ERROR" }` |
| `POST /verify` `{ "studentReference": "..." }` | `{ "success": true }` |
| `POST /remove` `{ "studentReference": "..." }` | `{ "success": true }` |

Requirements for the bridge you build:
1. Bind to `127.0.0.1` only. Send CORS `Access-Control-Allow-Origin` for your exact EED origin only (not `*`).
2. Add a shared secret or origin check so other local web pages cannot trigger scans (extend `LocalBiometricBridgeAdapter.call` with an auth header).
3. The `templateReference` must be stable for the same finger across scans and unique across students (EED rejects reuse with `TEMPLATE_IN_USE`).
4. Do not log or persist fingerprint images/templates outside the device's secure store.
5. Map vendor errors to `DEVICE_ERROR` / `NO_MATCH` / `TIMEOUT` so the station shows the right screen.

## Steps
1. Pick a scanner whose vendor provides an SDK for your OS and supports on-device or on-PC 1:N identification. Install the vendor driver.
2. Build the bridge with that SDK to the contract above. Test it with `curl` first.
3. Set `VITE_BIOMETRIC_MODE=bridge` and `VITE_BIOMETRIC_BRIDGE_URL`, rebuild/redeploy.
4. Open `/scanner`: the station polls `/status` every 10 s and shows "Scanner disconnected" when it fails.
5. Enrol a test student, then verify sign-in, sign-out, wrong finger, unplugged-device and override flows **on your hardware** before real use. Document the tested model here.

Remember the browser at the station must be allowed to call `http://127.0.0.1` from an HTTPS page (Chrome permits `127.0.0.1` as a trustworthy origin; verify for your browser).
