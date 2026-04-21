import { useState, useEffect, useRef, useCallback } from 'react'
import {
  RiAppsLine,
  RiTerminalBoxLine,
  RiChromeLine,
  RiCodeLine,
  RiSpotifyLine,
  RiDiscordLine,
  RiGamepadLine
} from 'react-icons/ri'
import { getAllApps, AppItem } from '@renderer/services/system-info'

const SmartIcon = ({ name }: { name: string }) => {
  if (!name) return <div className="w-9 h-9 bg-white/[0.03] rounded-xl border border-white/[0.06]" />

  const lower = name.toLowerCase()
  let icon = <RiTerminalBoxLine size={17} />
  let color = 'text-zinc-400'
  let bg = 'bg-white/[0.03]'
  let border = 'border-white/[0.06]'

  if (lower.includes('chrome') || lower.includes('edge')) {
    icon = <RiChromeLine size={17} />
    color = 'text-blue-400'
    bg = 'bg-blue-500/8'
    border = 'border-blue-500/15'
  } else if (lower.includes('code') || lower.includes('dev')) {
    icon = <RiCodeLine size={17} />
    color = 'text-cyan-400'
    bg = 'bg-cyan-500/8'
    border = 'border-cyan-500/15'
  } else if (lower.includes('spotify') || lower.includes('music')) {
    icon = <RiSpotifyLine size={17} />
    color = 'text-emerald-400'
    bg = 'bg-emerald-500/8'
    border = 'border-emerald-500/15'
  } else if (lower.includes('discord') || lower.includes('telegram')) {
    icon = <RiDiscordLine size={17} />
    color = 'text-indigo-400'
    bg = 'bg-indigo-500/8'
    border = 'border-indigo-500/15'
  } else if (lower.includes('game') || lower.includes('launcher')) {
    icon = <RiGamepadLine size={17} />
    color = 'text-violet-400'
    bg = 'bg-violet-500/8'
    border = 'border-violet-500/15'
  }

  return (
    <div
      className={`w-9 h-9 rounded-xl flex items-center justify-center border ${bg} ${border} ${color} group-hover:scale-110 transition-transform duration-200 shrink-0`}
    >
      {icon}
    </div>
  )
}

const AppCard = ({ app }: { app: AppItem }) => (
  <div
    onClick={() => window.electron.ipcRenderer.invoke('open-app', app.name)}
    className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-3 flex items-center gap-3 hover:bg-violet-500/[0.05] hover:border-violet-500/20 hover:shadow-[0_0_16px_rgba(124,58,237,0.08)] transition-all duration-200 cursor-pointer group active:scale-[0.98]"
  >
    <SmartIcon name={app.name} />
    <div className="flex-1 overflow-hidden min-w-0">
      <div className="text-[12px] font-semibold text-zinc-300 truncate group-hover:text-violet-200 transition-colors leading-tight">
        {app.name}
      </div>
      <div className="text-[9px] text-zinc-700 font-mono mt-0.5 group-hover:text-zinc-500 transition-colors">
        INSTALLED
      </div>
    </div>
  </div>
)

const AppCardSkeleton = () => (
  <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-3 flex items-center gap-3">
    <div className="w-9 h-9 rounded-xl skeleton shrink-0" />
    <div className="flex flex-col gap-1.5 flex-1">
      <div className="h-3 w-24 skeleton rounded-md" />
      <div className="h-2 w-14 skeleton rounded-sm" />
    </div>
  </div>
)

const AppsView = () => {
  const [allApps, setAllApps] = useState<AppItem[]>([])
  const [visibleApps, setVisibleApps] = useState<AppItem[]>([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  const observer = useRef<IntersectionObserver | null>(null)
  const lastAppElementRef = useCallback(
    (node: HTMLDivElement) => {
      if (loading) return
      if (observer.current) observer.current.disconnect()
      observer.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && visibleApps.length < allApps.length) {
          setPage((prev) => prev + 1)
        }
      })
      if (node) observer.current.observe(node)
    },
    [loading, visibleApps.length, allApps.length]
  )

  useEffect(() => {
    getAllApps().then((raw) => {
      const cleanData = (Array.isArray(raw) ? raw : []).filter(
        (item) => item && typeof item === 'object' && item.name && item.id
      )
      setAllApps(cleanData)
      setVisibleApps(cleanData.slice(0, 15))
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (page > 1) {
      const nextBatch = allApps.slice(0, page * 12 + 6)
      setVisibleApps(nextBatch)
    }
  }, [page, allApps])

  return (
    <div className="flex-1 bg-[#040407] p-6 h-full flex flex-col animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-violet-600/10 border border-violet-500/20 flex items-center justify-center">
            <RiAppsLine className="text-violet-400" size={18} />
          </div>
          <div>
            <h2 className="text-[13px] font-semibold text-zinc-200 tracking-tight">System Applications</h2>
            <p className="text-[9px] text-zinc-600 font-mono mt-0.5 tracking-widest">INDEXED SOFTWARE LIBRARY</p>
          </div>
        </div>
        <div className="text-[10px] font-mono text-violet-400/70 bg-violet-500/[0.06] px-3 py-1.5 rounded-full border border-violet-500/15">
          {loading ? 'INDEXING...' : `${allApps.length} FOUND`}
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto scrollbar-small pr-1 min-h-0">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
          {loading
            ? Array.from({ length: 12 }).map((_, i) => <AppCardSkeleton key={i} />)
            : visibleApps.map((app, index) => {
                const safeKey = `${app.id}-${index}`
                if (visibleApps.length === index + 1) {
                  return (
                    <div ref={lastAppElementRef} key={safeKey}>
                      <AppCard app={app} />
                    </div>
                  )
                } else {
                  return <AppCard key={safeKey} app={app} />
                }
              })}

          {!loading && visibleApps.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center py-20 text-zinc-700 gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/[0.02] border border-white/[0.04] flex items-center justify-center">
                <RiAppsLine size={22} className="opacity-20" />
              </div>
              <p className="text-[11px] font-mono tracking-widest">NO APPS FOUND</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default AppsView
