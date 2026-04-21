# ELI Feature Guide (Detailed)

This guide explains the current product features in this codebase and how to use each one step-by-step.

## 1. Main Navigation (What You Get in the UI)

The top navigation includes these primary tabs:

1. `Dashboard`
2. `Macros`
3. `Notes`
4. `Gallery`
5. `Phone`
6. `Settings`

Use these tabs as your main workflow entry points.

---

## 2. Dashboard

### What it does

The Dashboard is the live command center for:

- AI connection state (`CONNECTED` / `STANDBY`)
- Microphone control (mute/unmute)
- Vision input (camera or screen)
- Live transcript feed
- Live system stats (CPU, RAM, temperature, OS)

### How to use it

1. Open `Dashboard`.
2. Click the center call button (phone icon) to connect or disconnect the AI uplink.
3. Use the mic button to mute/unmute voice capture.
4. Use the vision button to start vision.
5. When vision starts, select:
   - `Camera Feed`, or
   - `Screen Share`
6. If vision is active, use the source-switch button to toggle camera/screen.
7. Watch transcript messages on the right side in real time.
8. Check core metrics on the left panel.

### Notes

- Vision controls require system uplink to be active.
- Camera mode includes face analysis overlay (age/gender/expression labels).

---

## 3. Macros (Workflow Editor)

### What it does

Macros let you create reusable automation graphs (node-based workflows), save them, and run them manually.

### Available tool categories

1. `TRIGGERS`
   - `TRIGGER`
   - `WAIT`
2. `SYSTEM`
   - `open_app`
   - `close_app`
   - `set_volume`
3. `AUTOMATION`
   - `ghost_type`
   - `press_shortcut`
   - `click_on_screen`
   - `run_terminal`
4. `WEB_INTELLIGENCE`
   - `google_search`
   - `deep_research`
   - `deploy_wormhole`
   - `close_wormhole`
5. `COMMUNICATION`
   - `send_email`
   - `read_emails`
   - `draft_email`
6. `MOBILE_LINK`
   - `open_mobile_app`
   - `toggle_mobile_hardware`
   - `send_whatsapp`
   - `schedule_whatsapp`

### How to create and run a macro

1. Open `Macros`.
2. Drag tool nodes from the left sidebar onto the canvas.
3. Start with a `TRIGGER` node.
4. Add action nodes and connect them using edges.
5. Click any node to open the parameter drawer.
6. Fill parameters and optional node comment, then click `APPLY CHANGES`.
7. Enter workflow name and description at the top.
8. Click `Save`.
9. Click `Run` to execute the sequence.

### Macro management menu

Use `Neural Patterns` menu to:

1. Load/Edit saved macros on canvas.
2. Duplicate a macro (loads as copy to canvas).
3. Purge/delete a macro.

---

## 4. Notes (Memory Bank)

### What it does

Notes is a markdown-based memory system with read mode and edit mode.

### How to use it

1. Open `Notes`.
2. Click `+` to create a new note.
3. Enter note title and markdown content.
4. Click `Save` to store it.
5. Select any note from the left list to read it.
6. Click the edit icon to update an existing note.
7. Click `Update` to save changes.

### Notes behavior

- Notes auto-refresh from backend every ~3 seconds.
- Viewer renders markdown (including code blocks and GFM formatting).

---

## 5. Gallery (Visual Vault)

### What it does

Shows generated images saved by ELI, with preview, lightbox navigation, and export actions.

### How to use it

1. Open `Gallery`.
2. Scroll image grid (infinite loading is enabled).
3. Click an image tile to open full lightbox view.
4. Use keyboard:
   - Right Arrow: next image
   - Left Arrow: previous image
   - Esc: close lightbox
5. Click `Open Folder` to open file location.
6. Click `Save Copy` to export the image elsewhere.

### Notes behavior

- Gallery list auto-refreshes every ~5 seconds.

---

## 6. Phone (Android Uplink)

### What it does

Wireless ADB connection hub for Android control + monitoring:

- Connect via saved history or manual IP/Port
- Live phone screenshot stream
- Device telemetry (battery/storage/network/model/OS)
- Quick actions (`Camera`, `Lock`, `Wake`, `Home`)
- Notification polling for voice alerts

