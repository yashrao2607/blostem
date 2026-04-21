import { useState, useEffect, useRef } from 'react'
import {
  RiShieldKeyholeLine,
  RiFingerprintLine,
  RiLockPasswordLine,
  RiCameraLensLine,
  RiAlertLine,
  RiShieldFlashLine
} from 'react-icons/ri'
import * as faceapi from 'face-api.js'
import { motion, AnimatePresence } from 'framer-motion'
import gsap from 'gsap'

interface LockScreenProps {
  onUnlock: () => void
}

type AuthMode = 'face' | 'pin'

export default function LockScreen({ onUnlock }: LockScreenProps) {
  const [authMode, setAuthMode] = useState<AuthMode>('face')
  const [pin, setPin] = useState('')

  const [needsPinSetup, setNeedsPinSetup] = useState(false)
  const [needsFaceSetup, setNeedsFaceSetup] = useState(false)

  const [error, setError] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const [aiStatus, setAiStatus] = useState('INITIALIZING HARDWARE...')
  const [isFaceMatched, setIsFaceMatched] = useState(false)
  const [isScanning, setIsScanning] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const laserRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (window.electron?.ipcRenderer) {
      window.electron.ipcRenderer
        .invoke('check-vault-status')
        .then((status: { hasPin: boolean; hasFace: boolean }) => {
          setNeedsPinSetup(!status.hasPin)
          setNeedsFaceSetup(!status.hasFace)
          setIsLoading(false)
          if (authMode === 'face') loadNeuralNets(!status.hasFace)
        })
        .catch(() => setIsLoading(false))
    } else {
      setIsLoading(false)
    }
    return () => stopCamera()
  }, [])

  useEffect(() => {
    if (authMode === 'face' && !isLoading) {
      startHardware()
      if (laserRef.current) {
        gsap.fromTo(
          laserRef.current,
          { top: '0%', opacity: 0.7 },
          { top: '100%', opacity: 0.5, duration: 2.2, repeat: -1, yoyo: true, ease: 'sine.inOut' }
        )
      }
    } else {
      stopCamera()
      inputRef.current?.focus()
    }
  }, [authMode, isLoading])

  const startHardware = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
    } catch (err) {
      setAiStatus('CAMERA OFFLINE — USE PIN')
    }
  }

  const stopCamera = () => {
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current)
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream
      stream.getTracks().forEach((track) => track.stop())
      videoRef.current.srcObject = null
    }
    setIsScanning(false)
  }

  const loadNeuralNets = async (isFaceSetup: boolean) => {
    try {
      setAiStatus('LOADING NEURAL NETS...')
      const MODEL_URL = '/models'
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
      ])
      startScanning(isFaceSetup)
    } catch (err) {
      setAiStatus('AI OFFLINE — USE PIN')
    }
  }

  const startScanning = (isFaceSetup: boolean) => {
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current)
    setIsScanning(true)

    scanIntervalRef.current = setInterval(async () => {
      if (!videoRef.current || videoRef.current.readyState !== 4 || error) return
      try {
        const options = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.4 })
        const detection = await faceapi
          .detectSingleFace(videoRef.current, options)
          .withFaceLandmarks()
          .withFaceDescriptor()

        if (detection) {
          const descriptorArray = Array.from(detection.descriptor)
          if (isFaceSetup) {
            setAiStatus('FACE ACQUIRED. ENROLLING...')
            await window.electron.ipcRenderer.invoke('setup-vault-face', descriptorArray)
            clearInterval(scanIntervalRef.current!)
            setNeedsFaceSetup(false)
            setTimeout(() => {
              stopCamera()
              onUnlock()
            }, 1000)
          } else {
            setAiStatus('ANALYZING BIOMETRICS...')
            const isMatch = await window.electron.ipcRenderer.invoke('verify-vault-face', descriptorArray)
            if (isMatch) {
              clearInterval(scanIntervalRef.current!)
              setIsFaceMatched(true)
              setAiStatus('IDENTITY VERIFIED')
              setTimeout(() => {
                stopCamera()
                onUnlock()
              }, 1000)
            } else {
              setError(true)
              setAiStatus('UNKNOWN ENTITY DETECTED')
              setTimeout(() => {
                setError(false)
                setAiStatus('SCANNING FOR AUTHORIZATION...')
              }, 2500)
            }
          }
        } else {
          if (!isFaceMatched && !error) setAiStatus('ALIGN FACE TO CENTER...')
        }
      } catch (scanErr) {}
    }, 800)
  }

  const handlePinChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (error || authMode !== 'pin') return
    const value = e.target.value.replace(/\D/g, '')
    if (value.length <= 4) {
      setPin(value)
      if (value.length === 4) processPin(value)
    }
  }

  const processPin = async (currentPin: string) => {
    if (needsPinSetup) {
      await window.electron.ipcRenderer.invoke('setup-vault-pin', currentPin)
      onUnlock()
    } else {
      const isValid = await window.electron.ipcRenderer.invoke('verify-vault-pin', currentPin)
      if (isValid) {
        setTimeout(() => onUnlock(), 300)
      } else {
        setError(true)
        setTimeout(() => {
          setPin('')
          setError(false)
          inputRef.current?.focus()
        }, 800)
      }
    }
  }

  if (isLoading) return <div className="w-screen h-screen bg-[#040407]" />

  const headerText = error
    ? 'ACCESS DENIED'
    : isFaceMatched
      ? 'IDENTITY VERIFIED'
      : needsPinSetup || needsFaceSetup
        ? 'INITIALIZE VAULT'
        : 'SYSTEM LOCKED'

  return (
    <div
      className="flex flex-col items-center justify-center w-screen h-screen bg-[#040407] relative overflow-hidden select-none"
      onClick={() => authMode === 'pin' && inputRef.current?.focus()}
    >
      {/* Background gradient */}
      <div
        className={`absolute inset-0 transition-all duration-700 ${
          error
            ? 'bg-[radial-gradient(ellipse_at_center,rgba(239,68,68,0.12)_0%,transparent_65%)]'
            : isFaceMatched
              ? 'bg-[radial-gradient(ellipse_at_center,rgba(124,58,237,0.12)_0%,transparent_65%)]'
              : 'bg-[radial-gradient(ellipse_at_center,rgba(124,58,237,0.05)_0%,transparent_65%)]'
        }`}
      />

      {/* Subtle grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.015]"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)',
          backgroundSize: '40px 40px'
        }}
      />

      {/* Lock Card */}
      <div
        className={`relative z-10 flex flex-col items-center gap-7 p-10 w-[500px] max-w-[92vw] rounded-3xl backdrop-blur-xl border transition-all duration-300 ${
          error
            ? 'border-red-500/30 bg-red-950/20 shadow-[0_0_80px_rgba(239,68,68,0.12)]'
            : isFaceMatched
              ? 'border-violet-500/30 bg-violet-950/10 shadow-[0_0_60px_rgba(124,58,237,0.15)]'
              : 'border-white/[0.07] bg-[#09090e]/80 shadow-[0_24px_80px_rgba(0,0,0,0.6)]'
        }`}
      >
        {/* Logo mark */}
        <div className="flex items-center gap-2 absolute top-5 left-5 opacity-40">
          <RiShieldFlashLine size={14} className="text-violet-400" />
          <span className="text-[9px] font-mono tracking-widest text-zinc-500">ELI OS</span>
        </div>

        {/* Header Text */}
        <div className="text-center space-y-2 mt-2">
          <h1
            className={`text-[18px] font-bold tracking-[0.3em] transition-colors flex items-center justify-center gap-2.5 ${
              error ? 'text-red-400' : isFaceMatched ? 'text-violet-300' : 'text-zinc-100'
            }`}
          >
            {error && <RiAlertLine size={20} className="animate-pulse" />}
            {headerText}
          </h1>
          <div
            className={`inline-flex items-center px-3 py-1 rounded-full border text-[10px] font-mono tracking-widest ${
              error
                ? 'bg-red-500/8 border-red-500/20 text-red-400'
                : 'bg-white/[0.03] border-white/[0.06] text-zinc-500'
            }`}
          >
            {authMode === 'face'
              ? aiStatus
              : needsPinSetup
                ? 'CREATE MASTER PIN'
                : 'ENTER PIN CODE'}
          </div>
        </div>

        {/* Auth Panel */}
        <div className="min-h-[340px] flex items-center justify-center w-full">
          <AnimatePresence mode="wait">
            {/* FACE MODE */}
            {authMode === 'face' && (
              <motion.div
                key="face-view"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.25 }}
                className={`relative flex items-center justify-center w-80 h-80 rounded-3xl border-2 overflow-hidden bg-black transition-all duration-300 ${
                  error
                    ? 'border-red-500/50 shadow-[0_0_40px_rgba(239,68,68,0.2)]'
                    : isFaceMatched
                      ? 'border-violet-500/50 shadow-[0_0_40px_rgba(124,58,237,0.2)]'
                      : 'border-white/[0.08] shadow-[0_0_30px_rgba(0,0,0,0.6)]'
                }`}
              >
                <video
                  ref={videoRef}
                  className={`absolute inset-0 w-full h-full object-cover -scale-x-100 transition-opacity duration-300 ${
                    error ? 'opacity-30 grayscale' : 'opacity-85'
                  }`}
                  autoPlay
                  muted
                  playsInline
                />

                {/* Laser scan line */}
                {isScanning && !isFaceMatched && (
                  <div
                    ref={laserRef}
                    className={`absolute left-0 w-full h-px z-20 transition-colors duration-300 ${
                      error
                        ? 'bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.8),0_0_24px_rgba(239,68,68,0.4)]'
                        : 'bg-violet-500 shadow-[0_0_12px_rgba(124,58,237,0.8),0_0_24px_rgba(124,58,237,0.4)]'
                    }`}
                  />
                )}

                {/* Corner brackets */}
                {[
                  'top-3 left-3 border-t-2 border-l-2',
                  'top-3 right-3 border-t-2 border-r-2',
                  'bottom-3 left-3 border-b-2 border-l-2',
                  'bottom-3 right-3 border-b-2 border-r-2'
                ].map((pos, i) => (
                  <div
                    key={i}
                    className={`absolute w-7 h-7 z-10 transition-colors duration-300 ${pos} ${
                      error ? 'border-red-500/70' : isFaceMatched ? 'border-violet-400' : 'border-violet-600/50'
                    }`}
                  />
                ))}

                {/* Matched overlay */}
                {isFaceMatched && (
                  <div className="absolute inset-0 bg-violet-800/25 flex items-center justify-center backdrop-blur-sm z-30">
                    <RiFingerprintLine size={72} className="text-violet-400 drop-shadow-[0_0_20px_rgba(124,58,237,0.6)]" />
                  </div>
                )}

                {/* Error overlay */}
                {error && (
                  <div className="absolute inset-0 bg-red-500/15 flex flex-col items-center justify-center backdrop-blur-sm z-30">
                    <RiAlertLine size={56} className="text-red-400 mb-2" />
                    <span className="text-red-400 font-bold tracking-widest text-[11px] font-mono">INTRUDER ALERT</span>
                  </div>
                )}
              </motion.div>
            )}

            {/* PIN MODE */}
            {authMode === 'pin' && (
              <motion.div
                key="pin-view"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.25 }}
                className="flex flex-col items-center gap-10"
              >
                {/* Lock icon */}
                <div
                  className={`p-7 rounded-3xl transition-all duration-300 ${
                    error
                      ? 'text-red-400 bg-red-500/8 shadow-[0_0_40px_rgba(239,68,68,0.1)] border border-red-500/15'
                      : 'text-violet-400 bg-violet-600/8 shadow-[0_0_40px_rgba(124,58,237,0.1)] border border-violet-500/15'
                  }`}
                >
                  {needsPinSetup ? <RiLockPasswordLine size={52} /> : <RiShieldKeyholeLine size={52} />}
                </div>

                {/* PIN dots */}
                <div className="flex gap-5">
                  {[0, 1, 2, 3].map((index) => {
                    const isFilled = pin.length > index
                    const isActive = pin.length === index && !error
                    return (
                      <div
                        key={index}
                        className={`w-14 h-16 flex items-center justify-center text-2xl rounded-2xl border-2 transition-all duration-200 ${
                          isFilled
                            ? error
                              ? 'border-red-500/60 bg-red-500/8 text-red-400 shadow-[0_0_16px_rgba(239,68,68,0.2)]'
                              : 'border-violet-500/50 bg-violet-600/10 text-violet-300 shadow-[0_0_16px_rgba(124,58,237,0.2)] scale-105'
                            : isActive
                              ? 'border-violet-500/30 bg-black/50 scale-[1.02]'
                              : 'border-white/[0.06] bg-black/30 text-zinc-700'
                        }`}
                      >
                        {isFilled ? (
                          <span className="animate-in zoom-in duration-150">●</span>
                        ) : isActive ? (
                          <span className="animate-pulse text-violet-500/40">|</span>
                        ) : (
                          ''
                        )}
                      </div>
                    )
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Mode Switch */}
        {!isFaceMatched && (
          <button
            onClick={() => {
              if (authMode === 'face') {
                setAuthMode('pin')
                setTimeout(() => inputRef.current?.focus(), 400)
              } else {
                setAuthMode('face')
                setPin('')
              }
            }}
            className="px-6 py-2.5 rounded-full border border-zinc-800 bg-transparent text-[10px] font-semibold tracking-[0.15em] text-zinc-500 hover:text-violet-300 hover:border-violet-500/30 hover:bg-violet-600/[0.06] transition-all flex items-center gap-2 shadow-lg"
          >
            {authMode === 'face' ? <RiLockPasswordLine size={13} /> : <RiCameraLensLine size={13} />}
            {authMode === 'face' ? 'Use PIN Instead' : 'Use Face ID'}
          </button>
        )}

        {/* Hidden PIN input */}
        <input
          ref={inputRef}
          type="text"
          pattern="\d*"
          value={pin}
          onChange={handlePinChange}
          className="opacity-0 absolute -left-[9999px]"
          maxLength={4}
          autoComplete="off"
        />
      </div>

      {/* Footer */}
      <div className="absolute bottom-6 text-[9px] font-mono tracking-widest text-zinc-700 uppercase">
        ELI Kernel Security V3.5 · Biometric Linked
      </div>
    </div>
  )
}
