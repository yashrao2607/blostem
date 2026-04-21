import fs from 'fs'
import fsPromises from 'fs/promises'
import path from 'path'
import { IpcMain, App, BrowserWindow } from 'electron'

export default function registerIpcHandlers({
  ipcMain,
  app,
  getMainWindow
}: {
  ipcMain: IpcMain
  app: App
  getMainWindow?: () => BrowserWindow | null
}) {
  const CHAT_DIR = path.resolve(app.getPath('userData'), 'Chat')
  const FILE_PATH = path.join(CHAT_DIR, 'eli_memory.json')
  type HistoryEntry = { role: string; content: string; timestamp: string }

  let historyCache: HistoryEntry[] | null = null
  let flushTimer: NodeJS.Timeout | null = null

  const ensureLoaded = async () => {
    if (historyCache) return
    historyCache = []
    try {
      if (!fs.existsSync(CHAT_DIR)) {
        await fsPromises.mkdir(CHAT_DIR, { recursive: true })
      }
      if (fs.existsSync(FILE_PATH)) {
        const data = await fsPromises.readFile(FILE_PATH, 'utf-8')
        const parsed = data ? JSON.parse(data) : []
        historyCache = Array.isArray(parsed) ? parsed : []
      }
    } catch {
      historyCache = []
    }
  }

  const scheduleFlush = () => {
    if (flushTimer) clearTimeout(flushTimer)
    flushTimer = setTimeout(async () => {
      try {
        if (!historyCache) return
        await fsPromises.writeFile(FILE_PATH, JSON.stringify(historyCache, null, 2))
      } catch {}
    }, 120)
  }

  ipcMain.removeHandler('add-message')
  ipcMain.removeHandler('get-history')

  ipcMain.handle('add-message', async (_event, msg) => {
    try {
      await ensureLoaded()
      if (!historyCache) historyCache = []

      const newEntry: HistoryEntry = {
        role: msg.role,
        content: msg.parts?.[0]?.text || msg.content || '',
        timestamp: new Date().toISOString()
      }
      historyCache.push(newEntry)

      if (historyCache.length > 20) historyCache = historyCache.slice(-20)

      scheduleFlush()
      const target = getMainWindow?.()
      if (target && !target.isDestroyed()) {
        target.webContents.send('history-updated')
      }
      return true
    } catch (err) {
      return false
    }
  })

  ipcMain.handle('get-history', async () => {
    try {
      await ensureLoaded()
      return (historyCache || []).map((m: any) => ({
        role: m.role === 'ELI' ? 'model' : m.role,
        content: m.content,
        parts: [{ text: m.content }],
        timestamp: m.timestamp
      }))
    } catch (err) {}
    return []
  })
}
