import { useState, useEffect } from 'react'
import { RiSubtractLine, RiCloseLine, RiCheckboxBlankLine, RiCheckboxMultipleBlankLine } from 'react-icons/ri'

const TitleBar = () => {
  const [isMaximized, setIsMaximized] = useState(false)
  const [isMac, setIsMac] = useState(false)

  useEffect(() => {
    if (window.electron && window.electron.process) {
      setIsMac(window.electron.process.platform === 'darwin')
    } else {
      setIsMac(navigator.userAgent.toLowerCase().includes('mac'))
    }
  }, [])

  const minimize = () => window.electron.ipcRenderer.send('window-min')
  const toggleMaximize = () => {
    setIsMaximized(!isMaximized)
    window.electron.ipcRenderer.send('window-max')
  }
  const close = () => window.electron.ipcRenderer.send('window-close')

  return (
    <div className="w-full h-8 flex items-center justify-between px-3 bg-zinc-950/90 border-b border-white/[0.05] drag-region select-none z-[1000] relative">
      {/* macOS traffic lights */}
      {isMac && (
        <div className="flex items-center gap-1.5 no-drag z-50">
          <button
            onClick={close}
            className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-400 border border-red-600/50 flex items-center justify-center group transition-colors"
          >
            <span className="hidden group-hover:block text-[7px] text-red-900 font-bold leading-none">×</span>
          </button>
          <button
            onClick={minimize}
            className="w-3 h-3 rounded-full bg-yellow-500 hover:bg-yellow-400 border border-yellow-600/50 flex items-center justify-center group transition-colors"
          >
            <span className="hidden group-hover:block text-[7px] text-yellow-900 font-bold leading-none">−</span>
          </button>
          <button
            onClick={toggleMaximize}
            className="w-3 h-3 rounded-full bg-[#6b21a8] hover:bg-violet-500 border border-purple-700/50 flex items-center justify-center group transition-colors"
          >
            <span className="hidden group-hover:block text-[6px] text-purple-100 font-bold leading-none">↗</span>
          </button>
        </div>
      )}

      {/* Center branding */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-2 pointer-events-none">
        <div className="relative">
          <div className="w-1.5 h-1.5 rounded-full bg-violet-500 shadow-[0_0_6px_rgba(139,92,246,0.8)]" />
        </div>
        <span className="text-[10px] font-semibold text-zinc-400 tracking-[0.25em] uppercase">
          ELI OS
        </span>
        <span className="text-[8px] text-zinc-700 font-mono tracking-widest">
          // {isMac ? 'MAC' : 'WIN'}
        </span>
      </div>

      {/* Windows controls */}
      {!isMac && (
        <div className="flex h-full no-drag ml-auto -mr-3 z-50">
          <button
            onClick={minimize}
            className="w-11 h-full flex items-center justify-center text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-300 transition-all duration-150"
          >
            <RiSubtractLine size={15} />
          </button>
          <button
            onClick={toggleMaximize}
            className="w-11 h-full flex items-center justify-center text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-300 transition-all duration-150"
          >
            {isMaximized ? <RiCheckboxMultipleBlankLine size={13} /> : <RiCheckboxBlankLine size={13} />}
          </button>
          <button
            onClick={close}
            className="w-11 h-full flex items-center justify-center text-zinc-500 hover:bg-red-600 hover:text-white transition-all duration-150"
          >
            <RiCloseLine size={16} />
          </button>
        </div>
      )}
    </div>
  )
}

export default TitleBar
