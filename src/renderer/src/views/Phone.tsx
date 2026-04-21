import { memo, useState, useEffect, useRef } from 'react'
import { FaAndroid } from 'react-icons/fa6'
import {
  RiLinkM,
  RiWifiLine,
  RiSmartphoneLine,
  RiSignalWifi3Line,
  RiBattery2ChargeLine,
  RiDatabase2Line,
  RiShutDownLine,
  RiCameraLensLine,
  RiLockPasswordLine,
  RiSunLine,
  RiTerminalBoxLine,
  RiHome5Line,
  RiHistoryLine,
  RiAddLine,
  RiRefreshLine,
  RiPauseCircleLine,
  RiPlayCircleLine,
  RiCloseLine
} from 'react-icons/ri'

type DeviceHistoryEntry = {
  ip: string
  port: string
  model?: string
  lastConnected?: string
}

const PhoneView = ({ glassPanel }: { glassPanel?: string }) => {
  const [ip, setIp] = useState(() => localStorage.getItem('eli_adb_ip') || '')
  const [port, setPort] = useState(() => localStorage.getItem('eli_adb_port') || '5555')
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected'>('idle')
  const [uiMode, setUiMode] = useState<'history' | 'manual'>('history')
  const [errorMsg, setErrorMsg] = useState('')
  const [uiMessage, setUiMessage] = useState('')
  const [activeQuickAction, setActiveQuickAction] = useState<
    'camera' | 'wake' | 'lock' | 'home' | null
  >(null)
  const [screenExpanded, setScreenExpanded] = useState(false)
  const [isScreenPaused, setIsScreenPaused] = useState(false)
  const [deviceHistory, setDeviceHistory] = useState<DeviceHistoryEntry[]>([])
  const [selectedDeviceModel, setSelectedDeviceModel] = useState('UNKNOWN DEVICE')
  const [lastTelemetryAt, setLastTelemetryAt] = useState<number | null>(null)
  const [nowTick, setNowTick] = useState(() => Date.now())

  const screenRef = useRef<HTMLImageElement>(null)
  const isStreaming = useRef(false)
  const isScreenPausedRef = useRef(false)
  const streamTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isScreenFetchInFlight = useRef(false)
  const knownNotifs = useRef<string[]>([])
  const hasAutoConnected = useRef(false)
  const messageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [telemetry, setTelemetry] = useState({
    model: 'UNKNOWN DEVICE',
    os: 'ANDROID --',
    battery: { level: 0, isCharging: false, temp: '0.0' },
    storage: { used: '0 GB', total: '0 GB TOTAL', percent: 0 }
  })

  useEffect(() => {
    isScreenPausedRef.current = isScreenPaused
  }, [isScreenPaused])

  useEffect(() => {
    window.electron.ipcRenderer.invoke('adb-get-history').then((data) => {
      const safeHistory = Array.isArray(data) ? (data as DeviceHistoryEntry[]) : []
      setDeviceHistory(safeHistory)
      if (safeHistory.length > 0 && !hasAutoConnected.current) {
        hasAutoConnected.current = true
        const lastDevice = safeHistory[safeHistory.length - 1]
        if (lastDevice && lastDevice.ip) {
          setIp(lastDevice.ip)
          setPort(String(lastDevice.port))
          connectToDevice(lastDevice.ip, String(lastDevice.port), lastDevice.model)
        }
      }
    })
  }, [])

  const checkNotifications = async () => {
    try {
      const res = await window.electron.ipcRenderer.invoke('adb-get-notifications')
      if (res.success && res.data) {
        const currentNotifs: string[] = res.data
        if (knownNotifs.current.length === 0) {
          knownNotifs.current = currentNotifs
          return
        }
        const newNotifs = currentNotifs.filter((n) => !knownNotifs.current.includes(n))
        if (newNotifs.length > 0) {
          window.dispatchEvent(
            new CustomEvent('ai-force-speak', {
              detail: `System Alert: The user just received a new mobile notification. Announce it out loud briefly: "${newNotifs[0]}"`
            })
          )
          knownNotifs.current = currentNotifs
        }
      }
    } catch (e) {}
  }

  const connectToDevice = async (targetIp: string, targetPort: string, modelHint?: string) => {
    const normalizedIp = targetIp.trim()
    const normalizedPort = String(targetPort || '').trim()
    if (!normalizedIp || !normalizedPort) return setErrorMsg('IP and Port are required.')
    setIp(normalizedIp)
    setPort(normalizedPort)
    localStorage.setItem('eli_adb_ip', normalizedIp)
    localStorage.setItem('eli_adb_port', normalizedPort)
    if (modelHint && modelHint.trim()) {
      setSelectedDeviceModel(modelHint.trim().toUpperCase())
    }
    setStatus('connecting')
    setErrorMsg('')
    try {
      const res = await window.electron.ipcRenderer.invoke('adb-connect', {
        ip: normalizedIp,
        port: normalizedPort
      })
      if (res.success) {
        setStatus('connected')
        setUiMessage('Device connected successfully.')
        isStreaming.current = true
        setNowTick(Date.now())
        await fetchTelemetry()
        startScreenStream()
      } else {
        setStatus('idle')
        setErrorMsg('Device offline. Is Wi-Fi on and screen unlocked?')
      }
    } catch (e) {
      setStatus('idle')
      setErrorMsg('Electron IPC Error.')
    }
  }

  const handleManualConnect = () => {
    connectToDevice(ip, port)
  }

  const handleDisconnect = async () => {
    isStreaming.current = false
    if (streamTimeoutRef.current) {
      clearTimeout(streamTimeoutRef.current)
      streamTimeoutRef.current = null
    }
    try {
      await window.electron.ipcRenderer.invoke('adb-disconnect')
    } catch (e) {}
    setStatus('idle')
    setUiMessage('Disconnected.')
    setLastTelemetryAt(null)
    if (screenRef.current) screenRef.current.src = ''
  }

  const executeQuickCommand = async (action: 'camera' | 'wake' | 'lock' | 'home') => {
    setActiveQuickAction(action)
    try {
      const res = await window.electron.ipcRenderer.invoke('adb-quick-action', { action })
      setUiMessage(res?.success ? `${action.toUpperCase()} executed.` : `Failed: ${action}`)
    } catch (e) {
      setUiMessage(`Failed: ${action}`)
    } finally {
      setTimeout(() => setActiveQuickAction(null), 550)
    }
  }

  const fetchTelemetry = async () => {
    try {
      const res = await window.electron.ipcRenderer.invoke('adb-telemetry')
      if (res.success && res.data) {
        setTelemetry(res.data)
        setLastTelemetryAt(Date.now())
        setNowTick(Date.now())
        if (typeof res.data.model === 'string' && res.data.model.trim()) {
          setSelectedDeviceModel(res.data.model.trim().toUpperCase())
        }
      }
    } catch (e) {}
  }

  const startScreenStream = async () => {
    if (isScreenPausedRef.current) return
    if (!isStreaming.current) return
    if (isScreenFetchInFlight.current) {
      streamTimeoutRef.current = setTimeout(startScreenStream, 450)
      return
    }
    isScreenFetchInFlight.current = true
    try {
      const res = await window.electron.ipcRenderer.invoke('adb-screenshot')
      if (res.success && res.image && screenRef.current) {
        screenRef.current.src = res.image
      }
    } catch (e) {}
    isScreenFetchInFlight.current = false
    if (isStreaming.current && !isScreenPausedRef.current) {
      streamTimeoutRef.current = setTimeout(startScreenStream, 450)
    }
  }

  useEffect(() => {
    let interval: any
    if (status === 'connected') {
      interval = setInterval(() => {
        fetchTelemetry()
        checkNotifications()
      }, 3000)
    }
    return () => clearInterval(interval)
  }, [status])

  useEffect(() => {
    if (status !== 'connected') return
    const heartbeat = setInterval(() => setNowTick(Date.now()), 1000)
    return () => clearInterval(heartbeat)
  }, [status])

  useEffect(() => {
    return () => {
      if (messageTimerRef.current) clearTimeout(messageTimerRef.current)
      isStreaming.current = false
      if (streamTimeoutRef.current) {
        clearTimeout(streamTimeoutRef.current)
        streamTimeoutRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!uiMessage) return
    if (messageTimerRef.current) clearTimeout(messageTimerRef.current)
    messageTimerRef.current = setTimeout(() => setUiMessage(''), 2200)
  }, [uiMessage])

  const handleManualRefresh = async () => {
    await fetchTelemetry()
    if (!isScreenPaused) await startScreenStream()
    setUiMessage('Telemetry refreshed.')
  }

  const toggleScreenStream = async () => {
    const next = !isScreenPaused
    setIsScreenPaused(next)
    isScreenPausedRef.current = next
    if (!next) {
      await startScreenStream()
      setUiMessage('Live screen resumed.')
    } else {
      setUiMessage('Live screen paused.')
    }
  }

  const liveModel =
    telemetry.model && telemetry.model !== 'UNKNOWN DEVICE' ? telemetry.model : selectedDeviceModel
  const thermal = Number(telemetry.battery.temp)
  const thermalText = Number.isFinite(thermal) ? `${thermal.toFixed(1)}degC` : 'N/A'
  const telemetryAgeLabel =
    lastTelemetryAt == null ? 'awaiting sync' : `${Math.max(0, Math.floor((nowTick - lastTelemetryAt) / 1000))}s ago`

  /* â”€â”€ DEVICE HISTORY VIEW â”€â”€ */
  if (status !== 'connected' && uiMode === 'history') {
    return (
      <div className="flex-1 h-full min-h-0 flex flex-col items-center justify-start pt-12 p-8 bg-[#040407] text-zinc-100 overflow-y-auto scrollbar-small animate-in fade-in duration-300">
        <div className="w-full max-w-5xl flex flex-col items-center">
          {/* Header */}
          <div className="flex flex-col items-center text-center mb-14">
            <div className="w-14 h-14 rounded-2xl bg-violet-600/10 border border-violet-500/20 flex items-center justify-center mb-5">
              <RiHistoryLine className="text-violet-400" size={26} />
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Device Archive</h1>
            <p className="text-[11px] text-zinc-500 font-mono tracking-widest mt-2 uppercase">
              Select a target device for uplink
            </p>
          </div>

          {/* Device Cards */}
          <div className="flex flex-wrap justify-center gap-8">
            {deviceHistory.map((dev, i) => (
              <button
                key={i}
                onClick={() => connectToDevice(dev.ip, String(dev.port), dev.model)}
                className="w-52 h-[420px] bg-[#0a0a0f] border-[6px] border-[#1a1a22] hover:border-violet-800/40 rounded-[2.8rem] relative flex flex-col p-1.5 group transition-all duration-400 shadow-2xl hover:shadow-[0_0_48px_rgba(124,58,237,0.15)]"
              >
                {/* Notch */}
                <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-20 h-5 bg-[#1a1a22] rounded-full z-20 group-hover:bg-violet-900/50 transition-colors" />

                <div className="flex-1 bg-gradient-to-b from-[#111118] to-[#09090e] rounded-[2.3rem] overflow-hidden flex flex-col items-center justify-center p-6 relative">
                  <div className="absolute inset-0 bg-violet-600/0 group-hover:bg-violet-600/[0.06] transition-all duration-400 rounded-[2.3rem]" />
                  <RiSmartphoneLine
                    size={56}
                    className="text-zinc-700 group-hover:text-violet-500 mb-5 transition-all duration-400"
                  />
                  <h3 className="text-[13px] font-bold text-white mb-2 tracking-wide text-center z-10 truncate w-full px-2">
                    {dev.model}
                  </h3>
                  <div className="flex items-center gap-1.5 text-[9px] font-mono text-zinc-600 group-hover:text-violet-400/70 z-10 transition-colors">
                    <RiWifiLine size={10} /> {dev.ip}:{dev.port}
                  </div>
                  <div className="mt-7 px-6 py-2 border border-zinc-700/60 group-hover:border-violet-500/50 group-hover:bg-violet-600 text-zinc-500 group-hover:text-white font-semibold text-[10px] tracking-widest rounded-full transition-all duration-300 z-10">
                    {status === 'connecting' && ip === dev.ip && port === String(dev.port) ? 'LINKING...' : 'CONNECT'}
                  </div>
                </div>
              </button>
            ))}

            {/* Add New Device */}
            <button
              onClick={() => setUiMode('manual')}
              className="w-52 h-[420px] bg-transparent border-[3px] border-dashed border-zinc-800 hover:border-violet-500/40 rounded-[2.8rem] flex flex-col items-center justify-center group transition-all duration-300 hover:bg-violet-600/[0.03]"
            >
              <div className="w-14 h-14 rounded-2xl bg-[#0d0d14] group-hover:bg-violet-600 flex items-center justify-center text-zinc-600 group-hover:text-white transition-all duration-300 border border-zinc-800 group-hover:border-violet-500/50 mb-4">
                <RiAddLine size={26} />
              </div>
              <span className="text-[11px] font-semibold text-zinc-600 group-hover:text-violet-400 tracking-wide transition-colors">
                New Device
              </span>
            </button>
          </div>

          {errorMsg && (
            <div className="mt-10 p-4 bg-red-500/8 border border-red-500/20 text-red-400 font-mono text-[11px] rounded-xl">
              {errorMsg}
            </div>
          )}
        </div>
      </div>
    )
  }

  /* â”€â”€ MANUAL CONNECT VIEW â”€â”€ */
  if (status !== 'connected' && uiMode === 'manual') {
    return (
      <div className="flex-1 h-full min-h-0 flex flex-col lg:flex-row items-center justify-center gap-8 p-8 bg-[#040407] text-zinc-100 overflow-y-auto scrollbar-small animate-in fade-in duration-300">
        <div className="w-full lg:w-80 flex flex-col gap-4">
          {/* Card Header */}
          <div className="p-5 bg-[#0d0d14] border border-white/[0.06] rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-violet-600/10 border border-violet-500/20 flex items-center justify-center">
                <FaAndroid className="text-violet-400" size={18} />
              </div>
              <div>
                <h2 className="text-[13px] font-semibold text-white">Connect Device</h2>
                <p className="text-[9px] text-violet-400/60 font-mono tracking-wider">WIRELESS ADB</p>
              </div>
            </div>
            {deviceHistory.length > 0 && (
              <button
                onClick={() => setUiMode('history')}
                className="text-[10px] font-semibold tracking-widest text-violet-400 hover:text-violet-300 bg-violet-500/8 hover:bg-violet-500/15 px-3 py-1.5 border border-violet-500/20 rounded-lg transition-all"
              >
                ARCHIVE
              </button>
            )}
          </div>

          {/* Form */}
          <div className="p-6 bg-[#0d0d14] border border-white/[0.06] rounded-2xl flex flex-col gap-5">
            {errorMsg && (
              <div className="p-3 bg-red-500/8 border border-red-500/20 text-red-400 text-[11px] rounded-xl font-mono">
                {errorMsg}
              </div>
            )}
            <div>
              <label className="text-[10px] font-semibold text-zinc-500 tracking-widest mb-2 block uppercase font-mono">
                IP Address
              </label>
              <div className="flex items-center bg-[#040407] border border-white/[0.07] rounded-xl px-4 py-3 focus-within:border-violet-500/40 focus-within:shadow-[0_0_0_3px_rgba(124,58,237,0.08)] transition-all">
                <RiWifiLine className="text-violet-500 mr-3" size={16} />
                <input
                  type="text"
                  value={ip}
                  onChange={(e) => setIp(e.target.value)}
                  placeholder="192.168.1.xxx"
                  className="bg-transparent border-none outline-none text-[13px] text-zinc-200 w-full font-mono placeholder:text-zinc-700"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-zinc-500 tracking-widest mb-2 block uppercase font-mono">
                Port
              </label>
              <div className="flex items-center bg-[#040407] border border-white/[0.07] rounded-xl px-4 py-3 focus-within:border-violet-500/40 focus-within:shadow-[0_0_0_3px_rgba(124,58,237,0.08)] transition-all">
                <RiLinkM className="text-violet-500 mr-3" size={16} />
                <input
                  type="text"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  placeholder="5555"
                  className="bg-transparent border-none outline-none text-[13px] text-zinc-200 w-full font-mono placeholder:text-zinc-700"
                />
              </div>
            </div>
            <button
              onClick={handleManualConnect}
              disabled={status === 'connecting'}
              className="w-full py-3 bg-violet-600/15 border border-violet-500/25 hover:bg-violet-600/25 hover:border-violet-500/40 text-violet-300 font-semibold rounded-xl tracking-wide transition-all duration-200 disabled:opacity-40 disabled:pointer-events-none"
            >
              {status === 'connecting' ? 'Connecting...' : 'Connect Securely'}
            </button>
          </div>
        </div>

        {/* Phone Mockup */}
        <div className="w-full lg:w-auto flex justify-center py-4">
          <div className="w-64 h-[500px] bg-[#09090e] rounded-[3rem] border-8 border-[#1a1a22] shadow-2xl relative overflow-hidden flex flex-col">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-6 bg-[#1a1a22] rounded-b-2xl z-20" />
            <div className="flex-1 bg-gradient-to-b from-violet-950/20 to-black p-6 flex flex-col items-center justify-center">
              <RiSmartphoneLine size={52} className="text-violet-900/60 animate-pulse" />
              <p className="text-[9px] font-mono text-violet-900/60 mt-4 tracking-widest">AWAITING TARGET</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  /* â”€â”€ CONNECTED VIEW â”€â”€ */
  return (
    <div className="flex-1 h-full min-h-0 flex flex-col lg:flex-row items-center justify-center gap-10 p-8 bg-[#040407] bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.12),transparent)] animate-in fade-in duration-700 overflow-y-auto scrollbar-small">
      
      {/* Telemetry Column */}
      <div className="w-full lg:w-72 flex flex-col gap-6 shrink-0 self-stretch justify-center pt-8 lg:pt-0">
        
        {/* Device Header */}
        <div className="relative overflow-hidden rounded-[2rem] border border-white/[0.08] bg-gradient-to-br from-[#151528] via-[#111425] to-[#090c16] p-5 shadow-[0_16px_40px_rgba(0,0,0,0.45)]">
          <div className="absolute -top-10 -left-10 h-36 w-36 rounded-full bg-violet-500/20 blur-[55px] pointer-events-none" />
          <div className="absolute -top-8 -right-10 h-32 w-32 rounded-full bg-cyan-500/15 blur-[50px] pointer-events-none" />
          <div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent -translate-x-full pointer-events-none"
            style={{ animation: 'shimmer 4.2s linear infinite' }}
          />

          <div className="relative z-10 flex items-start justify-between gap-3">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="grid h-14 w-14 place-items-center rounded-2xl border border-violet-400/35 bg-gradient-to-br from-violet-500/25 to-violet-900/15 shadow-[0_0_24px_rgba(139,92,246,0.28)] shrink-0">
                <RiSmartphoneLine className="text-violet-200" size={25} />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-[17px] font-black tracking-wide text-white">{liveModel}</h2>
                <p className="mt-1 text-[10px] font-mono uppercase tracking-[0.24em] text-zinc-400">{telemetry.os}</p>
                <p className="mt-1 text-[9px] font-mono uppercase tracking-[0.2em] text-cyan-300/70">
                  Sync {telemetryAgeLabel}
                </p>
              </div>
            </div>

            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/35 bg-emerald-400/10 px-2.5 py-1 text-[9px] font-mono tracking-[0.2em] text-emerald-300 shrink-0">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-80" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-300" />
              </span>
              LIVE
              <span className="ml-1 flex items-end gap-[2px]">
                {[0, 1, 2].map((bar) => (
                  <span
                    key={bar}
                    className="w-[2px] rounded-full bg-emerald-300/80 animate-pulse"
                    style={{ height: `${5 + bar * 2}px`, animationDelay: `${bar * 0.18}s` }}
                  />
                ))}
              </span>
            </span>
          </div>

          <div className="relative z-10 mt-4 h-px bg-gradient-to-r from-transparent via-white/12 to-transparent" />

          <div className="relative z-10 mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-2.5">
              <span className="block text-[8px] font-mono tracking-[0.24em] text-zinc-500">STATUS</span>
              <span className="mt-1 block text-[12px] font-black tracking-[0.14em] text-emerald-300">LIVE UPLINK</span>
              <span className="mt-1 block text-[9px] font-mono tracking-[0.12em] text-emerald-200/75">
                {ip}:{port}
              </span>
            </div>
            <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2.5 text-right">
              <span className="block text-[8px] font-mono tracking-[0.24em] text-zinc-500">THERMAL</span>
              <span className="mt-1 block text-[12px] font-black tracking-[0.08em] text-amber-300">{thermalText}</span>
            </div>
          </div>
        </div>

        {/* Metric Cards */}
        {[
          {
            label: 'NETWORK',
            icon: <RiSignalWifi3Line className="text-violet-300 group-hover:text-violet-200 transition-colors" size={22} />,
            value: 'ACTIVE',
            sub: `${ip}:${port}`,
            bar: null,
            glow: 'bg-violet-500/10 group-hover:bg-violet-500/25',
            iconBg: 'bg-violet-500/10 border-violet-500/20'
          },
          {
            label: 'BATTERY',
            icon: <RiBattery2ChargeLine className="text-emerald-300 group-hover:text-emerald-200 transition-colors" size={22} />,
            value: `${telemetry.battery.level}%`,
            sub: telemetry.battery.isCharging ? 'CHARGING' : 'DISCHARGING',
            bar: { pct: telemetry.battery.level, color: 'bg-emerald-400', shadow: 'shadow-[0_0_12px_rgba(52,211,153,0.8)]' },
            glow: 'bg-emerald-500/10 group-hover:bg-emerald-500/25',
            iconBg: 'bg-emerald-500/10 border-emerald-500/20'
          },
          {
            label: 'STORAGE',
            icon: <RiDatabase2Line className="text-amber-300 group-hover:text-amber-200 transition-colors" size={22} />,
            value: telemetry.storage.used,
            sub: telemetry.storage.total,
            bar: { pct: telemetry.storage.percent, color: 'bg-amber-400', shadow: 'shadow-[0_0_12px_rgba(251,191,36,0.8)]' },
            glow: 'bg-amber-500/10 group-hover:bg-amber-500/25',
            iconBg: 'bg-amber-500/10 border-amber-500/20'
          }
        ].map((card) => (
          <div
            key={card.label}
            className="group relative bg-gradient-to-br from-white/[0.03] to-transparent backdrop-blur-md border border-white/[0.06] rounded-[2rem] p-6 hover:border-white/[0.12] transition-all duration-300 overflow-hidden hover:shadow-2xl hover:-translate-y-0.5"
          >
            <div className={`absolute -top-12 -right-12 w-32 h-32 blur-[30px] rounded-full transition-colors duration-500 ${card.glow}`} />
            
            <div className="flex justify-between items-center mb-4 relative z-10">
              <span className="text-[10.5px] font-bold text-zinc-500 tracking-[0.25em]">{card.label}</span>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-all duration-300 group-hover:scale-110 ${card.iconBg}`}>
                {card.icon}
              </div>
            </div>
            <h4 className="text-[30px] font-black text-white tracking-tight mb-1 relative z-10">{card.value}</h4>
            <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest relative z-10">{card.sub}</span>
            {card.bar && (
              <div className="w-full bg-[#0a0a0f] rounded-full h-2 overflow-hidden mt-5 relative z-10 border border-white/[0.04] p-[1px]">
                <div
                  className={`${card.bar.color} ${card.bar.shadow} h-full rounded-full transition-all duration-700 ease-out`}
                  style={{ width: `${card.bar.pct}%` }}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Center Phone Mockup */}
      <div className="flex justify-center items-center shrink-0 relative mt-4 lg:mt-0">
        <div className="w-[320px] h-[640px] bg-black rounded-[3.5rem] border-[14px] border-[#0c0c12] shadow-[0_0_120px_rgba(139,92,246,0.1),_inset_0_0_0_1px_rgba(255,255,255,0.08)] ring-1 ring-white/10 relative overflow-hidden flex flex-col group z-10">
          
          {/* Dynamic Island / Notch Mockup */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-7 bg-[#0c0c12] rounded-b-[1.2rem] z-30 flex items-center justify-center gap-3 border-b border-x border-white/[0.05] shadow-lg">
             <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/80 shadow-[0_0_5px_rgba(16,185,129,0.8)]" />
             <div className="w-12 h-1.5 rounded-full bg-zinc-800" />
             <div className="w-2.5 h-2.5 rounded-full bg-[#111] border border-white/10 relative overflow-hidden flex items-center justify-center">
               <div className="w-1 h-1 rounded-full bg-blue-500/40" />
             </div>
          </div>
          
          <img
            ref={screenRef}
            alt="Device Screen Screen"
            className="w-full h-full object-cover cursor-zoom-in brightness-95 group-hover:brightness-100 transition-all duration-500"
            onClick={() => setScreenExpanded(true)}
          />
          
          {/* Glass reflection overlay */}
          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.03] to-transparent pointer-events-none" />

          {/* Expand Tooltip */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-bold text-white tracking-widest bg-black/70 shadow-2xl backdrop-blur-md border border-white/[0.15] rounded-full px-5 py-2.5 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0 uppercase pointer-events-none z-30">
            Expand View
          </div>
        </div>

        {/* Hardware Side Buttons */}
        <div className="absolute right-0 lg:-right-1.5 top-40 w-1.5 h-14 bg-zinc-800 border-y border-l border-white/10 rounded-l-md pointer-events-none z-0" />
        <div className="absolute right-0 lg:-right-1.5 top-60 w-1.5 h-14 bg-zinc-800 border-y border-l border-white/10 rounded-l-md pointer-events-none z-0" />
        <div className="absolute left-0 lg:-left-1.5 top-48 w-1.5 h-24 bg-zinc-800 border-y border-r border-white/10 rounded-r-md pointer-events-none z-0" />
      </div>

      {/* Controls Column */}
      <div className="w-full lg:w-72 flex flex-col gap-5 shrink-0 self-stretch justify-center pb-8 lg:pb-0">
        <div className="bg-gradient-to-br from-white/[0.05] to-white/[0.01] border border-white/[0.08] rounded-[2rem] p-6 flex flex-col gap-6 h-full backdrop-blur-xl relative overflow-hidden shadow-2xl">
          
          {/* Control Header */}
          <div className="flex items-center gap-4 border-b border-white/[0.08] pb-5 relative z-10">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500/20 to-indigo-500/10 border border-violet-500/30 flex items-center justify-center shadow-[0_0_15px_rgba(139,92,246,0.15)]">
              <RiTerminalBoxLine className="text-violet-300" size={24} />
            </div>
            <div className="flex-1">
              <h3 className="text-[14px] font-bold text-white tracking-wide">Controls</h3>
              <div className="flex items-center gap-1.5 mt-0.5">
                 <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mb-0.5 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
                 <span className="text-[9px] text-emerald-400 font-mono tracking-widest uppercase">Uplink Secured</span>
              </div>
            </div>
            
            <div className="flex flex-col gap-2">
              <button
                onClick={handleManualRefresh}
                className="w-8 h-8 rounded-xl border border-white/[0.1] bg-white/[0.04] text-zinc-400 hover:text-white hover:bg-white/[0.1] hover:border-white/[0.2] transition-all flex items-center justify-center shadow-lg"
                title="Refresh telemetry"
              >
                <RiRefreshLine size={15} />
              </button>
              <button
                onClick={toggleScreenStream}
                className={`w-8 h-8 rounded-xl border transition-all flex items-center justify-center shadow-lg ${
                  isScreenPaused 
                    ? 'border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25' 
                    : 'border-white/[0.1] bg-white/[0.04] text-zinc-400 hover:text-white hover:bg-white/[0.1] hover:border-white/[0.2]'
                }`}
                title={isScreenPaused ? 'Resume screen stream' : 'Pause screen stream'}
              >
                {isScreenPaused ? <RiPlayCircleLine size={15} /> : <RiPauseCircleLine size={15} />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 relative z-10">
            {[
              { action: 'camera' as const, icon: <RiCameraLensLine size={26} />, label: 'CAMERA' },
              { action: 'lock' as const, icon: <RiLockPasswordLine size={26} />, label: 'LOCK' },
              { action: 'wake' as const, icon: <RiSunLine size={26} />, label: 'WAKE' },
              { action: 'home' as const, icon: <RiHome5Line size={26} />, label: 'HOME' }
            ].map(({ action, icon, label }) => (
              <button
                key={action}
                onClick={() => executeQuickCommand(action)}
                className={`group flex flex-col items-center justify-center gap-3.5 py-6 bg-gradient-to-b from-white/[0.04] to-white/[0.01] border rounded-[1.5rem] transition-all duration-300 shadow-lg ${
                  activeQuickAction === action
                    ? 'border-violet-400/80 bg-violet-500/25 scale-[0.96] shadow-[0_0_20px_rgba(139,92,246,0.4)]'
                    : 'border-white/[0.08] hover:border-violet-500/50 hover:bg-violet-500/[0.1] hover:-translate-y-1 hover:shadow-[0_8px_20px_rgba(0,0,0,0.4)]'
                }`}
              >
                <div className="text-zinc-500 group-hover:text-violet-300 transition-colors duration-300">
                   {icon}
                </div>
                <span className="text-[10px] font-bold text-zinc-400 group-hover:text-violet-200 tracking-widest transition-colors duration-300">{label}</span>
              </button>
            ))}
          </div>

          <div className="p-4 bg-gradient-to-r from-violet-500/10 via-fuchsia-500/10 to-violet-500/10 border border-violet-500/20 rounded-2xl relative z-10 mt-auto shadow-inner">
            <p className="text-[9.5px] text-violet-300/80 font-mono leading-relaxed text-center tracking-[0.1em]">
              ELI NEURAL VOICE INTERFACE<br/>
              <span className="text-violet-200 font-bold mt-1 inline-block">COMMAND EXECUTION READY</span>
            </p>
          </div>

          <button
            onClick={handleDisconnect}
            className="w-full py-4 mt-2 bg-gradient-to-b from-red-500/10 to-red-500/5 hover:from-red-500/20 hover:to-red-500/10 text-red-500 hover:text-red-400 font-bold rounded-2xl tracking-widest uppercase transition-all duration-300 border border-red-500/20 hover:border-red-500/50 flex items-center justify-center gap-3 shadow-lg hover:shadow-[0_0_20px_rgba(239,68,68,0.2)] text-[12px] relative z-10"
          >
            <RiShutDownLine size={18} /> DISCONNECT SESSION
          </button>

          <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-violet-600/10 blur-[60px] rounded-full pointer-events-none" />
        </div>
      </div>

      {/* Top Level UI Overlay Messages */}
      {uiMessage && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full border border-violet-500/40 bg-[#0d0d14]/95 backdrop-blur-sm text-violet-200 text-[11px] font-mono tracking-widest z-[130] shadow-[0_10px_40px_rgba(139,92,246,0.2)] font-bold animate-in slide-in-from-bottom-5 duration-300">
          {uiMessage}
        </div>
      )}

      {/* Expanded Screen Overlay */}
      {screenExpanded && (
        <div
          className="fixed inset-0 z-[140] bg-black/90 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in duration-300"
          onClick={() => setScreenExpanded(false)}
        >
          <div
            className="w-full max-w-[480px] aspect-[9/19.5] rounded-[3rem] border-2 border-white/[0.1] shadow-[0_0_100px_rgba(139,92,246,0.15)] overflow-hidden bg-black relative scale-in-100"
            onClick={(e) => e.stopPropagation()}
          >
            <img src={screenRef.current?.src || ''} alt="Expanded Phone Screen" className="w-full h-full object-contain bg-black" />
            <button
              onClick={() => setScreenExpanded(false)}
              className="absolute top-6 right-6 w-10 h-10 rounded-full bg-black/60 backdrop-blur-md border border-white/[0.15] text-zinc-300 hover:text-white hover:bg-black/80 hover:scale-110 transition-all flex items-center justify-center shadow-2xl"
            >
              <RiCloseLine size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default memo(PhoneView)
