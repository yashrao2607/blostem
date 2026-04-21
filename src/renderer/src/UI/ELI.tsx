import { memo, useEffect, useRef, useState, Suspense, lazy } from 'react'
import { unstable_batchedUpdates } from 'react-dom'
import {
  RiAppsLine,
  RiBatteryChargeLine,
  RiBrainLine,
  RiCameraLine,
  RiCloseLine,
  RiComputerLine,
  RiFolderOpenLine,
  RiImageLine,
  RiLayoutGridLine,
  RiPhoneLine,
  RiSettings4Line,
  RiShieldFlashLine,
  RiWifiLine
} from 'react-icons/ri'
import { getDrives, DriveInfo, getSystemStatus, SystemStats } from '@renderer/services/system-info'
import { getHistory } from '@renderer/services/ELI-AI-brain'
import ViewSkeleton from '@renderer/components/ViewSkeleton'

import DashboardView from '../views/Dashboard'
import PhoneView from '../views/Phone'
import { VisionMode } from '@renderer/IndexRoot'

const WorkFlowEditorView = lazy(() => import('../views/WorkFlowEditor'))
const NotesView = lazy(() => import('../views/Notes'))
const SettingsView = lazy(() => import('../views/Settings'))
const GalleryView = lazy(() => import('../views/Gallery'))
const AppsView = lazy(() => import('../views/APP'))

interface EliProps {
  isSystemActive: boolean
  toggleSystem: () => void
  isMicMuted: boolean
  toggleMic: () => void
  isVideoOn: boolean
  visionMode: VisionMode
  startVision: (mode: 'camera' | 'screen') => void
  stopVision: () => void
  activeStream: MediaStream | null
  isReentering?: boolean
}

const TABS = [
  { id: 'DASHBOARD', label: 'Dashboard', icon: <RiLayoutGridLine size={14} /> },
  { id: 'Macros', label: 'Macros', icon: <RiBrainLine size={14} /> },
  { id: 'NOTES', label: 'Notes', icon: <RiFolderOpenLine size={14} /> },
  { id: 'APPS', label: 'Apps', icon: <RiAppsLine size={14} /> },
  { id: 'GALLERY', label: 'Gallery', icon: <RiImageLine size={14} /> },
  { id: 'PHONE', label: 'Phone', icon: <RiPhoneLine size={14} /> },
  { id: 'SETTINGS', label: 'Settings', icon: <RiSettings4Line size={14} /> }
]

const glassPanel = 'bg-zinc-950/50 backdrop-blur-xl border border-white/[0.06] rounded-2xl shadow-xl'

const ClockDisplay = memo(() => {
  const [time, setTime] = useState<Date>(new Date())

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <span className="text-[10px] font-mono text-zinc-400 tabular-nums">
      {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </span>
  )
})

