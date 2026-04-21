import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import * as faceapi from 'face-api.js'
import { GiArtificialIntelligence } from 'react-icons/gi'
import {
  RiKey2Line,
  RiSave3Line,
  RiUserVoiceLine,
  RiUserLine,
  RiLockPasswordLine,
  RiScan2Line,
  RiAddLine,
  RiRecordCircleLine,
  RiSettings4Line,
  RiShieldKeyholeLine,
  RiPlugLine,
  RiBrainLine,
  RiCloudLine,
  RiCpuLine,
  RiDatabase2Line,
  RiCheckLine
} from 'react-icons/ri'
import { useToastStore } from '@renderer/store/toast-store'

interface SettingsProps {
  isSystemActive: boolean
}

type TabType = 'general' | 'keys' | 'security'

const TABS: { id: TabType; label: string; icon: React.ReactNode }[] = [
  { id: 'general', label: 'General', icon: <RiSettings4Line size={14} /> },
  { id: 'keys', label: 'API Keys', icon: <RiPlugLine size={14} /> },
  { id: 'security', label: 'Security', icon: <RiShieldKeyholeLine size={14} /> }
]

const SettingsView = ({ isSystemActive }: SettingsProps) => {
  const [activeTab, setActiveTab] = useState<TabType>('general')

  const [voice, setVoice] = useState<'MALE' | 'FEMALE'>(
    (localStorage.getItem('eli_voice_profile') as 'MALE' | 'FEMALE') || 'FEMALE'
  )
  const [personality, setPersonality] = useState('')
  const [userName, setUserName] = useState(localStorage.getItem('eli_user_name') || '')

  const [geminiKey, setGeminiKey] = useState(localStorage.getItem('eli_custom_api_key') || '')
  const [groqKey, setGroqKey] = useState(localStorage.getItem('eli_groq_api_key') || '')
  const [hfKey, setHfKey] = useState(localStorage.getItem('eli_hf_api_key') || '')
  const [notionKey, setNotionKey] = useState(localStorage.getItem('eli_notion_api_key') || '')
  const [tailvyKey, setTailvyKey] = useState(localStorage.getItem('eli_tailvy_api_key') || '')

  const [isSecurityUnlocked, setIsSecurityUnlocked] = useState(false)
  const [hasVaultPin, setHasVaultPin] = useState(true)
  const [authPin, setAuthPin] = useState('')
  const [authError, setAuthError] = useState(false)

  const [newPin, setNewPin] = useState('')
  const [faceCount, setFaceCount] = useState(0)

  const [isScanningFace, setIsScanningFace] = useState(false)
  const [enrollStatus, setEnrollStatus] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)

  const [savedKeys, setSavedKeys] = useState(false)
  const [savedPersonality, setSavedPersonality] = useState(false)
  const [savedUser, setSavedUser] = useState(false)
  const [savedPin, setSavedPin] = useState(false)
  const addToast = useToastStore((s) => s.addToast)

  useEffect(() => {
    if (window.electron?.ipcRenderer) {
      window.electron.ipcRenderer.invoke('get-personality').then((res) => {
        if (res) setPersonality(res)
      })
      window.electron.ipcRenderer
        .invoke('secure-get-keys')
        .then((keys) => {
          if (!keys) return
          if (typeof keys.geminiKey === 'string') setGeminiKey(keys.geminiKey)
          if (typeof keys.groqKey === 'string') setGroqKey(keys.groqKey)
          if (typeof keys.hfKey === 'string') setHfKey(keys.hfKey)
          if (typeof keys.notionKey === 'string') setNotionKey(keys.notionKey)
          if (typeof keys.tavilyKey === 'string') setTailvyKey(keys.tavilyKey)
        })
        .catch(() => {})
      window.electron.ipcRenderer
        .invoke('check-vault-status')
        .then((res) => {
          const hasPin = !!res?.hasPin
          setFaceCount(res?.faceCount || 0)
          setHasVaultPin(hasPin)
          if (!hasPin) {
            // First-time setup: allow user to create the initial PIN directly.
            setIsSecurityUnlocked(true)
          }
        })
    }
  }, [])

  const handleVoiceChange = (v: 'MALE' | 'FEMALE') => {
    setVoice(v)
    localStorage.setItem('eli_voice_profile', v)
  }

  const handlePersonalityChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value
    const words = text.trim().split(/\s+/).filter((w) => w.length > 0)
    if (words.length <= 150) setPersonality(text)
  }

  const savePersonality = async () => {
    if (window.electron?.ipcRenderer) {
      await window.electron.ipcRenderer.invoke('set-personality', personality)
      setSavedPersonality(true)
      setTimeout(() => setSavedPersonality(false), 2000)
    }
  }

  const saveUserName = () => {
    localStorage.setItem('eli_user_name', userName)
    setSavedUser(true)
    setTimeout(() => setSavedUser(false), 2000)
  }

  const saveApiKeys = async () => {
    if (window.electron?.ipcRenderer) {
      try {
        await window.electron.ipcRenderer.invoke('secure-save-keys', {
          groqKey,
          geminiKey,
          hfKey,
          notionKey,
          tavilyKey: tailvyKey
        })
      } catch (e) {}
    }
    setSavedKeys(true)
    setTimeout(() => setSavedKeys(false), 2000)
  }

  const currentWordCount = personality.trim().split(/\s+/).filter((w) => w.length > 0).length
  const wordProgress = Math.min((currentWordCount / 150) * 100, 100)

  const unlockSecurityModule = async () => {
    if (!window.electron?.ipcRenderer) return
    if (!hasVaultPin) {
      setIsSecurityUnlocked(true)
      addToast('No PIN configured yet. Create a new 4-digit master PIN below.', 'info')
      return
    }
    if (authPin.length !== 4) {
      setAuthError(true)
      addToast('Enter your 4-digit master PIN to unlock Security settings.', 'error')
      setTimeout(() => setAuthError(false), 1000)
      return
    }

    const isValid = await window.electron.ipcRenderer.invoke('verify-vault-pin', authPin)
    if (isValid) {
      setIsSecurityUnlocked(true)
      setAuthPin('')
      addToast('Security module unlocked.', 'success')
    } else {
      setAuthError(true)
      addToast('Invalid PIN. Try again.', 'error')
      setTimeout(() => setAuthError(false), 1000)
    }
  }

  const updateMasterPin = async () => {
    if (!window.electron?.ipcRenderer) return
    if (newPin.length !== 4) {
      addToast('PIN must be exactly 4 digits.', 'error')
      return
    }

    await window.electron.ipcRenderer.invoke('setup-vault-pin', newPin)
    setNewPin('')
    setHasVaultPin(true)
    setIsSecurityUnlocked(true)
    setSavedPin(true)
    addToast('Master PIN saved successfully.', 'success')
    setTimeout(() => setSavedPin(false), 2000)
  }

  const startFaceEnrollment = async () => {
    setIsScanningFace(true)
    setEnrollStatus('INITIALIZING CAMERA...')
    try {
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri('/models'),
        faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
        faceapi.nets.faceRecognitionNet.loadFromUri('/models')
      ])
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        setEnrollStatus('POSITION FACE IN FRAME')
        const scanInterval = setInterval(async () => {
          if (!videoRef.current || videoRef.current.readyState !== 4) return
          const detection = await faceapi
            .detectSingleFace(videoRef.current)
            .withFaceLandmarks()
            .withFaceDescriptor()
          if (detection) {
            clearInterval(scanInterval)
            setEnrollStatus('ENCRYPTING BIOMETRICS...')
            const descriptorArray = Array.from(detection.descriptor)
            if (window.electron?.ipcRenderer) {
              await window.electron.ipcRenderer.invoke('setup-vault-face', descriptorArray)
            }
            stream.getTracks().forEach((t) => t.stop())
            setIsScanningFace(false)
            setFaceCount((prev) => prev + 1)
            addToast('New biometric identity saved.', 'success')
          }
        }, 1000)
      }
    } catch (e) {
      setEnrollStatus('CAMERA ERROR')
      setTimeout(() => setIsScanningFace(false), 2000)
    }
  }

  /* ─── Shared style tokens ─── */
  const cardClass =
    'bg-[#0d0d14] border border-white/[0.06] p-6 rounded-2xl flex flex-col gap-5 hover:border-white/[0.10] transition-all duration-200'

  const inputWrapClass =
    'flex items-center bg-[#040407] border border-white/[0.07] rounded-xl px-4 py-3 focus-within:border-violet-500/40 focus-within:shadow-[0_0_0_3px_rgba(124,58,237,0.08)] transition-all duration-200 w-full'

  const labelClass = 'text-[10px] text-zinc-500 font-mono tracking-widest uppercase flex items-center gap-2'
  const titleClass = 'text-sm font-semibold text-white flex items-center gap-2'

  return (
    <div className="flex-1 px-6 md:px-10 lg:px-16 py-8 flex flex-col items-center bg-[#040407] min-h-screen text-zinc-100 overflow-y-auto scrollbar-small">
      <motion.div
        className="w-full max-w-4xl flex flex-col gap-8"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        {/* ── Header ── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-white/[0.06] pb-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-600/20 to-violet-900/10 border border-violet-500/20 flex items-center justify-center shadow-[0_0_24px_rgba(124,58,237,0.12)]">
              <GiArtificialIntelligence size={28} className="text-violet-400" />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-white">Command Center</h2>
              <p className="text-xs text-zinc-500 font-mono mt-1 tracking-widest flex items-center gap-2 uppercase">
                <RiRecordCircleLine
                  className={`${isSystemActive ? 'text-violet-500 animate-pulse' : 'text-zinc-700'}`}
                  size={12}
                />
                {isSystemActive ? 'System Online' : 'System Offline'}
              </p>
            </div>
          </div>

          {/* Tab Switcher */}
          <div className="flex bg-white/[0.03] p-1 rounded-xl border border-white/[0.05] w-full md:w-fit shadow-inner">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2.5 text-[11px] font-semibold tracking-wide rounded-lg transition-all duration-200 ${
                  activeTab === tab.id
                    ? 'bg-violet-600/15 text-violet-300 border border-violet-500/20 shadow-[0_0_16px_rgba(124,58,237,0.08)]'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]'
                }`}
              >
                <span className={activeTab === tab.id ? 'text-violet-400' : 'text-zinc-600'}>
                  {tab.icon}
                </span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Tab Content ── */}
        <div className="relative min-h-[520px] pb-12">
          <AnimatePresence mode="wait">
            {/* ── GENERAL TAB ── */}
            {activeTab === 'general' && (
              <motion.div
                key="general"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
                className="grid grid-cols-1 md:grid-cols-2 gap-5 absolute w-full"
              >
                {/* Personality Matrix */}
                <div className={`${cardClass} md:col-span-2`}>
                  <div className="flex justify-between items-start">
                    <span className={titleClass}>
                      <RiUserLine size={16} className="text-violet-400" /> AI Personality Matrix
                    </span>
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col items-end gap-1">
                        <span className={`text-[10px] font-mono tracking-widest ${currentWordCount >= 150 ? 'text-red-400' : 'text-zinc-500'}`}>
                          {currentWordCount} / 150
                        </span>
                        <div className="w-20 h-1 bg-white/[0.05] rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${wordProgress > 90 ? 'bg-red-500' : 'bg-violet-500'}`}
                            style={{ width: `${wordProgress}%` }}
                          />
                        </div>
                      </div>
                      <button
                        onClick={savePersonality}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold transition-all duration-200 border ${
                          savedPersonality
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                            : 'bg-white/[0.04] border-white/[0.07] text-zinc-400 hover:text-white hover:bg-white/[0.08]'
                        }`}
                      >
                        {savedPersonality ? <RiCheckLine size={14} /> : <RiSave3Line size={14} />}
                        {savedPersonality ? 'Saved' : 'Save'}
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={personality}
                    onChange={handlePersonalityChange}
                    placeholder="Define who ELI is. Example: 'You are a sassy, highly technical assistant...'"
                    className="bg-[#040407] border border-white/[0.07] rounded-xl p-4 text-sm text-zinc-200 h-32 resize-none focus:border-violet-500/40 focus:shadow-[0_0_0_3px_rgba(124,58,237,0.08)] outline-none transition-all duration-200 scrollbar-small placeholder:text-zinc-700"
                  />
                </div>

                {/* User Designation */}
                <div className={cardClass}>
                  <span className={titleClass}>
                    <RiUserLine size={16} className="text-violet-400" /> User Designation
                  </span>
                  <div className={inputWrapClass}>
                    <input
                      type="text"
                      value={userName}
                      onChange={(e) => setUserName(e.target.value)}
                      placeholder="Enter operator name..."
                      className="bg-transparent border-none outline-none text-sm text-zinc-100 w-full placeholder:text-zinc-700 font-medium"
                    />
                    <button
                      onClick={saveUserName}
                      className={`ml-3 p-1.5 rounded-lg transition-all duration-200 ${savedUser ? 'text-emerald-400 bg-emerald-500/10' : 'text-zinc-600 hover:text-white hover:bg-white/[0.08]'}`}
                    >
                      {savedUser ? <RiCheckLine size={16} /> : <RiSave3Line size={16} />}
                    </button>
                  </div>
                </div>

                {/* Voice Profile */}
                <div className={`${cardClass} relative`}>
                  <div className="flex justify-between items-center">
                    <span className={titleClass}>
                      <RiUserVoiceLine size={16} className="text-violet-400" /> Voice Profile
                    </span>
                  </div>
                  <div className="flex gap-2.5 h-11">
                    {(['FEMALE', 'MALE'] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => handleVoiceChange(s)}
                        className={`cursor-pointer flex-1 flex items-center justify-center text-[12px] font-semibold rounded-xl transition-all tracking-widest border ${
                          voice === s
                            ? 'bg-violet-600/15 text-violet-300 border-violet-500/30 shadow-[0_0_16px_rgba(124,58,237,0.1)]'
                            : 'bg-[#040407] border-white/[0.07] text-zinc-500 hover:text-zinc-300 hover:border-white/[0.15]'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── API KEYS TAB ── */}
            {activeTab === 'keys' && (
              <motion.div
                key="keys"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
                className="absolute w-full"
              >
                <div className={`${cardClass} gap-6`}>
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/[0.06] pb-4">
                    <span className={titleClass}>
                      <RiKey2Line size={16} className="text-violet-400" /> External API Endpoints
                    </span>
                    <button
                      onClick={saveApiKeys}
                      className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-[11px] font-semibold tracking-wide transition-all duration-200 border cursor-pointer ${
                        savedKeys
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                          : 'bg-violet-600/15 border-violet-500/25 text-violet-300 hover:bg-violet-600/25 hover:border-violet-500/40'
                      }`}
                    >
                      {savedKeys ? <RiCheckLine size={15} /> : <RiSave3Line size={15} />}
                      {savedKeys ? 'Saved' : 'Save All Keys'}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {[
                      { label: 'Gemini Pro Core', icon: <RiBrainLine size={13} />, val: geminiKey, set: setGeminiKey, ph: 'AIzaSy_...' },
                      { label: 'Groq Fast Inferencing', icon: <RiCpuLine size={13} />, val: groqKey, set: setGroqKey, ph: 'gsk_...' },
                      { label: 'Hugging Face Vision', icon: <RiCloudLine size={13} />, val: hfKey, set: setHfKey, ph: 'hf_...' },
                      { label: 'Notion Integrations', icon: <RiDatabase2Line size={13} />, val: notionKey, set: setNotionKey, ph: 'secret_...' }
                    ].map(({ label, icon, val, set, ph }) => (
                      <div key={label} className="flex flex-col gap-2">
                        <label className={labelClass}>
                          {icon} {label}
                        </label>
                        <div className={inputWrapClass}>
                          <input
                            type="password"
                            value={val}
                            onChange={(e) => set(e.target.value)}
                            placeholder={ph}
                            className="bg-transparent border-none outline-none text-sm font-mono text-zinc-200 w-full placeholder:text-zinc-700 tracking-wider"
                          />
                        </div>
                      </div>
                    ))}

                    <div className="flex flex-col gap-2 md:col-span-2">
                      <label className={labelClass}>
                        <RiPlugLine size={13} /> Tailvy Builder Agent
                      </label>
                      <div className={inputWrapClass}>
                        <input
                          type="password"
                          value={tailvyKey}
                          onChange={(e) => setTailvyKey(e.target.value)}
                          placeholder="tlv_..."
                          className="bg-transparent border-none outline-none text-sm font-mono text-zinc-200 w-full placeholder:text-zinc-700 tracking-wider"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Security Notice */}
                  <div className="bg-[#040407] border border-white/[0.05] p-4 rounded-xl flex items-start gap-3">
                    <RiShieldKeyholeLine className="text-zinc-600 shrink-0 mt-0.5" size={15} />
                    <p className="text-[10px] text-zinc-500 font-mono leading-relaxed">
                      All API keys are encrypted locally in your OS keychain. ELI never transmits keys to
                      any centralized server. You maintain full ownership and billing control.
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── SECURITY TAB ── */}
            {activeTab === 'security' && (
              <motion.div
                key="security"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
                className="w-full rounded-2xl overflow-hidden shadow-2xl border border-white/[0.06] absolute"
              >
                <AnimatePresence>
                  {!isSecurityUnlocked && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 z-20 backdrop-blur-2xl bg-black/75 border border-white/[0.07] rounded-2xl flex flex-col items-center justify-center gap-6"
                    >
                      <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center shadow-[0_0_40px_rgba(255,255,255,0.04)]">
                        <RiLockPasswordLine size={32} className="text-zinc-300" />
                      </div>
                      <p className="text-[11px] text-zinc-400 font-mono tracking-widest uppercase font-semibold">
                        {hasVaultPin ? 'Authenticate to access vault' : 'Initialize your security vault'}
                      </p>
                      <div className="flex gap-3 items-center h-11">
                        <input
                          type="password"
                          maxLength={4}
                          pattern="\d*"
                          inputMode="numeric"
                          value={authPin}
                          onChange={(e) => setAuthPin(e.target.value.replace(/\D/g, ''))}
                          onKeyDown={(e) => e.key === 'Enter' && unlockSecurityModule()}
                          disabled={!hasVaultPin}
                          placeholder={hasVaultPin ? 'PIN' : 'SETUP'}
                          className={`h-full bg-[#040407] border w-28 rounded-xl text-center text-xl tracking-[0.5em] text-white outline-none transition-all duration-200 ${
                            authError
                              ? 'border-red-500/60 text-red-400 bg-red-500/8 shadow-[0_0_0_3px_rgba(239,68,68,0.1)]'
                              : 'border-white/[0.12] focus:border-violet-500/50 focus:shadow-[0_0_0_3px_rgba(124,58,237,0.1)]'
                          } ${!hasVaultPin ? 'opacity-40 cursor-not-allowed' : ''}`}
                        />
                        <button
                          onClick={unlockSecurityModule}
                          className="h-full px-6 bg-violet-600/15 text-violet-300 text-[11px] font-semibold tracking-widest rounded-xl hover:bg-violet-600/25 border border-violet-500/25 transition-all duration-200 cursor-pointer"
                        >
                          {hasVaultPin ? 'UNLOCK' : 'CONTINUE'}
                        </button>
                      </div>
                      {!hasVaultPin && (
                        <p className="text-[10px] text-zinc-500 font-mono tracking-wider uppercase">
                          No master PIN found. Create one below to secure this device.
                        </p>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 bg-[#09090e] p-6 rounded-2xl border border-white/[0.05]">
                  {/* PIN Update */}
                  <div className="bg-[#0d0d14] border border-white/[0.06] p-6 rounded-2xl flex flex-col gap-5">
                    <span className={titleClass}>
                      <RiLockPasswordLine size={16} className="text-violet-400" /> {hasVaultPin ? 'Update Master PIN' : 'Create Master PIN'}
                    </span>
                    <div className={inputWrapClass}>
                      <input
                        type="password"
                        maxLength={4}
                        pattern="\d*"
                        inputMode="numeric"
                        value={newPin}
                        onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                        onKeyDown={(e) => e.key === 'Enter' && updateMasterPin()}
                        placeholder="New 4-digit PIN"
                        className="bg-transparent border-none outline-none text-sm font-mono text-zinc-100 w-full tracking-[0.3em] placeholder:tracking-normal"
                      />
                      <button
                        onClick={updateMasterPin}
                        disabled={newPin.length !== 4}
                        className={`ml-3 p-1.5 rounded-lg transition-all duration-200 ${savedPin ? 'text-emerald-400 bg-emerald-500/10' : 'text-zinc-600 hover:text-white hover:bg-white/[0.08]'} disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer`}
                      >
                        {savedPin ? <RiCheckLine size={16} /> : <RiSave3Line size={16} />}
                      </button>
                    </div>
                    <p className="text-[10px] text-zinc-500 font-mono tracking-wider uppercase">
                      Use exactly 4 numeric digits.
                    </p>
                  </div>

                  {/* Biometric Registry */}
                  <div className="bg-[#0d0d14] border border-white/[0.06] p-6 rounded-2xl flex flex-col gap-5">
                    <div className="flex justify-between items-center border-b border-white/[0.05] pb-4">
                      <span className={titleClass}>
                        <RiScan2Line size={16} className="text-violet-400" /> Biometric Registry
                      </span>
                      <span className="text-[10px] text-violet-300 font-mono tracking-widest bg-violet-500/10 px-3 py-1 rounded-full border border-violet-500/20">
                        {faceCount} ENROLLED
                      </span>
                    </div>

                    {isScanningFace ? (
                      <div className="flex items-center gap-4 bg-[#040407] p-3 rounded-xl border border-white/[0.07]">
                        <video
                          ref={videoRef}
                          autoPlay
                          muted
                          playsInline
                          className="w-14 h-14 rounded-lg object-cover -scale-x-100 border border-white/[0.08]"
                        />
                        <div className="flex flex-col gap-1">
                          <span className="text-[11px] text-violet-300 font-mono tracking-widest animate-pulse font-bold">
                            {enrollStatus}
                          </span>
                          <span className="text-xs text-zinc-500">Keep head steady...</span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-4 h-full justify-between">
                        <p className="text-xs text-zinc-500 leading-relaxed">
                          Enroll face descriptors encrypted and stored locally on device.
                        </p>
                        <button
                          onClick={startFaceEnrollment}
                          className="w-full py-3 rounded-xl bg-violet-600/15 text-violet-300 font-semibold tracking-wide text-[12px] flex items-center justify-center gap-2 hover:bg-violet-600/25 border border-violet-500/25 hover:border-violet-500/40 transition-all duration-200 mt-auto cursor-pointer"
                        >
                          <RiAddLine size={16} /> Enroll New Identity
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  )
}

export default SettingsView
