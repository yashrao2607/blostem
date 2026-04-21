import { BrowserWindow, IpcMain } from 'electron'
import os from 'os'
import { exec } from 'child_process'

let cpuMonitorInterval: NodeJS.Timeout | null = null
let heavyMonitorRunning = false

const runCommand = (cmd: string): Promise<string> => {
  return new Promise((resolve) => {
    exec(cmd, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout) => {
      if (error) {
      }
      resolve(stdout ? stdout.trim() : '')
    })
  })
}

let cpuLastSnapshot = os.cpus()
let cachedTemperatureC: number | null = null
let cachedTemperatureAt = 0
let cachedGpuUsage = '0.0'
let cachedGpuAt = 0

const getSystemTemperature = async (): Promise<number | null> => {
  const now = Date.now()
  if (now - cachedTemperatureAt < 10000) {
    return cachedTemperatureC
  }

  cachedTemperatureAt = now
  if (os.platform() !== 'win32') {
    cachedTemperatureC = null
    return cachedTemperatureC
  }

  // Try CIM first (modern), then WMI (legacy)
  const command =
    'powershell "$t = Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction SilentlyContinue; if($t){$t.CurrentTemperature} else {(Get-WmiObject MSAcpi_ThermalZoneTemperature -Namespace root/wmi).CurrentTemperature}"'
  
  const output = await runCommand(command)
  const lines = output.split('\n').filter(l => l.trim())
  const rawValue = lines.length > 0 ? Number(lines[0]) : NaN

  if (!Number.isFinite(rawValue) || rawValue <= 0) {
    // Last resort: If we absolutely can't get it, but CPU is high, maybe mock a reasonable range (35-65) 
    // to keep the UI alive, but let's try to stay honest for now.
    // If it's still null, we'll try a different common thermal zone property
    cachedTemperatureC = null
    return cachedTemperatureC
  }

  cachedTemperatureC = Math.round(rawValue / 10 - 273.15)
  return cachedTemperatureC
}

function getSystemCpuUsage() {
  const cpus = os.cpus()
  let idle = 0
  let total = 0
  for (let i = 0; i < cpus.length; i++) {
    const cpu = cpus[i]
    const prevCpu = cpuLastSnapshot[i]
    let currentTotal = 0
    for (const type in cpu.times) currentTotal += cpu.times[type]
    let prevTotal = 0
    for (const type in prevCpu.times) prevTotal += prevCpu.times[type]
    idle += cpu.times.idle - prevCpu.times.idle
    total += currentTotal - prevTotal
  }
  cpuLastSnapshot = cpus
  return total === 0 ? '0.0' : (((total - idle) / total) * 100).toFixed(1)
}

async function getGpuUsage() {
  const now = Date.now()
  if (now - cachedGpuAt < 5000) {
    return cachedGpuUsage
  }

  try {
    const cmd = `powershell "((Get-Counter '\\GPU Engine(*)\\Utilization Percentage').CounterSamples | Measure-Object -Property CookedValue -Sum).Sum"`
    const output = await runCommand(cmd)
    const val = parseFloat(output)
    cachedGpuUsage = isNaN(val) ? '0.0' : val.toFixed(1)
    cachedGpuAt = now
    return cachedGpuUsage
  } catch {
    cachedGpuUsage = '0.0'
    cachedGpuAt = now
    return cachedGpuUsage
  }
}

// Shared state for background monitoring
let currentSystemStats = {
  cpu: '0.0',
  gpu: '0.0',
  memory: { total: '0', free: '0', usedPercentage: '0.0' },
  temperature: null as number | null,
  uptime: '0h'
}
let getMainWindowRef: (() => BrowserWindow | null) | undefined
let lastPushedCpu = Number.NaN
let lastPushedRam = Number.NaN
let lastStatsSentAt = 0
const CPU_DIFF_THRESHOLD = 0.5
const RAM_DIFF_THRESHOLD = 0.5
const MIN_PUSH_INTERVAL_MS = 900

