let runningAppsCache: string[] = []
let runningAppsCacheAt = 0
let runningAppsInFlight: Promise<string[]> | null = null
export const RUNNING_APPS_TTL_MS = 5000

export const getRunningApps = async (): Promise<string[]> => {
  const now = Date.now()
  if (runningAppsCache.length > 0 && now - runningAppsCacheAt < RUNNING_APPS_TTL_MS) {
    return runningAppsCache
  }
  if (runningAppsInFlight) return runningAppsInFlight

  runningAppsInFlight = window.electron.ipcRenderer
    .invoke('get-running-apps')
    .then((apps: any) => (Array.isArray(apps) ? apps : []))
    .catch(() => [])
    .then((apps: string[]) => {
      runningAppsCache = apps
      runningAppsCacheAt = Date.now()
      return apps
    })
    .finally(() => {
      runningAppsInFlight = null
    })

  return runningAppsInFlight
}