const ELI = (props: EliProps) => {
  const [activeTab, setActiveTab] = useState('DASHBOARD')
  const [stats, setStats] = useState<SystemStats | null>(null)
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null)
  const [networkRttMs, setNetworkRttMs] = useState<number | null>(null)
  const [networkDownlinkMbps, setNetworkDownlinkMbps] = useState<number | null>(null)
  const [networkType, setNetworkType] = useState<string>('unknown')
  const [drives, setDrives] = useState<DriveInfo[]>([])
  const [metricHistory, setMetricHistory] = useState<{ cpu: number[]; ram: number[]; gpu: number[] }>({ cpu: [], ram: [], gpu: [] })
  const [chatHistory, setChatHistory] = useState<any[]>([])
  const [showSourceModal, setShowSourceModal] = useState(false)
  const lastHistorySigRef = useRef('')

  const isDashboardActive = activeTab === 'DASHBOARD'
  const appendPoint = (series: number[], value: number) => [...series.slice(-44), value]
  const hasMeaningfulDelta = (a: number, b: number, threshold = 0.1) => Math.abs(a - b) >= threshold

  const applyStats = (nextStats: SystemStats | null) => {
    unstable_batchedUpdates(() => {
      setStats((prev) => {
        if (!nextStats) return nextStats
        if (!prev) return nextStats

        const sameCpu = prev.cpu === nextStats.cpu
        const sameGpu = prev.gpu === nextStats.gpu
        const sameMem = prev.memory.usedPercentage === nextStats.memory.usedPercentage
        const sameTemp = prev.temperature === nextStats.temperature
        const sameUptime = prev.os.uptime === nextStats.os.uptime

        if (sameCpu && sameGpu && sameMem && sameTemp && sameUptime) return prev
        return nextStats
      })

      if (nextStats) {
        const cpu = Number(nextStats.cpu)
        const ram = Number(nextStats.memory.usedPercentage)
        const gpu = Number(nextStats.gpu || 0)

        setMetricHistory((prev) => {
          const prevCpu = prev.cpu[prev.cpu.length - 1]
          const prevRam = prev.ram[prev.ram.length - 1]
          const prevGpu = prev.gpu[prev.gpu.length - 1]

          const cpuChanged =
            Number.isFinite(cpu) && (!Number.isFinite(prevCpu) || hasMeaningfulDelta(cpu, prevCpu))
          const ramChanged =
            Number.isFinite(ram) && (!Number.isFinite(prevRam) || hasMeaningfulDelta(ram, prevRam))
          const gpuChanged =
            Number.isFinite(gpu) && (!Number.isFinite(prevGpu) || hasMeaningfulDelta(gpu, prevGpu))

          if (!cpuChanged && !ramChanged && !gpuChanged) return prev

          return {
            cpu: Number.isFinite(cpu) ? appendPoint(prev.cpu, cpu) : prev.cpu,
            ram: Number.isFinite(ram) ? appendPoint(prev.ram, ram) : prev.ram,
            gpu: Number.isFinite(gpu) ? appendPoint(prev.gpu, gpu) : prev.gpu
          }
        })
      }
    })
  }

  useEffect(() => {
    if (!isDashboardActive) return

    const onStatsPush = (_event: unknown, pushed: SystemStats) => {
      applyStats(pushed)
    }

    const bootstrapStats = async () => {
      const nextStats = await getSystemStatus()
      applyStats(nextStats)
    }

    const pollDrives = async () => {
      const next = await getDrives()
      setDrives(Array.isArray(next) ? next : [])
    }

    const drivesTimer = setInterval(pollDrives, 15000)

    bootstrapStats()
    pollDrives()
    window.electron.ipcRenderer.on('stats-push', onStatsPush)

    return () => {
      clearInterval(drivesTimer)
      window.electron.ipcRenderer.removeListener('stats-push', onStatsPush)
    }
  }, [isDashboardActive])

  useEffect(() => {
    let cleanup: (() => void) | undefined
    ;(navigator as any)
      .getBattery?.()
      .then((battery: any) => {
        const syncBattery = () => setBatteryLevel(Math.round((battery.level || 0) * 100))
        syncBattery()
        battery.addEventListener?.('levelchange', syncBattery)
        cleanup = () => battery.removeEventListener?.('levelchange', syncBattery)
      })
      .catch(() => setBatteryLevel(null))

    return () => {
      if (cleanup) cleanup()
    }
  }, [])

  useEffect(() => {
    const conn = (navigator as any).connection
    if (!conn) return

    const syncNetwork = () => {
      const rtt = Number(conn.rtt)
      setNetworkRttMs(Number.isFinite(rtt) && rtt > 0 ? rtt : null)
      const downlink = Number(conn.downlink)
      setNetworkDownlinkMbps(Number.isFinite(downlink) && downlink > 0 ? downlink : null)
      setNetworkType(conn.effectiveType || 'unknown')
    }

    syncNetwork()
    conn.addEventListener?.('change', syncNetwork)
    return () => conn.removeEventListener?.('change', syncNetwork)
  }, [])

  useEffect(() => {
    if (!isDashboardActive) return

    const fetchHistory = async () => {
      const history = await getHistory()
      if (!Array.isArray(history)) return
      const trimmed = history.slice(-15)
      const last = trimmed[trimmed.length - 1]
      const lastText = last?.content || last?.parts?.[0]?.text || ''
      const lastStamp = last?.timestamp || ''
      const signature = `${trimmed.length}|${last?.role || ''}|${lastStamp}|${lastText}`
      if (signature !== lastHistorySigRef.current) {
        unstable_batchedUpdates(() => {
          lastHistorySigRef.current = signature
          setChatHistory(trimmed)
        })
      }
    }

    fetchHistory()
    const onHistoryUpdated = () => {
      fetchHistory()
    }

    window.electron.ipcRenderer.on('history-updated', onHistoryUpdated)
    return () => {
      window.electron.ipcRenderer.removeListener('history-updated', onHistoryUpdated)
    }
  }, [isDashboardActive])

  const handleVisionClick = () => {
    if (props.isVideoOn) {
      props.stopVision()
    } else {
      setShowSourceModal(true)
    }
  }

  const isTyping =
    props.isSystemActive && chatHistory.length > 0 && chatHistory[chatHistory.length - 1]?.role === 'user'

  return (
    <div
      className={`h-screen w-full bg-[#040407] text-zinc-100 font-sans overflow-hidden select-none flex flex-col relative ${props.isReentering ? 'reentry-content-fx' : ''}`}
    >
      <div className="h-[52px] w-full flex items-center justify-between px-4 bg-[#07070d]/90 border-b border-white/[0.05] z-50 backdrop-blur-xl shrink-0 relative overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-violet-500/40 to-transparent" />
        <div className="hidden lg:flex items-center gap-2.5">
          <div className="relative flex items-center justify-center w-7 h-7">
            <div className="absolute w-full h-full rounded-lg bg-violet-600/10 border border-violet-500/20" />
            <RiShieldFlashLine className="text-violet-400 relative z-10" size={16} />
          </div>
          <div className="flex flex-col leading-none">
            <span className="font-bold tracking-[0.15em] text-[13px] text-white">ELI AI</span>
            <span className="text-[9px] font-medium text-violet-400/50 tracking-[0.2em] uppercase">Neural Interface</span>
          </div>
        </div>

        <div className="hidden md:flex gap-0.5 bg-white/[0.03] p-1 rounded-xl border border-white/[0.05] shadow-[0_4px_20px_rgba(0,0,0,0.35)]">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative cursor-pointer px-4 py-1.5 text-[11px] font-semibold tracking-wide rounded-lg transition-all duration-200 flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-violet-600/15 text-violet-300 border border-violet-500/20 shadow-[0_0_12px_rgba(124,58,237,0.1)]'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]'
                }`}
              >
                <span className={`transition-colors ${isActive ? 'text-violet-400' : 'text-zinc-600'}`}>{tab.icon}</span>
                {tab.label}
                {isActive && (
                  <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full bg-violet-500/60" />
                )}
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-violet-400/60">
            <RiWifiLine size={12} />
            <span className="hidden sm:block tracking-wide">{props.isSystemActive ? 'LINKED' : 'IDLE'}</span>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 text-[10px] font-mono text-zinc-600">
            <RiBatteryChargeLine size={12} />
            <span>{batteryLevel === null ? '--' : `${batteryLevel}%`}</span>
          </div>
          <div className="bg-white/[0.04] border border-white/[0.06] px-2.5 py-1 rounded-md">
            <ClockDisplay />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative bg-[radial-gradient(ellipse_at_top,rgba(124,58,237,0.04)_0%,transparent_60%)]">
        <div className="aurora-layer pointer-events-none absolute inset-0" />
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.04]"
          style={{
            backgroundImage: 'radial-gradient(circle, #a78bfa 1px, transparent 1px)',
            backgroundSize: '28px 28px'
          }}
        />

        {activeTab === 'DASHBOARD' && (
          <div className="absolute inset-0">
          <DashboardView
            props={props}
            stats={stats}
            networkRttMs={networkRttMs}
            networkDownlinkMbps={networkDownlinkMbps}
            networkType={networkType}
            drives={drives}
            cpuHistory={metricHistory.cpu}
            ramHistory={metricHistory.ram}
            gpuHistory={metricHistory.gpu}
            chatHistory={chatHistory}
            isTyping={isTyping}
            onVisionClick={handleVisionClick}
          />
          </div>
        )}

        <div className={`absolute inset-0 overflow-y-auto scrollbar-small ${activeTab === 'PHONE' ? 'block' : 'hidden'}`}>
          <div className="h-full">
            <PhoneView glassPanel={glassPanel} />
          </div>
        </div>

        <Suspense fallback={<ViewSkeleton />}>
          {activeTab === 'Macros' && (
            <div className="h-full overflow-y-auto scrollbar-small">
              <WorkFlowEditorView />
            </div>
          )}
          {activeTab === 'NOTES' && (
            <div className="h-full overflow-y-auto scrollbar-small">
              <NotesView glassPanel={glassPanel} />
            </div>
          )}
          {activeTab === 'APPS' && <AppsView />}
          {activeTab === 'SETTINGS' && (
            <div className="h-full overflow-y-auto scrollbar-small">
              <SettingsView isSystemActive={props.isSystemActive} />
            </div>
          )}
          {activeTab === 'GALLERY' && (
            <div className="h-full overflow-y-auto scrollbar-small">
              <GalleryView />
            </div>
          )}
        </Suspense>
      </div>

      {showSourceModal && (
        <div
          className="absolute inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md animate-float-up"
          onClick={() => setShowSourceModal(false)}
        >
          <div
            className={`${glassPanel} w-[380px] border-violet-500/15 flex flex-col overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.6)] rounded-2xl`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.05] bg-white/[0.02]">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-violet-500 shadow-[0_0_6px_rgba(139,92,246,0.7)]" />
                <span className="text-[11px] font-semibold tracking-widest text-violet-300 uppercase">Select Vision Source</span>
              </div>
              <button
                onClick={() => setShowSourceModal(false)}
                className="cursor-pointer w-6 h-6 flex items-center justify-center rounded-md text-zinc-500 hover:text-white hover:bg-white/[0.08] transition-all"
              >
                <RiCloseLine size={16} />
              </button>
            </div>

            <div className="p-4 grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  props.startVision('camera')
                  setShowSourceModal(false)
                }}
                className="cursor-pointer group flex flex-col items-center justify-center gap-3 p-6 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-violet-500/30 hover:bg-violet-500/[0.06] transition-all duration-200"
              >
                <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-zinc-900 border border-white/[0.06] group-hover:bg-violet-600 group-hover:border-violet-500/50 group-hover:shadow-[0_0_20px_rgba(124,58,237,0.3)] text-zinc-400 group-hover:text-white transition-all duration-200">
                  <RiCameraLine size={22} />
                </div>
                <span className="text-[11px] font-semibold text-zinc-400 group-hover:text-violet-300 tracking-wide transition-colors">
                  Camera Feed
                </span>
              </button>

              <button
                onClick={() => {
                  props.startVision('screen')
                  setShowSourceModal(false)
                }}
                className="cursor-pointer group flex flex-col items-center justify-center gap-3 p-6 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-violet-500/30 hover:bg-violet-500/[0.06] transition-all duration-200"
              >
                <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-zinc-900 border border-white/[0.06] group-hover:bg-violet-600 group-hover:border-violet-500/50 group-hover:shadow-[0_0_20px_rgba(124,58,237,0.3)] text-zinc-400 group-hover:text-white transition-all duration-200">
                  <RiComputerLine size={22} />
                </div>
                <span className="text-[11px] font-semibold text-zinc-400 group-hover:text-violet-300 tracking-wide transition-colors">
                  Screen Share
                </span>
              </button>
            </div>

            <div className="px-4 pb-4">
              <p className="text-center text-[10px] text-zinc-600 font-mono tracking-wider">
                Select input source for neural visual processing
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ELI



