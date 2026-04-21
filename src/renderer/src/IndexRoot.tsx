import { useState, useEffect, useRef } from 'react'
import MiniOverlay from './components/MiniOverlay'
import { eliService } from './services/Eli-voice-ai'
import { getScreenSourceId } from './hooks/CaptureDesktop'
import ELI from './UI/ELI'
import TerminalOverlay from './components/TerminalOverlay'
import LeafletMapWidget from './Widgets/MapView'
import ImageWidget from './Widgets/ImageWidget'
import EmailWidget from './Widgets/EmailWidget'
import WeatherWidget from './Widgets/WeatherWidget'
import StockWidget from './Widgets/StockWidget'
import LiveCodingWidget from './Widgets/LiveCodingWidget'
import WormholeWidget from './Widgets/WormholeWidget'
import OracleWidget from './Widgets/RagOracleWidget'
import ResearchWidget from './Widgets/DeepResearch'
import SemanticWidget from './Widgets/SemanticSearch'
import SmartDropZonesWidget from './Widgets/SmartZoneWidget'
import TitleBar from './components/Titlebar'
import ToastHost from './components/ToastHost'
import { useToastStore } from './store/toast-store'
import { ensureFaceModelsLoaded } from './services/face-models'

export type VisionMode = 'camera' | 'screen' | 'none'

type WidgetKey =
  | 'smartzones'
  | 'semantic'
  | 'oracle'
  | 'wormhole'
  | 'map'
  | 'stock'
  | 'weather'
  | 'image'
  | 'email'
  | 'terminal'
  | 'livecoding'
  | 'research'

