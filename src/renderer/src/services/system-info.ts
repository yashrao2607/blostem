export interface SystemStats {
  cpu: string
  gpu?: string
  memory: {
    total: string
    free: string
    usedPercentage: string
  }
  temperature: number | null
  os: {
    type: string
    uptime: string
  }
}

export interface AppItem {
  name: string
  id: string
}

export interface DriveInfo {
  Name: string
  FreeGB: number
  TotalGB: number
}

let appsCache: AppItem[] = []
let appsCacheAt = 0
let appsInFlight: Promise<AppItem[]> | null = null
const APPS_CACHE_TTL_MS = 5 * 60 * 1000

export const getSystemStatus = async (): Promise<SystemStats | null> => {
  try {
    return await window.electron.ipcRenderer.invoke('get-system-stats')
  } catch (error) {
    return null
  }
}

export const getAllApps = async (): Promise<AppItem[]> => {
  const now = Date.now()
  if (appsCache.length > 0 && now - appsCacheAt < APPS_CACHE_TTL_MS) {
    return appsCache
  }
  if (appsInFlight) return appsInFlight

  appsInFlight = window.electron.ipcRenderer
    .invoke('get-installed-apps')
    .then((apps: any) => (Array.isArray(apps) ? apps : []))
    .catch(() => [])
    .then((apps: AppItem[]) => {
      appsCache = apps
      appsCacheAt = Date.now()
      return apps
    })
    .finally(() => {
      appsInFlight = null
    })

  return appsInFlight
}

export const getDrives = async (): Promise<DriveInfo[]> => {
  try {
    const drives = await window.electron.ipcRenderer.invoke('get-drives')
    const list = Array.isArray(drives) ? drives : [drives]
    return list.filter(Boolean)
  } catch (error) {
    return []
  }
}
