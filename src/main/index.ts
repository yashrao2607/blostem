import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  desktopCapturer,
  globalShortcut,
  screen,
  session,
  safeStorage
} from 'electron'
import path, { join } from 'path'
import fs from 'fs'
import fsPromises from 'fs/promises'
import os from 'os'
import crypto from 'crypto'
import http from 'http'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

import registerIpcHandlers from './logic/eli-memory-save'
import registerSystemHandlers from './logic/get-system-info'
import registerFileSearch from './logic/file-search'
import registerFileOps from './logic/file-ops'
import registerFileWrite from './logic/file-write'
import registerFileRead from './logic/file-read'
import registerFileOpen from './logic/file-open'
import registerDirLoader from './logic/dir-load'
import registerFileScanner from './logic/file-launcher'
import registerAppLauncher from './logic/app-launcher'
import registerNotesHandlers from './logic/notes-manager'
import registerWebAgent from './logic/web-agent'
import registerGhostControl from './logic/ghost-control'
import registerterminalControl from './logic/terminal-control'
import registerGalleryHandlers from './logic/gallery-manager'
import registerGmailHandlers from './logic/gmail-manager'
import registerLocationHandlers from './logic/live-location'
import registerAdbHandlers from './logic/adb-manager'
import registerRealityHacker from './logic/reality-hacker'
import registerEliCoder from './services/eli-coder'
import registerTelekinesis from './logic/telekinesis'
import registerPermanentMemory from './logic/permanent-memory'
import registerWormhole from './services/wormhole'
import registerOracle from './services/RAG-oracle'
import registerDeepResearch from './services/deep-research'
import registerWidgetMaker from './auto/widget-manager'
import registerWebsiteBuilder from './auto/website-builder'
import registerWorkflowManager from './workflow/workflow-manager'
import registerDropZoneControl from './handlers/SmartDropZone-Handler'
import registerScreenPeeler from './handlers/ScreenPeeler-handler'
import registerPhantomKeyboard from './handlers/PhantomControl-handler'
import registerSecurityVault from './security/Security'
import registerLockSystem from './security/lock-system'

app.commandLine.appendSwitch('use-fake-ui-for-media-stream')
app.commandLine.appendSwitch(
  'disable-features',
  'AutofillServerCommunication,AutofillAddressProfileSavePrompt'
)

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('ELI', process.execPath, [path.resolve(process.argv[1])])
  }
} else {
  app.setAsDefaultProtocolClient('ELI')
}

const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
}

let mainWindow: BrowserWindow | null = null
let isOverlayMode = false
let pendingOAuthUrl: string | null = null
let oauthCallbackServer: http.Server | null = null

const secureConfigPath = join(app.getPath('userData'), 'eli_secure_vault.json')
const OVERLAY_WIDTH = 490
const OVERLAY_HEIGHT = 64
const OVERLAY_BOTTOM_OFFSET = 34

function extractEliUrl(argv: string[]): string | null {
  return argv.find((arg) => typeof arg === 'string' && arg.startsWith('eli://')) || null
}