### How to use it

1. Open `Phone`.
2. If your phone is in history, click `CONNECT` on that device card.
3. If not, click `New Device` and enter:
   - IP address
   - Port (default `5555`)
4. Click `Connect Securely`.
5. Once connected:
   - View live device screen
   - Run quick actions from control panel
   - Watch battery/storage telemetry
6. Click `Disconnect` when done.

### Prerequisite

Phone connection requires wireless ADB setup on Android.  
See: [`PHONE_CONNECTION_GUIDE.md`](./PHONE_CONNECTION_GUIDE.md)

---

## 7. Settings

Settings has 3 sections: `General`, `API Keys`, and `Security`.

### 7.1 General

#### Features

- AI Personality prompt editor (max 150 words)
- User name / operator designation
- Voice profile (`FEMALE` or `MALE`)

#### How to use

1. Open `Settings` -> `General`.
2. Enter personality prompt and click `Save`.
3. Enter operator name and save.
4. Choose voice profile.

#### Important behavior

- Voice profile changes are locked while system is online.

### 7.2 API Keys

#### Features

Input fields for:

1. Gemini
2. Groq
3. Hugging Face
4. Notion
5. Tailvy

#### How to use

1. Open `Settings` -> `API Keys`.
2. Paste your keys in the relevant fields.
3. Click `Save All Keys`.

#### Important behavior

- Keys are persisted locally.
- Gemini/Groq are also sent to secure vault save flow.

### 7.3 Security

#### Features

- PIN-protected vault unlock
- Update master 4-digit PIN
- Face biometric enrollment

#### How to use

1. Open `Settings` -> `Security`.
2. Enter existing PIN and click `UNLOCK`.
3. To rotate PIN, enter new 4-digit PIN and save.
4. To add biometrics, click `Enroll New Identity` and keep face stable in frame.

---

## 8. Floating/Auto Widgets (Event-Driven Panels)

These widgets are mounted globally and appear when triggered by AI actions:

1. `MapView` (location/route visual)
2. `WeatherWidget`
3. `StockWidget`
4. `ImageWidget` (image generation + auto-save to gallery)
5. `EmailWidget` (email listing/preview)
6. `LiveCodingWidget` (code stream + open in VS Code)
7. `WormholeWidget` (public URL when wormhole opens)
8. `RAG Oracle Widget` (local knowledge ingestion + query state)
9. `DeepResearchWidget`
10. `SemanticSearchWidget`
11. `SmartDropZonesWidget`
12. `TerminalOverlay`

### How to use them

These are usually not opened from tabs. They appear based on AI task context.  
Example trigger intents:

1. "Show weather in Mumbai"
2. "Compare AAPL vs MSFT"
3. "Generate an image of a cyberpunk skyline"
4. "Open wormhole on port 3000"
5. "Research <topic> deeply and summarize"
6. "Search my local documents for <keyword>"

---

## 9. Optional Apps View (Code Present)

There is also an `APP.tsx` view that lists installed desktop applications and opens them on click.

### What it does

- Shows indexed installed apps in a grid
- Supports infinite list loading
- Clicking a card invokes app launch

### How to use it

If this view is routed/enabled in your build:

1. Open `Apps`.
2. Scroll to find an installed application.
3. Click card to launch the app.

---

## 10. Recommended First-Time Setup Flow

1. Go to `Settings` -> `API Keys` and save required keys.
2. Go to `Settings` -> `General` and define personality + user name.
3. Open `Dashboard` and connect system uplink.
4. Verify mic/vision controls on Dashboard.
5. Connect Android from `Phone` (optional).
6. Build and run a simple macro in `Macros`.
7. Use `Notes` and `Gallery` for memory and generated media review.

---

## 11. Quick Troubleshooting

1. If system connection fails:
   - Ensure required API key is saved in `Settings -> API Keys`.
2. If vision does not start:
   - Connect uplink first, then start vision.
3. If phone cannot connect:
   - Verify device is on same Wi-Fi, wireless debugging active, and screen unlocked.
4. If voice profile cannot be changed:
   - Disconnect system first (voice setting is locked while online).
5. If macro run fails:
   - Check missing parameters in node editor and save the workflow again.

