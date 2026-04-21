import { IpcMain } from 'electron'
import { startTunnel } from 'untun'

let activeTunnel: any = null

export default function registerWormhole({ ipcMain }: { ipcMain: IpcMain }) {
  const openWormhole = async (_event: unknown, port: number) => {
    try {
      if (activeTunnel) {
        await activeTunnel.close()
        activeTunnel = null
      }

      activeTunnel = await startTunnel({
        port,
        acceptCloudflareNotice: true
      })

      const tunnelUrl = await activeTunnel.getURL()

      return {
        success: true,
        url: tunnelUrl,
        password: null
      }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  }

  ipcMain.handle('open-wormhole', openWormhole)
  // Backward-compatible alias used by macro/voice flows.
  ipcMain.handle('deploy-wormhole', openWormhole)

  ipcMain.handle('close-wormhole', async () => {
    if (activeTunnel) {
      await activeTunnel.close()
      activeTunnel = null
    }
    return { success: true }
  })
}