function forwardOAuthCallback(url: string) {
  if (!url.startsWith('eli://') && !url.startsWith('http://127.0.0.1:54321/auth/callback')) return

  pendingOAuthUrl = url

  if (!mainWindow) return

  if (mainWindow.isMinimized()) mainWindow.restore()
  if (!mainWindow.isVisible()) mainWindow.show()
  mainWindow.focus()

  if (mainWindow.webContents.isLoading()) {
    // Page is still loading; did-finish-load will pick up pendingOAuthUrl.
    return
  }

  mainWindow.webContents.send('oauth-callback')
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    show: false,
    fullscreen: true,
    autoHideMenuBar: true,
    frame: false,
    transparent: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      backgroundThrottling: false,
    }
  })

  mainWindow.on('ready-to-show', () => {
    if (mainWindow) mainWindow.show()
  })

  mainWindow.webContents.on('console-message', (event, _level, message, _line, sourceId) => {
    const isDevToolsAutofillNoise =
      sourceId.startsWith('devtools://') &&
      (message.includes("'Autofill.enable' wasn't found") ||
        message.includes("'Autofill.setAddresses' wasn't found"))

    if (isDevToolsAutofillNoise) {
      event.preventDefault()
    }
  })

  mainWindow.webContents.on('did-finish-load', () => {
    if (pendingOAuthUrl) {
      mainWindow?.webContents.send('oauth-callback')
    }
  })

  ipcMain.on('window-min', () => setOverlayMode(true))
  ipcMain.on('window-close', () => mainWindow?.close())
  ipcMain.on('window-max', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize()
    else mainWindow?.maximize()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.on('second-instance', (event, commandLine) => {
  if (!event) {
  }
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
  const url = extractEliUrl(commandLine)
  if (url) forwardOAuthCallback(url)
})

function setOverlayMode(enabled: boolean) {
  if (!mainWindow) return

  const primaryDisplay = screen.getPrimaryDisplay()
  const { width, height } = primaryDisplay.workAreaSize

  if (!enabled) {
    mainWindow.setResizable(true)
    mainWindow.setAlwaysOnTop(false)
    mainWindow.setFullScreen(true)
    mainWindow.webContents.send('overlay-mode', false)
  } else {
    mainWindow.setFullScreen(false)
    mainWindow.setBounds({
      width: OVERLAY_WIDTH,
      height: OVERLAY_HEIGHT,
      x: Math.floor(width / 2 - OVERLAY_WIDTH / 2),
      y: height - OVERLAY_HEIGHT - OVERLAY_BOTTOM_OFFSET
    })
    mainWindow.setAlwaysOnTop(true, 'screen-saver')
    mainWindow.setResizable(false)
    mainWindow.webContents.send('overlay-mode', true)
  }
  isOverlayMode = enabled
}

function toggleOverlayMode() {
  setOverlayMode(!isOverlayMode)
}

function startOAuthCallbackServer() {
  if (oauthCallbackServer) return

  oauthCallbackServer = http.createServer((req, res) => {
    const requestUrl = req.url || '/'
    const fullUrl = `http://127.0.0.1:54321${requestUrl}`

    if (requestUrl.startsWith('/auth/callback')) {
      forwardOAuthCallback(fullUrl)

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(`<!doctype html>
<html>
  <head><title>ELI Auth</title></head>
  <body style="font-family: Arial, sans-serif; background: #050505; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh;">
    <div style="text-align: center;">
      <h2>Authentication Complete</h2>
      <p>You can return to ELI-AI.</p>
      <script>window.close();</script>
    </div>
  </body>
</html>`)
      return
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Not found')
  })

  oauthCallbackServer.listen(54321, '127.0.0.1')
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  ipcMain.handle(
    'secure-save-keys',
    async (_, { groqKey, geminiKey, hfKey, notionKey, tavilyKey }) => {
    try {
      const protect = (value: string) => {
        const safe = value || ''
        if (safeStorage.isEncryptionAvailable()) {
          return safeStorage.encryptString(safe).toString('base64')
        }
        return Buffer.from(safe).toString('base64')
      }

      const secureData: Record<string, string> = {
        groq: protect(groqKey),
        gemini: protect(geminiKey),
        hf: protect(hfKey),
        notion: protect(notionKey),
        tavily: protect(tavilyKey)
      }

      await fsPromises.writeFile(secureConfigPath, JSON.stringify(secureData))
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
    }
  )

  ipcMain.handle('secure-get-keys', async () => {
    if (!fs.existsSync(secureConfigPath)) return null
    try {
      const data = JSON.parse(await fsPromises.readFile(secureConfigPath, 'utf8'))
      const unprotect = (value?: string) => {
        if (!value) return ''
        if (safeStorage.isEncryptionAvailable()) {
          return safeStorage.decryptString(Buffer.from(value, 'base64'))
        }
        return Buffer.from(value, 'base64').toString('utf8')
      }

      const groqKey = unprotect(data.groq)
      const geminiKey = unprotect(data.gemini)
      const hfKey = unprotect(data.hf)
      const notionKey = unprotect(data.notion)
      const tavilyKey = unprotect(data.tavily)

      return { groqKey, geminiKey, hfKey, notionKey, tavilyKey }
    } catch (err) {
      return null
    }
  })

  ipcMain.handle('check-keys-exist', () => {
    return fs.existsSync(secureConfigPath)
  })

  ipcMain.handle('consume-pending-oauth-callback', () => {
    const url = pendingOAuthUrl
    pendingOAuthUrl = null
    return url
  })

  ipcMain.handle('get-device-details', () => {
    const host = os.hostname() || 'unknown-host'
    const user = os.userInfo().username || 'unknown-user'
    const platform = os.platform()
    const release = os.release()
    const arch = os.arch()

    const rawFingerprint = `${host}|${user}|${platform}|${release}|${arch}`
    const fingerprint = crypto.createHash('sha256').update(rawFingerprint).digest('hex')

    return {
      fingerprint,
      deviceName: `${host}-${user}`,
      platform,
      osVersion: release,
      arch,
      appVersion: app.getVersion()
    }
  })

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders }
    delete responseHeaders['content-security-policy']
    delete responseHeaders['x-content-security-policy']
    delete responseHeaders['access-control-allow-origin']

    callback({
      responseHeaders,
      statusLine: details.statusLine
    })
  })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  app.on('open-url', (event, url) => {
    event.preventDefault()
    if (url.startsWith('eli://')) forwardOAuthCallback(url)
  })

  startOAuthCallbackServer()

  registerLockSystem()
  registerSecurityVault()
  registerPhantomKeyboard()
  registerScreenPeeler()
  registerDropZoneControl(ipcMain)
  registerWorkflowManager()
  registerWebsiteBuilder()
  registerWidgetMaker()
  registerDeepResearch({ ipcMain })
  registerOracle({ ipcMain })
  registerWormhole({ ipcMain })
  registerPermanentMemory({ ipcMain, app })
  registerTelekinesis({ ipcMain })
  registerEliCoder({ ipcMain, app })
  registerRealityHacker(ipcMain)
  registerAdbHandlers(ipcMain)
  registerLocationHandlers(ipcMain)
  registerGmailHandlers(ipcMain)
  registerGalleryHandlers(ipcMain)
  registerterminalControl(ipcMain)
  registerGhostControl(ipcMain, () => mainWindow)
  registerWebAgent(ipcMain)
  registerNotesHandlers(ipcMain)
  registerAppLauncher(ipcMain)
  registerDirLoader(ipcMain)
  registerFileOpen(ipcMain)
  registerFileSearch(ipcMain)
  registerFileRead(ipcMain)
  registerFileWrite(ipcMain)
  registerFileOps(ipcMain)
  registerFileScanner(ipcMain)
  registerSystemHandlers(ipcMain, { getMainWindow: () => mainWindow })
  registerIpcHandlers({ ipcMain, app, getMainWindow: () => mainWindow })

  ipcMain.handle('get-screen-source', async () => {
    const sources = await desktopCapturer.getSources({ types: ['screen'] })
    return sources[0]?.id
  })

  createWindow()

  const startupUrl = extractEliUrl(process.argv)
  if (startupUrl) {
    forwardOAuthCallback(startupUrl)
  }

  globalShortcut.register('CommandOrControl+Shift+I', () => toggleOverlayMode())
  ipcMain.on('toggle-overlay', () => toggleOverlayMode())

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  if (oauthCallbackServer) {
    oauthCallbackServer.close()
    oauthCallbackServer = null
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
