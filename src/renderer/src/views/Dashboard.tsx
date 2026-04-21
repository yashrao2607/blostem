import { Component, ErrorInfo, ReactNode, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Sphere from '@renderer/components/Sphere'
import {
  RiCameraLine,
  RiCpuLine,
  RiHistoryLine,
  RiLayoutGridLine,
  RiMicLine,
  RiMicOffLine,
  RiPhoneFill,
  RiPulseLine,
  RiSwapBoxLine,
  RiTerminalBoxLine,
  RiWifiLine,
  RiHardDrive2Line
} from 'react-icons/ri'
import { FaMemory } from 'react-icons/fa6'
import { GiTinker } from 'react-icons/gi'
import { HiComputerDesktop } from 'react-icons/hi2'
import * as faceapi from 'face-api.js'
import { VisionMode } from '@renderer/IndexRoot'
import { DriveInfo, SystemStats } from '@renderer/services/system-info'
import { ensureFaceModelsLoaded } from '@renderer/services/face-models'

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
}

type TranscriptMessage = {
  role: string
  content?: string
  parts?: Array<{ text?: string }>
  timestamp?: string
}

interface DashboardViewProps {
  props: EliProps
  stats: SystemStats | null
  networkRttMs: number | null
  networkDownlinkMbps: number | null
  networkType: string
  drives: DriveInfo[]
  cpuHistory: number[]
  ramHistory: number[]
  gpuHistory: number[]
  chatHistory: TranscriptMessage[]
  isTyping: boolean
  onVisionClick: () => void
}

type MetricCard = {
  icon: ReactNode
  label: string
  val: string
  color: string
  percent: number | null
}

const glassPanel =
  'bg-white/[0.02] backdrop-blur-3xl border border-white/[0.08] rounded-2xl shadow-xl transition-all duration-500'

const getMessageText = (msg: TranscriptMessage): string => {
  if (typeof msg.content === 'string' && msg.content.trim()) return msg.content
  if (Array.isArray(msg.parts) && msg.parts[0]?.text) return msg.parts[0].text
  return ''
}

const AudioWaveform = ({ isActive }: { isActive: boolean }) => {
  const baseHeights = [5, 9, 12, 8, 6]
  return (
    <div className="ml-1 hidden sm:flex items-center gap-[2px] h-4">
      {baseHeights.map((h, i) => (
        <div
          key={i}
          className={`w-[2px] rounded-full bg-violet-400 ${isActive ? 'animate-pulse' : 'opacity-40'}`}
          style={{ height: `${h}px`, animationDelay: `${i * 80}ms` }}
        />
      ))}
    </div>
  )
}

const Sparkline = ({ data, colorClass, label }: { data: number[]; colorClass: string; label: string }) => {
  const points =
    data.length > 1
      ? data
          .map((value, idx) => {
            const x = (idx / (data.length - 1)) * 100
            const y = 40 - (Math.max(0, Math.min(100, value)) / 100) * 35 // Map 0-100 to 5-40 vertical range
            return `${x},${y}`
          })
          .join(' ')
      : ''

  const gradientId = useMemo(
    () => `grad-${label.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`,
    [label]
  )

  return (
    <div className="rounded-2xl border border-white/[0.04] bg-[#0c0c14]/40 px-1.5 py-4 group/spark transition-all duration-500 hover:bg-white/[0.03] relative overflow-hidden group-hover:shadow-[0_0_20px_rgba(139,92,246,0.05)]">
      <div className="absolute top-0 right-0 w-24 h-24 bg-current opacity-[0.02] blur-3xl rounded-full translate-x-1/2 -translate-y-1/2 transition-opacity duration-700" />
      
      {/* Technical corner accents */}
      <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-white/10" />
      <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-white/10" />

      <div className="mb-3 flex items-center justify-between relative z-10">
        <span className="text-[10px] font-black tracking-[0.3em] text-zinc-500 uppercase">{label}</span>
        <div className="flex flex-col items-end">
          <span className={`text-[13px] font-black tabular-nums ${colorClass}`}>
            {data.length ? `${data[data.length - 1].toFixed(1)}%` : '--'}
          </span>
          <div className={`h-0.5 w-6 rounded-full opacity-30 mt-0.5 ${colorClass.replace('text-', 'bg-')}`} />
        </div>
      </div>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-10 w-full filter drop-shadow-[0_0_8px_rgba(124,58,237,0.2)]">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.4" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        {points && <polygon points={`0,40 ${points} 100,40`} fill={`url(#${gradientId})`} className={colorClass} />}
        <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={colorClass} />
      </svg>
    </div>
  )
}

class DashboardErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(_error: Error, _errorInfo: ErrorInfo) {}

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full w-full items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/5 text-xs text-red-300">
          Visualization unavailable
        </div>
      )
    }
    return this.props.children
  }
}

function DashboardView({
  props,
  stats,
  networkRttMs,
  networkDownlinkMbps,
  networkType,
  drives,
  cpuHistory,
  ramHistory,
  gpuHistory,
  chatHistory,
  isTyping,
  onVisionClick
}: DashboardViewProps) {
  const {
    isSystemActive,
    isVideoOn,
    visionMode,
    startVision,
    activeStream,
    toggleMic,
    toggleSystem,
    isMicMuted
  } = props

  const scrollRef = useRef<HTMLDivElement>(null)
  const mobileScrollRef = useRef<HTMLDivElement>(null)
  const videoElementRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const faceScanInterval = useRef<NodeJS.Timeout | null>(null)
  const faceScanBusyRef = useRef(false)

  const [modelsLoaded, setModelsLoaded] = useState(false)
  const [modelLoadError, setModelLoadError] = useState<string | null>(null)
  const [mobilePanel, setMobilePanel] = useState<'metrics' | 'transcript'>('metrics')

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    }
    if (mobileScrollRef.current) {
      mobileScrollRef.current.scrollTo({ top: mobileScrollRef.current.scrollHeight, behavior: 'smooth' })
    }
  }, [chatHistory, isTyping, mobilePanel])

  useEffect(() => {
    const loadModels = async () => {
      try {
        await ensureFaceModelsLoaded()
        setModelsLoaded(true)
        setModelLoadError(null)
      } catch {
        setModelLoadError('Vision models unavailable')
      }
    }
    loadModels()
  }, [])

  useEffect(() => {
    if (isVideoOn && visionMode === 'camera' && modelsLoaded && videoElementRef.current && canvasRef.current) {
      if (faceScanInterval.current) clearInterval(faceScanInterval.current)
      faceScanInterval.current = setInterval(async () => {
        if (faceScanBusyRef.current) return

        const video = videoElementRef.current
        const canvas = canvasRef.current
        if (!video || !canvas || video.readyState !== 4 || video.videoWidth === 0) return

        faceScanBusyRef.current = true
        try {
          const vw = video.videoWidth
          const vh = video.videoHeight
          if (canvas.width !== vw || canvas.height !== vh) {
            canvas.width = vw
            canvas.height = vh
          }

          const ctx = canvas.getContext('2d')
          if (!ctx) return

          const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.3 })
          const detection = await faceapi.detectSingleFace(video, options).withFaceExpressions().withAgeAndGender()
          ctx.clearRect(0, 0, vw, vh)

          if (detection) {
            const { x, y, width, height } = detection.detection.box
            const mirroredX = vw - x - width
            ctx.strokeStyle = '#7c3aed'
            ctx.lineWidth = 3
            const l = 20
            ctx.beginPath()
            ctx.moveTo(mirroredX, y + l)
            ctx.lineTo(mirroredX, y)
            ctx.lineTo(mirroredX + l, y)
            ctx.moveTo(mirroredX + width - l, y)
            ctx.lineTo(mirroredX + width, y)
            ctx.lineTo(mirroredX + width, y + l)
            ctx.moveTo(mirroredX, y + height - l)
            ctx.lineTo(mirroredX, y + height)
            ctx.lineTo(mirroredX + l, y + height)
            ctx.moveTo(mirroredX + width - l, y + height)
            ctx.lineTo(mirroredX + width, y + height)
            ctx.lineTo(mirroredX + width, y + height - l)
            ctx.stroke()
          }
        } catch {
          // Keep feed resilient if a single frame fails.
        } finally {
          faceScanBusyRef.current = false
        }
      }, 450)
    } else {
      if (faceScanInterval.current) clearInterval(faceScanInterval.current)
      faceScanBusyRef.current = false
      const ctx = canvasRef.current?.getContext('2d')
      if (ctx && canvasRef.current) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
      }
    }

    return () => {
      if (faceScanInterval.current) clearInterval(faceScanInterval.current)
    }
  }, [isVideoOn, visionMode, modelsLoaded])

  const setVideoRef = useCallback(
    (node: HTMLVideoElement | null) => {
      videoElementRef.current = node
      if (node && activeStream && isVideoOn) {
        node.srcObject = activeStream
        node.onloadedmetadata = () => node.play().catch(() => {})
      }
    },
    [activeStream, isVideoOn]
  )

  const setMobileVideoRef = useCallback(
    (node: HTMLVideoElement | null) => {
      if (node && activeStream && isVideoOn) {
        node.srcObject = activeStream
        node.onloadedmetadata = () => node.play().catch(() => {})
      }
    },
    [activeStream, isVideoOn]
  )

  const toggleSource = () => {
    if (!isSystemActive) return
    startVision(visionMode === 'camera' ? 'screen' : 'camera')
  }

  const systemMetrics: MetricCard[] = [
    {
      icon: <RiCpuLine />,
      label: 'CPU',
      val: isSystemActive && stats ? `${stats.cpu}%` : '--',
      color: 'text-blue-400',
      percent: isSystemActive && stats ? Number(stats.cpu) : null
    },
    {
      icon: <FaMemory />,
      label: 'RAM',
      val: isSystemActive && stats ? `${stats.memory.usedPercentage}%` : '--',
      color: 'text-violet-400',
      percent: isSystemActive && stats ? Number(stats.memory.usedPercentage) : null
    },
    {
      icon: <GiTinker />,
      label: 'TEMP',
      val: isSystemActive && stats && stats.temperature !== null ? `${stats.temperature}deg` : '--',
      color: 'text-amber-400',
      percent:
        isSystemActive && stats && stats.temperature !== null
          ? Math.max(0, Math.min(100, (stats.temperature / 100) * 100))
          : null
    },
    {
      icon: <HiComputerDesktop />,
      label: 'OS',
      val: isSystemActive && stats ? `${stats.os.type} ${stats.os.uptime}` : '--',
      color: 'text-emerald-400',
      percent: null
    }
  ]

  const transcriptContent = (
    <>
      {chatHistory.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center text-zinc-700 gap-2.5 opacity-40">
          <RiHistoryLine size={28} />
          <span className="text-[9px] tracking-[0.2em] uppercase font-mono">No data stream</span>
        </div>
      ) : (
        chatHistory.map((msg, idx) => (
          <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div
              className={`max-w-[95%] py-2 px-3 rounded-xl text-[11px] leading-relaxed font-medium transition-all ${
                msg.role === 'user'
                  ? 'bg-violet-600/15 border border-violet-500/20 text-violet-100/90 rounded-br-sm'
                  : 'bg-white/[0.03] border border-white/[0.06] text-zinc-400 rounded-bl-sm'
              }`}
            >
              {getMessageText(msg)}
            </div>
            <span className="mt-1 text-[9px] font-mono text-zinc-600">
              {msg.timestamp
                ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : ''}
            </span>
          </div>
        ))
      )}
      {isTyping && (
        <div className="flex items-start">
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl rounded-bl-sm px-3 py-2.5 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      )}
    </>
  )

  return (
    <div className="flex-1 p-2 grid grid-cols-12 gap-2 h-full overflow-hidden overflow-x-hidden relative animate-in fade-in zoom-in duration-300 w-full">
      <div className="hidden lg:flex col-span-3 flex-col gap-2 h-full z-40 overflow-y-auto overflow-x-hidden scrollbar-none pb-8 pr-1">
        <div className={`${glassPanel} h-[260px] shrink-0 flex flex-col overflow-hidden relative group border-violet-500/10 hover:border-violet-500/40 p-1 bg-black/40`}>
          <div className="absolute top-4 left-4 z-40 flex items-center gap-2.5 bg-black/60 backdrop-blur-xl rounded-full px-3 py-1.5 border border-white/10">
            <div className="relative flex items-center justify-center">
               <span className={`w-2 h-2 rounded-full ${isVideoOn ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,1)] animate-pulse' : 'bg-zinc-600'}`} />
            </div>
            <span className={`text-[10px] font-black tracking-widest uppercase ${isVideoOn ? 'text-red-400' : 'text-zinc-600'}`}>
              {isVideoOn ? (visionMode === 'screen' ? 'SCREEN' : 'OPTICAL') : 'OFFLINE'}
            </span>
          </div>

          <div className="absolute top-4 right-4 z-40 flex gap-2">
            {isVideoOn && (
              <button
                onClick={toggleSource}
                className="w-8 h-8 rounded-xl bg-black/60 backdrop-blur-xl border border-white/10 text-zinc-400 hover:text-white hover:border-violet-500/50 hover:bg-violet-600/20 transition-all shadow-lg flex items-center justify-center group/btn"
              >
                <RiSwapBoxLine size={15} className="group-hover/btn:rotate-180 transition-transform duration-500" />
              </button>
            )}
          </div>

          <div className="w-full h-full rounded-[1.8rem] overflow-hidden bg-[#050508] relative group-hover:scale-[1.01] transition-transform duration-700">
             {/* Technical Viewfinder corners */}
             <div className="absolute top-6 left-6 w-8 h-8 border-t-2 border-l-2 border-white/10 z-30 pointer-events-none" />
             <div className="absolute top-6 right-6 w-8 h-8 border-t-2 border-r-2 border-white/10 z-30 pointer-events-none" />
             <div className="absolute bottom-6 left-6 w-8 h-8 border-b-2 border-l-2 border-white/10 z-30 pointer-events-none" />
             <div className="absolute bottom-6 right-6 w-8 h-8 border-b-2 border-r-2 border-white/10 z-30 pointer-events-none" />
             
             {/* Center Crosshair */}
             <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30 opacity-10">
                <div className="w-10 h-px bg-white" />
                <div className="h-10 w-px bg-white absolute" />
             </div>
            <video
              key={visionMode}
              ref={setVideoRef}
              className={`absolute inset-0 w-full h-full object-cover ${visionMode === 'camera' ? '-scale-x-100' : ''}`}
              autoPlay
              playsInline
              muted
            />
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover pointer-events-none z-20" />
            
            {/* Tactical Overlay */}
            <div className="absolute inset-0 z-30 pointer-events-none overflow-hidden">
               {/* Viewfinder Corners - Glow */}
               <div className="absolute top-6 left-6 w-12 h-12 border-t-2 border-l-2 border-violet-500/30 blur-[1px]" />
               <div className="absolute top-6 right-6 w-12 h-12 border-t-2 border-r-2 border-violet-500/30 blur-[1px]" />
               <div className="absolute bottom-6 left-6 w-12 h-12 border-b-2 border-l-2 border-violet-500/30 blur-[1px]" />
               <div className="absolute bottom-6 right-6 w-12 h-12 border-b-2 border-r-2 border-violet-500/30 blur-[1px]" />
               
               {/* Viewfinder Corners - Solid */}
               <div className="absolute top-6 left-6 w-8 h-8 border-t-2 border-l-2 border-white/20" />
               <div className="absolute top-6 right-6 w-8 h-8 border-t-2 border-r-2 border-white/20" />
               <div className="absolute bottom-6 left-6 w-8 h-8 border-b-2 border-l-2 border-white/20" />
               <div className="absolute bottom-6 right-6 w-8 h-8 border-b-2 border-r-2 border-white/20" />

               {/* Center HUD */}
               <div className="absolute inset-0 flex items-center justify-center opacity-20 translate-y-[-10%]">
                  <div className="w-16 h-px bg-white/40" />
                  <div className="h-16 w-px bg-white/40 absolute" />
                  <div className="w-24 h-24 border border-white/10 rounded-full" />
               </div>

               {/* Scanning Line */}
               {isVideoOn && (
                 <div className="absolute inset-x-0 h-[2px] bg-violet-500/30 blur-[2px] animate-scanline-fast pointer-events-none shadow-[0_0_15px_rgba(139,92,246,0.5)]" />
               )}
            </div>

            <div
              className="absolute inset-0 pointer-events-none z-10 opacity-[0.08]"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.5) 2px, rgba(0,0,0,0.5) 4px)'
              }}
            />
            {isVideoOn && visionMode === 'camera' && !modelsLoaded && !modelLoadError && (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/55 text-[10px] font-mono tracking-widest text-violet-300">
                Loading vision models...
              </div>
            )}
            {modelLoadError && visionMode === 'camera' && (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/55 text-[10px] font-mono tracking-widest text-red-300">
                {modelLoadError}
              </div>
            )}
            {!isVideoOn && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-zinc-700">
                <RiCameraLine size={22} />
                <span className="text-[9px] font-mono tracking-widest">NO SIGNAL</span>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 bg-cyan-900/10 backdrop-blur-3xl rounded-2xl border border-cyan-500/20 shadow-[0_0_30px_rgba(6,182,212,0.1)] relative overflow-hidden group/disk shrink-0">
          <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 blur-[60px] rounded-full translate-x-1/2 -translate-y-1/2 pointer-events-none" />
          <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
            <span className="flex items-center gap-2.5 text-[11px] font-black tracking-[0.3em] text-cyan-400 uppercase">
              <RiHardDrive2Line size={16} className="text-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]" />
              STORAGE CLUSTER
            </span>
            <div className="flex gap-1.5">
               <div className="w-1.5 h-3 bg-cyan-500/60 rounded-full animate-pulse shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
               <div className="w-1.5 h-2 bg-cyan-500/30 rounded-full" />
            </div>
          </div>
          <div className="space-y-5">
            {drives.length === 0 ? (
              <div className="py-6 flex flex-col items-center justify-center opacity-40">
                 <RiCpuLine size={24} className="text-zinc-500 animate-pulse mb-2" />
                 <p className="text-[9px] font-black text-zinc-500 tracking-[0.3em] uppercase">LINKING DRIVE TELEMETRY</p>
              </div>
            ) : (
              drives.slice(0, 3).map((drive) => {
                const used = Math.max(0, drive.TotalGB - drive.FreeGB)
                const usedPct = drive.TotalGB > 0 ? Math.round((used / drive.TotalGB) * 100) : 0
                return (
                  <div key={String(drive.Name)} className="group/drive relative">
                    <div className="mb-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                         <div className="flex items-center justify-center w-5 h-5 rounded-lg bg-cyan-500/20 border border-cyan-500/30 text-cyan-400">
                            <RiCpuLine size={12} />
                         </div>
                         <div className="flex flex-col">
                            <span className="text-[10px] font-black text-white tracking-wider">DRIVE {drive.Name}</span>
                            <span className="text-[7px] font-bold text-zinc-500 tracking-widest uppercase">SYSLOG: SECTOR_{drive.Name}</span>
                         </div>
                      </div>
                      <div className="text-right">
                         <span className="text-[12px] font-black text-cyan-400 tabular-nums leading-none tracking-tighter shadow-cyan-900">{usedPct}%</span>
                         <p className="text-[6px] font-black text-zinc-600 uppercase tracking-tighter">UTILIZATION</p>
                      </div>
                    </div>
                    <div className="relative h-2.5 w-full rounded-full bg-black/80 p-[1.5px] border border-white/[0.05]">
                      <div 
                        className="h-full rounded-full bg-gradient-to-r from-cyan-700 via-cyan-400 to-white shadow-[0_0_12px_rgba(6,182,212,0.6)] transition-all duration-1000 ease-out relative" 
                        style={{ width: `${usedPct}%` }} 
                      >
                         <div className="absolute inset-0 bg-white/30 animate-pulse rounded-full" />
                      </div>
                    </div>
                    <div className="mt-2 flex justify-between text-[8px] font-black text-zinc-400 tracking-wider uppercase">
                       <span className="flex items-center gap-1 opacity-70"><RiCpuLine size={10} className="text-cyan-500" /> {Math.round(drive.TotalGB)}G CAP</span>
                       <span className="flex items-center gap-1 opacity-70"><RiCpuLine size={10} className="text-cyan-500" /> {Math.round(drive.FreeGB)}G FREE</span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        <div className={`${glassPanel} shrink-0 p-4`}>
          <div className="flex items-center justify-between mb-5">
            <span className="flex items-center gap-3 text-[11px] font-black tracking-[0.4em] text-zinc-500 uppercase">
              <RiPulseLine size={18} className={isSystemActive ? 'text-violet-500 animate-pulse' : 'text-zinc-700'} />
              SYSTEM UPLINK
            </span>
            <div className="flex items-center gap-2">
              {isSystemActive && (
                <div className="flex gap-1.5 px-2">
                   <div className="w-1 h-3 bg-violet-500/60 rounded-full animate-bounce" style={{animationDelay:'0ms'}}/>
                   <div className="w-1 h-3 bg-violet-400/60 rounded-full animate-bounce" style={{animationDelay:'200ms'}}/>
                   <div className="w-1 h-3 bg-violet-300/60 rounded-full animate-bounce" style={{animationDelay:'400ms'}}/>
                </div>
              )}
              <span
                className={`text-[10px] font-black tracking-widest px-4 py-1.5 rounded-xl transition-all duration-500 ${
                  isSystemActive
                    ? 'text-violet-400 bg-violet-600/20 border border-violet-400/30 shadow-[0_0_20px_rgba(139,92,246,0.3)]'
                    : 'text-zinc-700 bg-zinc-900/50 border border-white/[0.03]'
                }`}
              >
                {isSystemActive ? 'ENCRYPTED' : 'OFFLINE'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 bg-white/[0.02] p-4 rounded-2xl border border-white/[0.03]">
            <div className="group/stat">
              <p className="text-[10px] text-zinc-600 font-black tracking-[0.2em] mb-1.5 transition-colors group-hover/stat:text-violet-400">LATENCY</p>
              <div className="flex items-end gap-1.5">
                <span className="text-[16px] font-black text-white tabular-nums leading-none">
                  {isSystemActive ? (networkRttMs ? networkRttMs : '12') : '--'}
                </span>
                <span className="text-[10px] text-zinc-500 font-bold tracking-widest mb-[1px]">ms</span>
              </div>
            </div>
            <div className="text-right group/stat">
              <p className="text-[10px] text-zinc-600 font-black tracking-[0.2em] mb-1.5 transition-colors group-hover/stat:text-emerald-400 uppercase">Bandwidth</p>
              <div className="flex items-end justify-end gap-1.5">
                <span className="text-[16px] font-black text-white tabular-nums leading-none">
                  {networkDownlinkMbps ? networkDownlinkMbps.toFixed(1) : '--'}
                </span>
                <span className="text-[10px] text-zinc-500 font-bold tracking-widest mb-[1px]">mbps</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-5 mt-6 p-4 bg-black/40 rounded-[2rem] border border-white/[0.05] shadow-inner">
            <div className="flex items-end gap-1.5 h-10 px-1 border-r border-white/5 pr-4">
              {[1, 2, 3, 4, 5, 6].map((bar) => (
                <div
                  key={bar}
                  className={`w-1.5 rounded-t-sm transition-all duration-700 ${isSystemActive ? 'bg-gradient-to-t from-violet-700 via-violet-500 to-violet-300' : 'bg-zinc-800'}`}
                  style={{ height: `${bar * 6}px`, opacity: isSystemActive ? 1 : 0.2 }}
                />
              ))}
            </div>
            <div className="flex-1 flex flex-col gap-2">
               <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black tracking-[0.25em] text-zinc-600 uppercase">Stream Integrity</span>
                  <span className={`text-[10px] font-black tracking-widest ${isSystemActive ? 'text-violet-400 shadow-[0_0_10px_rgba(139,92,246,0.4)]' : 'text-zinc-800'}`}>
                    {isSystemActive ? 'MAXIMAL' : 'LOST'}
                  </span>
               </div>
               <div className="w-full h-2 bg-black/60 rounded-full overflow-hidden p-[2px] border border-white/[0.03]">
                  <div className={`h-full bg-gradient-to-r from-violet-600 to-violet-400 rounded-full transition-all duration-1000 ${isSystemActive ? 'w-[98%]' : 'w-0'}`} />
               </div>
               <div className="flex justify-between text-[8px] font-black tracking-widest text-zinc-700 uppercase">
                  <span>Packet Flow</span>
                  <span>Neural Sync</span>
               </div>
            </div>
          </div>
        </div>

        <div className={`${glassPanel} p-3.5 shrink-0`}>
          <div className="mb-2 text-[10px] font-semibold tracking-widest text-zinc-500 uppercase">Live Metrics</div>
          <div className="grid grid-cols-1 gap-2">
            <Sparkline data={cpuHistory} colorClass="text-blue-400" label="CPU Trend" />
            <Sparkline data={gpuHistory} colorClass="text-emerald-400" label="GPU Trend" />
          </div>
        </div>

        <div className={`${glassPanel} p-4 flex flex-col gap-3 shrink-0`}>
          <div className="flex items-center gap-2.5 text-[11px] font-black tracking-[0.25em] text-zinc-400 uppercase border-b border-white/[0.08] pb-4 mb-2">
            <RiLayoutGridLine size={14} className="text-violet-400" />
            CORE ANALYTICS
          </div>
          <div className="grid grid-cols-2 gap-3">
            {systemMetrics.map((m, i) => {
              const percent = m.percent !== null && Number.isFinite(Number(m.percent)) ? Math.max(0, Math.min(100, Number(m.percent))) : 0
              // Extract the color token (e.g., from text-blue-400 to blue-400)
              const colorBase = m.color.split('-').slice(1).join('-')
              
              return (
                <div
                  key={i}
                  className="bg-white/[0.02] hover:bg-white/[0.05] rounded-2xl p-4 flex flex-col justify-between border border-white/[0.04] hover:border-violet-500/20 transition-all duration-300 cursor-default relative overflow-hidden group/card"
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className={`${m.color} bg-current/10 p-1.5 rounded-lg text-base`}>{m.icon}</span>
                    <span className="text-[8px] font-black text-zinc-500 tracking-wider uppercase">{m.label}</span>
                  </div>
                  <div className="mt-2">
                    <span className={`text-[20px] font-black ${m.color} tracking-tight tabular-nums`}>{m.val}</span>
                    <div className="w-full h-1.5 bg-black/40 rounded-full mt-2.5 overflow-hidden border border-white/[0.03]">
                      <div 
                        className={`h-full rounded-full transition-all duration-1000 ease-out shadow-[0_0_12px_rgba(255,255,255,0.1)] ${m.color}`} 
                        style={{ 
                          width: `${percent}%`,
                          backgroundColor: 'currentColor'
                        }} 
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="col-span-12 lg:col-span-6 relative flex flex-col items-center justify-center">
        <div
          className={`lg:hidden absolute top-3 right-3 w-28 h-20 ${glassPanel} z-50 overflow-hidden ${isVideoOn ? 'block' : 'hidden'}`}
        >
          <video
            ref={setMobileVideoRef}
            className={`w-full h-full object-cover ${visionMode === 'camera' ? '-scale-x-100' : ''}`}
            autoPlay
            playsInline
            muted
          />
        </div>

        <div
          className={`w-[58vh] h-[58vh] max-w-full transition-all duration-1000 ${isSystemActive ? 'opacity-100 scale-100' : 'opacity-70 scale-90 grayscale'}`}
        >
          <DashboardErrorBoundary>
            <Sphere />
          </DashboardErrorBoundary>
        </div>

        <div className="absolute bottom-32 lg:bottom-8 z-50">
          <div className="relative flex items-center gap-2 px-5 py-3 bg-[#09090e]/90 backdrop-blur-xl border border-white/[0.07] rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.6)]">
            <button
              onClick={onVisionClick}
              title={isVideoOn ? 'Stop vision' : 'Start vision'}
              className={`cursor-pointer w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 ${
                isVideoOn
                  ? 'bg-red-500/15 text-red-400 border border-red-500/25 hover:bg-red-500/25'
                  : 'text-zinc-500 border border-transparent hover:bg-white/[0.06] hover:text-zinc-300'
              }`}
            >
              {isVideoOn ? <RiSwapBoxLine size={18} /> : <RiCameraLine size={18} />}
            </button>

            <div className="w-px h-6 bg-white/[0.06]" />

            <button onClick={toggleSystem} className="relative group mx-1">
              <div
                className={`cursor-pointer w-12 h-12 rounded-xl flex items-center justify-center border transition-all duration-300 ${
                  isSystemActive
                    ? 'bg-violet-600 border-violet-500/50 text-white shadow-[0_0_24px_rgba(124,58,237,0.5)] hover:bg-violet-500'
                    : 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20'
                }`}
              >
                <RiPhoneFill size={20} className={isSystemActive ? 'animate-pulse' : ''} />
              </div>
              {isSystemActive && <div className="absolute inset-0 rounded-xl animate-pulse-ring pointer-events-none" />}
            </button>

            <div className="w-px h-6 bg-white/[0.06]" />

            <button
              onClick={toggleMic}
              title={isMicMuted ? 'Unmute (Space)' : 'Mute (Space)'}
              className={`cursor-pointer w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 ${
                isMicMuted
                  ? 'bg-red-500/15 text-red-400 border border-red-500/25 hover:bg-red-500/25'
                  : 'bg-violet-500/10 text-violet-400 border border-violet-500/20 hover:bg-violet-500/15'
              }`}
            >
              {isMicMuted ? <RiMicOffLine size={18} /> : <RiMicLine size={18} />}
            </button>

            <AudioWaveform isActive={isSystemActive && !isMicMuted} />
          </div>
        </div>

        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 px-3 pb-3">
          <div className={`${glassPanel} p-2.5`}>
            <div className="mb-2 flex items-center gap-2">
              <button
                onClick={() => setMobilePanel('metrics')}
                className={`px-3 py-1 rounded-lg text-[10px] font-semibold tracking-wider ${
                  mobilePanel === 'metrics'
                    ? 'bg-violet-600/25 text-violet-300 border border-violet-500/30'
                    : 'bg-white/[0.03] text-zinc-500 border border-white/[0.06]'
                }`}
              >
                Metrics
              </button>
              <button
                onClick={() => setMobilePanel('transcript')}
                className={`px-3 py-1 rounded-lg text-[10px] font-semibold tracking-wider ${
                  mobilePanel === 'transcript'
                    ? 'bg-violet-600/25 text-violet-300 border border-violet-500/30'
                    : 'bg-white/[0.03] text-zinc-500 border border-white/[0.06]'
                }`}
              >
                Transcript
              </button>
            </div>

            {mobilePanel === 'metrics' ? (
              <div className="grid grid-cols-2 gap-2">
                <Sparkline data={cpuHistory} colorClass="text-blue-400" label="CPU" />
                <Sparkline data={ramHistory} colorClass="text-violet-400" label="RAM" />
              </div>
            ) : (
              <div ref={mobileScrollRef} className="max-h-40 overflow-y-auto space-y-2.5 pr-1 scrollbar-none">
                {transcriptContent}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="hidden lg:flex col-span-3 flex-col h-full z-40 overflow-hidden">
        <div className={`${glassPanel} h-full p-4 flex flex-col overflow-y-auto scrollbar-none`}>
          <div className="flex items-center justify-between border-b border-white/[0.05] pb-3 mb-3">
            <span className="flex items-center gap-1.5 text-[10px] font-semibold tracking-widest text-zinc-500 uppercase">
              <RiTerminalBoxLine size={12} />
              Transcript
            </span>
            <span className="flex items-center gap-1 text-[9px] font-mono text-violet-500/40 tracking-widest">
              <span className={`w-1 h-1 rounded-full bg-violet-500 ${chatHistory.length > 0 ? 'animate-pulse' : 'opacity-30'}`} />
              LIVE
            </span>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-2.5 pr-1 scrollbar-none min-h-0">
            {transcriptContent}
          </div>
        </div>
      </div>
    </div>
  )
}

export default memo(DashboardView)
