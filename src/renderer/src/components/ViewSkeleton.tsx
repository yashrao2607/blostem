import { RiLoader4Line } from 'react-icons/ri'

const ViewSkeleton = () => {
  return (
    <div className="w-full h-full p-5 animate-in fade-in duration-300">
      <div className="w-full h-full bg-[#09090e]/80 backdrop-blur-xl border border-white/[0.05] rounded-2xl shadow-xl p-6 flex flex-col gap-6 relative overflow-hidden">
        {/* Shimmer sweep */}
        <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/[0.03] to-transparent z-10 pointer-events-none" />

        {/* Header skeleton */}
        <div className="flex items-center gap-4 border-b border-white/[0.05] pb-5">
          <div className="w-11 h-11 rounded-xl skeleton" />
          <div className="flex flex-col gap-2.5">
            <div className="w-44 h-4 skeleton rounded-lg" />
            <div className="w-24 h-2.5 skeleton rounded-md" />
          </div>
        </div>

        {/* Content skeleton */}
        <div className="grid grid-cols-2 gap-4 flex-1">
          <div className="skeleton rounded-xl opacity-40" />
          <div className="flex flex-col gap-4">
            <div className="skeleton rounded-xl h-28 opacity-40" />
            <div className="skeleton rounded-xl flex-1 opacity-25" />
          </div>
        </div>

        {/* Loading indicator */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 text-violet-500/40 pointer-events-none">
          <RiLoader4Line className="animate-spin text-3xl" />
          <span className="text-[9px] tracking-[0.3em] font-mono text-violet-400/30">INITIALIZING MODULE...</span>
        </div>
      </div>
    </div>
  )
}

export default ViewSkeleton
