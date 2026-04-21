# Project Audit + Rename Report

Generated on: 2026-04-08  
Project root: `d:\next-gen\Next-Gen-Friend`

## 1. Scope Completed

1. Reviewed features and endpoint wiring (renderer IPC invokes vs main IPC handlers).
2. Checked for potentially non-working or unreachable features.
3. Normalized personal signature/identity references to `Boss`.
4. Verified compile health after changes.

## 2. Endpoint Audit Summary

- Renderer `ipcRenderer.invoke(...)` channels found: **80**
- Main `ipcMain.handle(...)` channels found: **86**
- Invoked channels with no matching handler: **2**

### 2.1 Problems Found (likely non-working features)

1. **Missing handler: `deploy-wormhole`**
   - Invoked from:
     - `src/renderer/src/views/WorkFlowEditor.tsx`
     - `src/renderer/src/services/ELI-voice-ai.ts`
   - Existing handler in main is named:
     - `open-wormhole` in `src/main/services/wormhole.ts`
   - Impact:
     - Macro/tool flow for “deploy wormhole” can fail at runtime due to channel mismatch.

2. **Missing handler: `create-directory`**
   - Invoked from:
     - `src/renderer/src/functions/file-manager-api.ts` (`createFolder`)
   - No `ipcMain.handle('create-directory', ...)` found in `src/main`.
   - Impact:
     - “create folder” tool path can fail at runtime.

### 2.2 Handlers currently not invoked by renderer code (non-blocking)

- `check-keys-exist`
- `check-vault-status`
- `close-drop-zone-ui`
- `consume-pending-oauth-callback`
- `file:reveal`
- `get-device-details`
- `ghost-drag-and-drop`
- `spawn-drop-zone-ui`

## 3. Feature Audit Summary

### Working/available core surfaces

- Dashboard, Macros, Notes, Gallery, Phone, Settings are wired in `src/renderer/src/UI/ELI.tsx`.

### Feature gap found

1. **Apps view exists but is not wired in navigation**
   - File exists: `src/renderer/src/views/APP.tsx`
   - No import/use of this view in `ELI.tsx` tab routing.
   - Impact:
     - Apps UI is currently unreachable from the main tab navigation.

## 4. Identity Cleanup (`Boss`)

### Files updated

1. `CODE_OF_CONDUCT.md`
2. `CONTRIBUTING.md`
3. `electron-builder.yml`
4. `LICENSE`
5. `package.json`
6. `README.txt`
7. `SECURITY.md`
8. `src/renderer/src/functions/gallery-managet-api.ts`
9. `src/renderer/src/services/ELI-voice-ai.ts`
10. `src/main/logic/reality-hacker.ts`

### Cleanup verification

- Command run: targeted global searches for personal names/handles/emails/social IDs.
- Result: cleaned references in documentation, metadata, and runtime prompts.

## 5. Build/Type Verification

1. `npm run typecheck` -> **Passed**
2. `npm run build` -> **Passed**

## 6. Capability Validation (Requested)

| Capability | Status | Notes |
|---|---|---|
| Connected Ecosystem Devices | **Restricted (Setup Required)** | Device/API integrations exist, but require external setup (ADB pairing, account auth, API keys, network). |
| Local File & Process Control | **Partially Working** | Read/write/file ops and app open/close are wired. Folder creation path is broken due missing `create-directory` IPC handler. |
| Semantic Vector Search | **Restricted (Setup Required)** | Index/search pipeline is wired, but practical search requires setup and `groqKey` for query decomposition flow. |
| Voice Latency Engine | **Restricted (Setup Required)** | Realtime voice engine is wired, but requires valid Gemini key, microphone permission, and live internet. |
| Mobile Notification Intercept | **Restricted (Setup Required)** | Implemented via `adb-get-notifications`, requires active Android ADB connection. |
| Mobile Screen Execution (Tap/Swipe) | **Restricted (Setup Required)** | Implemented via `adb-tap` / `adb-swipe`, requires active Android ADB connection. |
| Live Web Hacking (CSS/JS Injection) | **Working (With Site Variance)** | `hack-website` handler is present and injection flow runs; output varies by site structure. |
| Deploy Localhost Wormholes | **Partially Working / Broken in Macro Path** | `open-wormhole` works, but macro/AI execution uses missing `deploy-wormhole` channel and can fail. |
| Autonomous Email Dispatch | **Restricted (Currently Blocked in This Repo State)** | Gmail handlers exist, but `credentials.json` is required and currently absent, so login/send/draft flow is blocked until configured. |
| Biometric Security (Face ID) | **Restricted (Setup Required)** | Face vault handlers and enrollment flow are present; requires camera access and local model assets. |
| HuggingFace Image Generation | **Restricted (Setup Required)** | Feature is implemented, but requires HF API key and is subject to provider availability/rate/model warmup. |

### 6.1 Not Working / Broken Items from the requested list

1. Local File & Process Control (folder creation sub-capability): broken IPC channel (`create-directory` missing).
2. Deploy Localhost Wormholes (macro/AI path): broken IPC channel mismatch (`deploy-wormhole` invoked but only `open-wormhole` handled).

### 6.2 Restricted Items from the requested list

1. Connected Ecosystem Devices
2. Semantic Vector Search
3. Voice Latency Engine
4. Mobile Notification Intercept
5. Mobile Screen Execution (Tap/Swipe)
6. Autonomous Email Dispatch (currently blocked until `credentials.json` is provided)
7. Biometric Security (Face ID)
8. HuggingFace Image Generation

## 7. Final Status

- Requested identity cleanup is complete across the codebase (`Boss` naming).
- Endpoint, feature, and requested capability audit completed.
- Broken and restricted capability items are explicitly listed above.
