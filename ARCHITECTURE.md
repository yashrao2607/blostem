# ELI AI — System Architecture

> Deep technical reference for contributors and developers.
> For usage and setup, see the [README](./README.md).

---

## Table of Contents

- [Process Model](#process-model)
- [Voice Command Pipeline](#voice-command-pipeline)
- [Vision & Screen Analysis](#vision--screen-analysis)
- [Mobile Telekinesis (ADB)](#mobile-telekinesis-adb)
- [Local RAG & Semantic Search](#local-rag--semantic-search)
- [Security & Vault Architecture](#security--vault-architecture)
- [Workflow Automation Engine](#workflow-automation-engine)
- [IPC Handler Reference](#ipc-handler-reference)

---

## Process Model

ELI uses Electron's multi-process architecture to isolate privileged OS operations from the React UI. The **Main Process** is the only context with access to `fs`, `child_process`, `adb`, and native APIs. The **Renderer Process** (React) communicates exclusively through `ipcRenderer.invoke()` calls exposed via a `contextBridge` in the **Preload** script.

```mermaid
graph TB
    subgraph "Renderer Process — Unprivileged"
        UI["React 19 Dashboard"]
        Widgets["Floating Widgets<br/>(Weather, Stocks, Map, Terminal)"]
        Voice["Web Audio API<br/>(Microphone Stream)"]
        Camera["MediaDevices<br/>(Camera / Screen Capture)"]
    end

    subgraph "Preload — Context Bridge"
        Bridge["contextBridge.exposeInMainWorld()<br/>window.electron.ipcRenderer.invoke()"]
    end

    subgraph "Main Process — Privileged (Node.js)"
        Router["Neural Router<br/>(Gemini / Groq LLM)"]
        Handlers["40+ IPC Handlers"]
        Vault["SafeStorage Vault<br/>(OS Keychain Encryption)"]
        Store["electron-store<br/>(Local Persistence)"]
    end

    subgraph "External Systems"
        FS["Local File System"]
        Shell["OS Shell / Terminal"]
        ADB["Android Debug Bridge"]
        APIs["Cloud APIs<br/>(Gemini, Groq, Tavily, Notion)"]
    end

    UI --> Bridge
    Widgets --> Bridge
    Voice --> Bridge
    Camera --> Bridge

    Bridge --> Router
    Bridge --> Handlers

    Router --> APIs
    Handlers --> FS
    Handlers --> Shell
    Handlers --> ADB
    Handlers --> Vault
    Handlers --> Store
```

### Key Design Decisions

| Decision | Rationale |
| :--- | :--- |
| `sandbox: false` | Required for `nut-js` desktop automation and native module access |
| `webSecurity: false` | Required for cross-origin AI API calls from renderer dev server |
| `backgroundThrottling: false` | Voice/vision processing must continue when window is unfocused |
| Single-instance lock | Prevents multiple ELI instances from conflicting on IPC ports |

---

## Voice Command Pipeline

ELI uses Google's Gemini multimodal live API through a WebSocket connection. Audio is streamed in real-time from the browser's Web Audio API, and the model responds with both text and tool calls.

```mermaid
sequenceDiagram
    participant User
    participant Renderer as Renderer (React)
    participant WS as WebSocket (Gemini Live)
    participant Main as Main Process
    participant OS as Operating System

    User->>Renderer: Speaks command
    Renderer->>Renderer: Web Audio API captures PCM stream
    Renderer->>WS: Stream audio chunks (base64)
    WS->>WS: Gemini processes audio + context
    WS-->>Renderer: Tool call response (JSON)
    Renderer->>Main: ipcRenderer.invoke("tool-name", payload)
    Main->>OS: Execute system action
    OS-->>Main: Result
    Main-->>Renderer: Response data
    Renderer->>WS: Send tool result back
    WS-->>Renderer: Natural language confirmation
    Renderer->>User: Audio/visual feedback
```

### Voice State Machine

```mermaid
stateDiagram-v2
    [*] --> Disconnected
    Disconnected --> Connecting: toggleSystem()
    Connecting --> Connected: WebSocket open
    Connecting --> Disconnected: Connection error
    Connected --> Muted: toggleMic()
    Muted --> Connected: toggleMic()
    Connected --> Disconnected: toggleSystem()
    Connected --> Disconnected: Watchdog timeout
```

The **Watchdog** (`IndexRoot.tsx`) polls `eliService.isConnected` every 1 second. If the WebSocket drops silently, it resets the UI state and stops vision processing automatically.

---

## Vision & Screen Analysis

ELI captures and analyzes desktop content every 2 seconds when vision mode is active. Two modes are supported:

| Mode | Source | Use Case |
| :--- | :--- | :--- |
| `camera` | `getUserMedia({ video })` | Face recognition, object detection |
| `screen` | `desktopCapturer` → `getUserMedia` | UI analysis, OCR, screen understanding |

```mermaid
graph LR
    subgraph "Frame Capture (Every 2s)"
        Source["desktopCapturer / Camera"]
        Video["Hidden <video> element"]
        Canvas["<canvas> 800×450"]
        B64["JPEG Base64 (quality: 0.6)"]
    end

    subgraph "AI Processing"
        WS["Gemini Live WebSocket"]
        Context["Contextual Understanding"]
        Tools["Tool Call Dispatch"]
    end

    Source --> Video
    Video --> Canvas
    Canvas --> B64
    B64 --> WS
    WS --> Context
    Context --> Tools
```

### Screen Peeler (OCR Pipeline)

For explicit OCR requests, the **Screen Peeler** handler captures the screen, runs Tesseract.js locally, and returns structured text:

```mermaid
graph TD
    Capture["screenshot-desktop"] --> Buffer["PNG Buffer"]
    Buffer --> Tesseract["Tesseract.js (eng.traineddata)"]
    Tesseract --> RawText["Raw OCR Text"]
    RawText --> LLM["Gemini Pro<br/>(Contextualize + Structure)"]
    LLM --> Result["Structured Response"]
```

---

## Mobile Telekinesis (ADB)

ELI controls Android devices through a TCP/IP ADB bridge. All commands route through `child_process.exec()` in the Main process.

```mermaid
graph TD
    subgraph "ELI Desktop (Main Process)"
        IPC["ipcMain.handle('adb-*')"]
        Exec["execAsync('adb -s ip:port shell ...')"]
    end

    subgraph "Android Device (TCP/IP)"
        Battery["dumpsys battery<br/>→ level, temp, charging"]
        Storage["df -h /data<br/>→ used, total, percent"]
        Notifs["dumpsys notification --noredact<br/>→ title, text parsing"]
        Input["input tap x y<br/>input swipe x1 y1 x2 y2"]
        Apps["monkey -p pkg -c LAUNCHER 1<br/>am force-stop pkg"]
        Hardware["svc wifi enable/disable<br/>svc bluetooth enable/disable"]
    end

    IPC --> Exec
    Exec --> Battery
    Exec --> Storage
    Exec --> Notifs
    Exec --> Input
    Exec --> Apps
    Exec --> Hardware
```

### Connection Flow

```mermaid
sequenceDiagram
    participant UI as Phone View (React)
    participant Main as Main Process
    participant ADB as ADB Daemon
    participant Phone as Android Device

    UI->>Main: invoke("adb-connect", {ip, port})
    Main->>ADB: adb connect ip:port
    ADB->>Phone: TCP handshake
    Phone-->>ADB: Connected
    ADB-->>Main: "connected to ip:port"
    Main->>ADB: adb shell getprop ro.product.model
    ADB-->>Main: "PIXEL 7"
    Main->>Main: Save to Connect-mobile.json
    Main-->>UI: { success: true }
```

---

## Local RAG & Semantic Search

ELI implements a **hybrid search engine** that combines vector-semantic search with native filesystem crawling.

```mermaid
graph TD
    subgraph "Indexing Pipeline"
        Folder["Target Directory"] --> Scanner["Recursive File Scanner<br/>(Ignores node_modules, .git, etc.)"]
        Scanner --> Filter["Extension Filter<br/>(.ts, .md, .json, .py, .html, .css)"]
        Filter --> Chunk["Content Chunking<br/>(First 1000 chars)"]
        Chunk --> Embed["Xenova/all-MiniLM-L6-v2<br/>(Local Transformers.js)"]
        Embed --> DB["LanceDB Table<br/>(vector, file_path, snippet)"]
    end

    subgraph "Retrieval Pipeline"
        Query["User Query"]
        Query --> Semantic["Path A: Semantic Search"]
        Query --> Native["Path B: Native Crawl"]

        Semantic --> EmbedQ["Embed Query Vector"]
        EmbedQ --> Search["LanceDB .search().limit(3)"]
        Search --> SemResults["Content Memory Matches"]

        Native --> Groq["Groq Llama 3.1<br/>(Extract keywords + target root)"]
        Groq --> Crawl["BFS File Crawler<br/>(All drives, max 15 results)"]
        Crawl --> NatResults["Native Deep System Matches"]
    end

    SemResults --> Merge["Consolidated Results"]
    NatResults --> Merge
```

### Embedding Model

| Property | Value |
| :--- | :--- |
| Model | `Xenova/all-MiniLM-L6-v2` |
| Dimensions | 384 |
| Runtime | Transformers.js (ONNX, runs locally) |
| Pooling | Mean |
| Storage | LanceDB (Arrow-based columnar store) |

---

## Security & Vault Architecture

```mermaid
graph LR
    subgraph "User Input"
        Settings["Settings UI<br/>(API Key Entry)"]
    end

    subgraph "Encryption (Main Process)"
        Safe["electron.safeStorage.encryptString()"]
        B64["Base64 Encoding"]
        File["eli_secure_vault.json<br/>(Encrypted blob on disk)"]
    end

    subgraph "Runtime Decryption"
        Read["fs.readFileSync(vault)"]
        Decrypt["safeStorage.decryptString()"]
        Memory["In-Memory Key<br/>(Never persisted as plaintext)"]
    end

    subgraph "Usage"
        API["HTTPS Request to<br/>Gemini / Groq / Tavily"]
    end

    Settings --> Safe
    Safe --> B64
    B64 --> File

    File --> Read
    Read --> Decrypt
    Decrypt --> Memory
    Memory --> API
```

### Encryption Backends

| OS | Backend | Method |
| :--- | :--- | :--- |
| Windows | DPAPI | `CryptProtectData()` — tied to current Windows user profile |
| macOS | Keychain | `SecItemAdd()` — stored in login keychain |
| Linux | Secret Service | `gnome-keyring` or `kwallet` |

### Vault Lock (PIN / Biometric)

```mermaid
stateDiagram-v2
    [*] --> Unlocked: App Launch + Auth
    Unlocked --> PINEntry: Lock triggered
    PINEntry --> Unlocked: Correct PIN
    PINEntry --> Locked: 3 failed attempts
    Unlocked --> FaceVerify: Biometric lock enabled
    FaceVerify --> Unlocked: Face match (face-api.js)
    FaceVerify --> Locked: No match
    Locked --> PINEntry: Retry after timeout
```

---

## Workflow Automation Engine

Workflows are stored as JSON graphs with **Nodes** (actions) and **Edges** (execution order). The visual editor uses React Flow.

```mermaid
graph LR
    subgraph "Workflow Definition (JSON)"
        N1["Node 1: open-app<br/>{appName: 'Spotify'}"]
        N2["Node 2: run-terminal<br/>{cmd: 'npm run dev'}"]
        N3["Node 3: send-whatsapp<br/>{text: 'Starting work!'}"]
    end

    N1 --> N2
    N2 --> N3
```

### Schema

```json
{
  "name": "Morning Routine",
  "description": "Auto-launch dev environment",
  "nodes": [
    { "id": "1", "type": "open-app", "data": { "appName": "VS Code" } },
    { "id": "2", "type": "run-terminal", "data": { "cmd": "cd ~/project && npm run dev" } }
  ],
  "edges": [
    { "source": "1", "target": "2" }
  ],
  "updatedAt": 1712345678000
}
```

Workflows are persisted to `eli_workflows.json` in the Electron `userData` directory.

---

## IPC Handler Reference

Complete list of registered `ipcMain.handle` channels:

### System & Files

| Channel | Source File | Payload | Purpose |
| :--- | :--- | :--- | :--- |
| `get-system-info` | `get-system-info.ts` | `void` | CPU, RAM, OS details |
| `open-application` | `app-launcher.ts` | `{ appName }` | Launch native app |
| `close-application` | `app-launcher.ts` | `{ appName }` | Kill process |
| `run-terminal` | `terminal-control.ts` | `{ command }` | Execute shell command |
| `read-file` | `file-read.ts` | `{ filePath }` | Read file contents |
| `write-file` | `file-write.ts` | `{ filePath, content }` | Write to disk |
| `manage-file` | `file-ops.ts` | `{ action, source, dest }` | Copy/move/delete |
| `open-file` | `file-open.ts` | `{ filePath }` | Open with default app |
| `read-directory` | `dir-load.ts` | `{ dirPath }` | List directory contents |
| `scan-files` | `file-launcher.ts` | `{ dirPath }` | Deep file scan |

### Search & Memory

| Channel | Source File | Payload | Purpose |
| :--- | :--- | :--- | :--- |
| `index-folder` | `file-search.ts` | `{ folderPath }` | Vectorize directory into LanceDB |
| `search-files` | `file-search.ts` | `{ query, groqKey }` | Hybrid semantic + native search |
| `save-memory` | `ELI-memory-save.ts` | `{ data }` | Save conversation memory |
| `load-memory` | `ELI-memory-save.ts` | `void` | Retrieve conversation memory |
| `save-note` | `notes-manager.ts` | `{ title, content }` | Create markdown note |
| `read-notes` | `notes-manager.ts` | `void` | List all saved notes |
| `save-permanent-memory` | `permanent-memory.ts` | `{ key, value }` | Persistent identity store |
| `get-permanent-memory` | `permanent-memory.ts` | `{ key }` | Retrieve identity data |

### AI Services

| Channel | Source File | Payload | Purpose |
| :--- | :--- | :--- | :--- |
| `google-search` | `web-agent.ts` | `{ query }` | Smart web search + scrape |
| `hack-website` | `reality-hacker.ts` | `{ url, mode }` | DOM injection/theme override |
| `ELI-coder` | `ELI-coder.ts` | `{ prompt }` | AI code generation |
| `deep-research` | `deep-research.ts` | `{ query }` | Multi-source autonomous research |
| `oracle-query` | `RAG-oracle.ts` | `{ query }` | Local codebase RAG |
| `oracle-ingest` | `RAG-oracle.ts` | `{ dirPath }` | Ingest codebase into vector DB |

### Mobile (ADB)

| Channel | Source File | Payload | Purpose |
| :--- | :--- | :--- | :--- |
| `adb-connect` | `adb-manager.ts` | `{ ip, port }` | Connect to Android device |
| `adb-disconnect` | `adb-manager.ts` | `void` | Disconnect device |
| `adb-telemetry` | `adb-manager.ts` | `void` | Battery, storage, model info |
| `adb-screenshot` | `adb-manager.ts` | `void` | Capture phone screen |
| `adb-tap` | `adb-manager.ts` | `{ xPercent, yPercent }` | Remote touch input |
| `adb-swipe` | `adb-manager.ts` | `{ direction }` | Remote swipe gesture |
| `adb-get-notifications` | `adb-manager.ts` | `void` | Scrape notification tray |
| `adb-push-file` | `adb-manager.ts` | `{ sourcePath, destPath }` | PC → Phone file transfer |
| `adb-pull-file` | `adb-manager.ts` | `{ sourcePath, destPath }` | Phone → PC file transfer |
| `adb-open-app` | `adb-manager.ts` | `{ packageName }` | Launch Android app |
| `adb-close-app` | `adb-manager.ts` | `{ packageName }` | Force-stop Android app |
| `adb-hardware-toggle` | `adb-manager.ts` | `{ setting, state }` | Toggle WiFi/BT/GPS/etc. |

### Desktop Automation

| Channel | Source File | Payload | Purpose |
| :--- | :--- | :--- | :--- |
| `ghost-control` | `ghost-control.ts` | `{ action, ...params }` | Mouse/keyboard automation (nut-js) |
| `screen-peeler-*` | `ScreenPeeler-handler.ts` | varies | OCR & screen-to-code |
| `phantom-*` | `PhantomControl-handler.ts` | varies | Global keyboard injection |
| `smart-dropzone-*` | `SmartDropZone-Handler.ts` | varies | Autonomous folder sorting |
| `telekinesis-*` | `telekinesis.ts` | varies | Window management |

### Security & Auth

| Channel | Source File | Payload | Purpose |
| :--- | :--- | :--- | :--- |
| `secure-save-keys` | `index.ts` | `{ groqKey, geminiKey }` | Encrypt + save API keys |
| `secure-get-keys` | `index.ts` | `void` | Decrypt + return API keys |
| `check-keys-exist` | `index.ts` | `void` | Check if vault file exists |
| `get-device-details` | `index.ts` | `void` | Device fingerprint (SHA-256) |
| `lock-system-*` | `lock-system.ts` | varies | PIN lock/unlock |
| `security-vault-*` | `Security.ts` | varies | Biometric lock (face-api.js) |
