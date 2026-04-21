import { IpcMain, app } from 'electron'
import fs from 'fs/promises'
import path from 'path'

export default function registerFileWrite(ipcMain: IpcMain) {
  ipcMain.handle('write-file', async (_event, { fileName, content }) => {
    try {
      const resolvedPath = path.isAbsolute(fileName) 
        ? fileName 
        : path.join(require('os').homedir(), fileName)

      const parentDir = path.dirname(resolvedPath)
      await fs.mkdir(parentDir, { recursive: true })

      await fs.writeFile(resolvedPath, content, 'utf-8')
      return `Success. File saved to: ${resolvedPath}`
    } catch (err) {
      return `Error writing file: ${err}`
    }
  })
}