// Low latency CPU monitoring (runs frequently)
const startCpuMonitor = () => {
  if (cpuMonitorInterval) clearInterval(cpuMonitorInterval)
  cpuMonitorInterval = setInterval(() => {
    const totalMem = os.totalmem()
    const freeMem = os.freemem()
    const cpuValue = parseFloat(getSystemCpuUsage())
    const usedPercentageValue = ((totalMem - freeMem) / totalMem) * 100

    currentSystemStats.cpu = Number.isFinite(cpuValue) ? cpuValue.toFixed(1) : '0.0'
    currentSystemStats.memory = {
      total: (totalMem / 1024 ** 3).toFixed(1) + ' GB',
      free: (freeMem / 1024 ** 3).toFixed(1) + ' GB',
      usedPercentage: usedPercentageValue.toFixed(1)
    }
    currentSystemStats.uptime = (os.uptime() / 3600).toFixed(1) + 'h'

    const cpuChanged =
      !Number.isFinite(lastPushedCpu) || Math.abs(cpuValue - lastPushedCpu) >= CPU_DIFF_THRESHOLD
    const ramChanged =
      !Number.isFinite(lastPushedRam) ||
      Math.abs(usedPercentageValue - lastPushedRam) >= RAM_DIFF_THRESHOLD

    if (!cpuChanged && !ramChanged) return

    const now = Date.now()
    if (now - lastStatsSentAt < MIN_PUSH_INTERVAL_MS) return
    lastStatsSentAt = now
    lastPushedCpu = cpuValue
    lastPushedRam = usedPercentageValue

    const target = getMainWindowRef?.()
    if (target && !target.isDestroyed()) {
      target.webContents.send('stats-push', {
        cpu: currentSystemStats.cpu,
        gpu: currentSystemStats.gpu,
        memory: currentSystemStats.memory,
        temperature: currentSystemStats.temperature,
        os: {
          type: 'Windows 11',
          uptime: currentSystemStats.uptime
        }
      })
    }
  }, 1000)
}

// Heavier monitoring (asynchronous, runs independently)
const startHeavyMonitor = async () => {
  if (heavyMonitorRunning) return
  heavyMonitorRunning = true
  while (heavyMonitorRunning) {
    // Run GPU and Temp in parallel to save time
    const [gpu, temp] = await Promise.all([getGpuUsage(), getSystemTemperature()])
    currentSystemStats.gpu = gpu
    currentSystemStats.temperature = temp
    // Poll heavy counters less frequently to avoid process-spawn jank.
    // Increased to 8 seconds - balance between info and performance.
    await new Promise(r => setTimeout(r, 8000))
  }
}

export default function registerSystemHandlers(
  ipcMain: IpcMain,
  options?: { getMainWindow?: () => BrowserWindow | null }
) {
  getMainWindowRef = options?.getMainWindow
  startCpuMonitor()
  startHeavyMonitor()

  ipcMain.removeHandler('get-installed-apps')
  ipcMain.handle('get-installed-apps', async () => {
    try {
      if (os.platform() !== 'win32') return []
      const cmd = `powershell "Get-StartApps | Select-Object Name, AppID | ConvertTo-Json -Depth 1"`
      const jsonOutput = await runCommand(cmd)
      if (!jsonOutput) return []
      let rawData = JSON.parse(jsonOutput)
      const appsArray = Array.isArray(rawData) ? rawData : [rawData]
      return appsArray
        .filter((a: any) => a && a.Name && a.AppID)
        .map((a: any) => ({ name: a.Name.trim(), id: a.AppID.trim() }))
        .sort((a,b) => a.name.localeCompare(b.name))
    } catch { return [] }
  })

  ipcMain.removeHandler('get-system-stats')
  ipcMain.handle('get-system-stats', async () => {
    // Instant return from cache - NO LATENCY
    return {
      cpu: currentSystemStats.cpu,
      gpu: currentSystemStats.gpu,
      memory: currentSystemStats.memory,
      temperature: currentSystemStats.temperature,
      os: {
        type: 'Windows 11',
        uptime: currentSystemStats.uptime
      }
    }
  })

  ipcMain.removeHandler('get-drives')
  ipcMain.handle('get-drives', async () => {
    try {
      const cmd = `powershell "Get-PSDrive -PSProvider FileSystem | Select-Object Name, @{N='FreeGB';E={[math]::round($_.Free/1GB, 2)}}, @{N='TotalGB';E={[math]::round(($_.Used + $_.Free)/1GB, 2)}} | ConvertTo-Json"`
      const output = await runCommand(cmd)
      return output ? JSON.parse(output) : []
    } catch { return [] }
  })
}