const IndexRoot = () => {
  const [isOverlay, setIsOverlay] = useState(false)
  const [isReentering, setIsReentering] = useState(false)

  const [isSystemActive, setIsSystemActive] = useState(false)
  const [isMicMuted, setIsMicMuted] = useState(true)

  const [isVideoOn, setIsVideoOn] = useState(false)
  const [visionMode, setVisionMode] = useState<VisionMode>('none')
  const [activeStream, setActiveStream] = useState<MediaStream | null>(null)
  const [mountedWidgets, setMountedWidgets] = useState<Set<WidgetKey>>(new Set(['terminal']))

  const processingVideoRef = useRef<HTMLVideoElement>(document.createElement('video'))
  const activeStreamRef = useRef<MediaStream | null>(null)
  const aiIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const frameCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const wasOverlayRef = useRef(false)
  const mountedWidgetsRef = useRef<Set<WidgetKey>>(new Set(['terminal']))
  const addToast = useToastStore((s) => s.addToast)

  useEffect(() => {
    window.electron.ipcRenderer.on('overlay-mode', (_e, mode) => {
      setIsOverlay(mode)
      document.documentElement.classList.toggle('overlay-mode', mode)
      if (wasOverlayRef.current && !mode) {
        setIsReentering(true)
        setTimeout(() => setIsReentering(false), 900)
      }
      wasOverlayRef.current = mode
    })
    return () => {
      window.electron.ipcRenderer.removeAllListeners('overlay-mode')
    }
  }, [])

  useEffect(() => {
    const watchdog = setInterval(() => {
      if (isSystemActive && !eliService.isConnected) {
        setIsSystemActive(false)
        setIsMicMuted(true)
        stopVision()
      }
    }, 1000)
    return () => clearInterval(watchdog)
  }, [isSystemActive])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return
      const target = event.target as HTMLElement | null
      const isTyping =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.getAttribute('contenteditable') === 'true')
      if (isTyping) return
      event.preventDefault()
      toggleMic()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isMicMuted])

  useEffect(() => {
    const timer = setTimeout(() => {
      ensureFaceModelsLoaded().catch(() => {})
    }, 4000)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    const mountWidgetFromEvent = (widget: WidgetKey, eventName: string) => (event: Event) => {
      if (mountedWidgetsRef.current.has(widget)) return
      mountedWidgetsRef.current.add(widget)
      setMountedWidgets((prev) => new Set([...prev, widget]))

      const custom = event as CustomEvent
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent(eventName, { detail: custom.detail }))
      }, 0)
    }

    const eventMap: Array<{ name: string; widget: WidgetKey }> = [
      { name: 'dropzone-start', widget: 'smartzones' },
      { name: 'semantic-start', widget: 'semantic' },
      { name: 'oracle-ingest-start', widget: 'oracle' },
      { name: 'oracle-thinking', widget: 'oracle' },
      { name: 'wormhole-opened', widget: 'wormhole' },
      { name: 'map-update', widget: 'map' },
      { name: 'map-route', widget: 'map' },
      { name: 'show-stock', widget: 'stock' },
      { name: 'show-weather', widget: 'weather' },
      { name: 'image-gen', widget: 'image' },
      { name: 'show-emails', widget: 'email' },
      { name: 'ai-start-coding', widget: 'livecoding' },
      { name: 'ai-open-vscode', widget: 'livecoding' },
      { name: 'deep-research-start', widget: 'research' }
    ]

    const cleanups: Array<() => void> = []
    eventMap.forEach(({ name, widget }) => {
      const handler = mountWidgetFromEvent(widget, name)
      window.addEventListener(name, handler)
      cleanups.push(() => window.removeEventListener(name, handler))
    })

    return () => cleanups.forEach((fn) => fn())
  }, [])

  const toggleSystem = async () => {
    if (!isSystemActive) {
      try {
        await eliService.connect()
        setIsSystemActive(true)
        setIsMicMuted(false)
        eliService.setMute(false)
      } catch (err: any) {
        if (err.message === 'NO_API_KEY') {
          addToast('Critical error: Gemini API key missing. Add it in Settings > API Keys.', 'error')
        } else {
          addToast(`Connection failed: ${err.message}`, 'error')
        }
        setIsSystemActive(false)
      }
    } else {
      eliService.disconnect()
      setIsSystemActive(false)
      setIsMicMuted(true)
      eliService.setMute(true)
      stopVision()
    }
  }

  const toggleMic = () => {
    const s = !isMicMuted
    setIsMicMuted(s)
    eliService.setMute(s)
  }

  const startVision = async (mode: 'camera' | 'screen') => {
    if (!isSystemActive) return

    try {
      if (activeStreamRef.current) {
        activeStreamRef.current.getTracks().forEach((t) => t.stop())
        activeStreamRef.current = null
        setActiveStream(null)
      }

      let stream: MediaStream

      if (mode === 'camera') {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 }
        })
      } else {
        const sourceId = await getScreenSourceId()
        if (!sourceId) return
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            // @ts-ignore
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: sourceId,
              maxWidth: 1280,
              maxHeight: 720
            }
          }
        })
      }

      activeStreamRef.current = stream
      setActiveStream(stream)

      processingVideoRef.current.srcObject = stream
      await processingVideoRef.current.play()

      setVisionMode(mode)
      setIsVideoOn(true)

      startAIProcessing()

      stream.getVideoTracks()[0].onended = () => stopVision()
    } catch (e) {
      stopVision()
    }
  }

  const stopVision = () => {
    setIsVideoOn(false)
    setVisionMode('none')

    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach((t) => t.stop())
      activeStreamRef.current = null
      setActiveStream(null)
    }

    if (processingVideoRef.current) {
      processingVideoRef.current.srcObject = null
    }

    if (aiIntervalRef.current) {
      clearInterval(aiIntervalRef.current)
      aiIntervalRef.current = null
    }
  }

  const startAIProcessing = () => {
    if (aiIntervalRef.current) clearInterval(aiIntervalRef.current)
    if (!frameCanvasRef.current) frameCanvasRef.current = document.createElement('canvas')

    aiIntervalRef.current = setInterval(() => {
      const vid = processingVideoRef.current
      if (vid && vid.readyState === 4 && eliService.socket?.readyState === WebSocket.OPEN) {
        if (eliService.socket.bufferedAmount > 1024 * 1024) return
        const canvas = frameCanvasRef.current!
        canvas.width = 640
        canvas.height = 360
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(vid, 0, 0, canvas.width, canvas.height)
          const base64 = canvas.toDataURL('image/jpeg', 0.45).split(',')[1]
          eliService.sendVideoFrame(base64)
        }
      }
    }, 1200)
  }

  if (isOverlay) {
    return (
      <div className="w-screen h-screen m-0 p-0 bg-transparent overflow-hidden">
        <MiniOverlay
          isSystemActive={isSystemActive}
          toggleSystem={toggleSystem}
          isMicMuted={isMicMuted}
          toggleMic={toggleMic}
          isVideoOn={isVideoOn}
          visionMode={visionMode}
          startVision={startVision}
          stopVision={stopVision}
        />
      </div>
    )
  }

  return (
    <div
      className={`flex flex-col h-screen w-screen bg-black overflow-hidden relative border border-purple-800/20 rounded-xl ${isReentering ? 'reentry-shell-fx' : ''}`}
    >
      <TitleBar />
      <div className="flex-1 relative">
        <ELI
          isSystemActive={isSystemActive}
          toggleSystem={toggleSystem}
          isMicMuted={isMicMuted}
          toggleMic={toggleMic}
          isVideoOn={isVideoOn}
          visionMode={visionMode}
          startVision={startVision}
          stopVision={stopVision}
          activeStream={activeStream}
          isReentering={isReentering}
        />
      </div>
      {mountedWidgets.has('smartzones') && <SmartDropZonesWidget />}
      {mountedWidgets.has('semantic') && <SemanticWidget />}
      {mountedWidgets.has('oracle') && <OracleWidget />}
      {mountedWidgets.has('wormhole') && <WormholeWidget />}
      {mountedWidgets.has('map') && <LeafletMapWidget />}
      {mountedWidgets.has('stock') && <StockWidget />}
      {mountedWidgets.has('weather') && <WeatherWidget />}
      {mountedWidgets.has('image') && <ImageWidget />}
      {mountedWidgets.has('email') && <EmailWidget />}
      {mountedWidgets.has('terminal') && <TerminalOverlay />}
      {mountedWidgets.has('livecoding') && <LiveCodingWidget />}
      {mountedWidgets.has('research') && <ResearchWidget />}
      <ToastHost />
    </div>
  )
}

export default IndexRoot

