import { useState, useEffect, useRef } from 'react'
import {
  RiMicLine,
  RiMicOffLine,
  RiComputerLine,
  RiCameraLine,
  RiArrowUpSLine,
  RiDragMove2Fill
} from 'react-icons/ri'
import { GiPowerButton } from 'react-icons/gi'
import { eliService } from '@renderer/services/Eli-voice-ai'
import { VisionMode } from '@renderer/IndexRoot'

interface OverlayProps {
  isSystemActive: boolean
  toggleSystem: () => void
  isMicMuted: boolean
  toggleMic: () => void
  isVideoOn: boolean
  visionMode: VisionMode
  startVision: (mode: 'camera' | 'screen') => void
  stopVision: () => void
}

const MiniOverlay = ({
  isSystemActive,
  toggleSystem,
  isMicMuted,
  toggleMic,
  isVideoOn,
  visionMode,
  startVision,
  stopVision
}: OverlayProps) => {
  const [isTalking, setIsTalking] = useState(false)
  const analyzerRef = useRef<AnalyserNode | null>(null)
  const dataArrayRef = useRef<Uint8Array | null>(null)

  useEffect(() => {
    if (isSystemActive && eliService.analyser) {
      analyzerRef.current = eliService.analyser
      dataArrayRef.current = new Uint8Array(eliService.analyser.frequencyBinCount)
      const checkAudio = () => {
        if (analyzerRef.current && dataArrayRef.current) {
          analyzerRef.current.getByteFrequencyData(dataArrayRef.current as unknown as Uint8Array<ArrayBuffer>)
          const avg = dataArrayRef.current.reduce((a, b) => a + b) / dataArrayRef.current.length
          setIsTalking(avg > 10)
        }
        if (isSystemActive) requestAnimationFrame(checkAudio)
      }
      checkAudio()
    } else {
      setIsTalking(false)
    }
  }, [isSystemActive])

  const handleVisionClick = (mode: 'camera' | 'screen') => {
    if (isVideoOn && visionMode === mode) {
      stopVision()
    } else {
      startVision(mode)
    }
  }

  const expand = () => {
    window.electron.ipcRenderer.send('toggle-overlay')
  }

  return (
    /*
     * FIX: Removed `backdrop-blur-2xl` — causes black-rectangle artifacts
     * in Electron transparent windows on Windows (Chromium compositing bug).
     * Background is bg-zinc-950 (fully opaque) to compensate.
     */
    <div className="mini-overlay-shell mini-overlay-sweep mini-overlay-attention drag-region relative w-full h-full box-border flex items-center justify-between gap-2 px-2.5 bg-zinc-950 rounded-[999px] border border-white/[0.07] overflow-hidden">

      {/* ── Left — Status dot + audio bars ── */}
      <div className="flex items-center gap-2 no-drag relative z-10">
        <div
          className={`w-7 h-7 rounded-full flex items-center justify-center border transition-all duration-100 ${
            isSystemActive
              ? isTalking
                ? 'border-purple-500 bg-purple-500/15 shadow-[0_0_12px_rgba(139,92,246,0.5)] animate-pulse-ring'
                : 'border-purple-700/60 bg-purple-900/20'
              : 'border-zinc-700 bg-zinc-900'
          }`}
        >
          <div
            className={`w-2 h-2 rounded-full transition-colors duration-100 ${
              isSystemActive ? (isTalking ? 'bg-purple-300' : 'bg-purple-500') : 'bg-red-900'
            }`}
          />
        </div>

        {/* Audio level bars */}
        <div className="flex items-end gap-px h-3.5">
          {[1, 2, 3, 4].map((bar) => (
            <span
              key={bar}
              className={`w-0.5 rounded-full transition-all duration-300 ${
                isSystemActive ? 'bg-purple-500/80' : 'bg-zinc-700'
              }`}
              style={{
                height: isSystemActive ? `${4 + bar * (isTalking ? 2 : 1)}px` : '3px',
                opacity: isSystemActive ? 1 : 0.4
              }}
            />
          ))}
        </div>
      </div>

      {/* ── Center — Controls ── */}
      <div className="flex items-center gap-1 no-drag relative z-10">
        {/* Mic */}
        <button
          onClick={toggleMic}
          disabled={!isSystemActive}
          title={isMicMuted ? 'Unmute' : 'Mute'}
          className={`p-2 rounded-full transition-all duration-100 hover:scale-105 active:scale-95 ${
            !isSystemActive
              ? 'opacity-25'
              : isMicMuted
                ? 'text-red-400 bg-red-500/10'
                : 'text-purple-400 bg-purple-700/20'
          }`}
        >
          {isMicMuted ? <RiMicOffLine size={15} /> : <RiMicLine size={15} />}
        </button>

        {/* Power */}
        <button
          onClick={toggleSystem}
          title={isSystemActive ? 'Deactivate' : 'Activate'}
          className={`p-2 rounded-full border transition-all duration-150 mx-0.5 hover:scale-105 active:scale-95 ${
            isSystemActive
              ? 'bg-purple-700/25 border-purple-500/70 text-purple-300'
              : 'bg-zinc-800 border-zinc-600 text-zinc-500 hover:text-red-400 hover:border-red-500/40'
          }`}
        >
          <GiPowerButton size={16} />
        </button>

        {/* Camera */}
        <button
          onClick={() => handleVisionClick('camera')}
          disabled={!isSystemActive}
          title="Toggle Camera"
          className={`p-2 rounded-full transition-all duration-100 hover:scale-105 active:scale-95 ${
            !isSystemActive
              ? 'opacity-25'
              : isVideoOn && visionMode === 'camera'
                ? 'text-red-400 bg-red-500/10 border border-red-500/25'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.07]'
          }`}
        >
          <RiCameraLine size={15} />
        </button>

        {/* Screen */}
        <button
          onClick={() => handleVisionClick('screen')}
          disabled={!isSystemActive}
          title="Toggle Screen"
          className={`p-2 rounded-full transition-all duration-100 hover:scale-105 active:scale-95 ${
            !isSystemActive
              ? 'opacity-25'
              : isVideoOn && visionMode === 'screen'
                ? 'text-red-400 bg-red-500/10 border border-red-500/25'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.07]'
          }`}
        >
          <RiComputerLine size={15} />
        </button>
      </div>

      {/* ── Right — Expand + Drag ── */}
      <div className="pl-2 border-l border-purple-800/20 no-drag flex items-center gap-1 relative z-10">
        <button
          onClick={expand}
          title="Expand"
          className="p-1.5 rounded-full text-purple-600 hover:text-purple-300 hover:bg-purple-800/15 transition-all duration-150 hover:scale-110 active:scale-95"
        >
          <RiArrowUpSLine size={15} />
        </button>
        <div className="drag-region cursor-move text-purple-800/35">
          <RiDragMove2Fill size={12} />
        </div>
      </div>
    </div>
  )
}

export default MiniOverlay
