import { useToastStore } from '@renderer/store/toast-store'

const toneClasses: Record<string, string> = {
  info: 'border-violet-500/35 bg-violet-500/12 text-violet-200',
  success: 'border-emerald-500/35 bg-emerald-500/12 text-emerald-200',
  error: 'border-red-500/35 bg-red-500/12 text-red-200'
}

export default function ToastHost() {
  const toasts = useToastStore((s) => s.toasts)
  const removeToast = useToastStore((s) => s.removeToast)

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[2000] flex w-[min(92vw,420px)] flex-col gap-2">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          onClick={() => removeToast(toast.id)}
          className={`pointer-events-auto rounded-xl border px-4 py-3 text-left text-[12px] font-medium shadow-xl backdrop-blur-md transition-all duration-200 hover:translate-y-[-1px] ${
            toneClasses[toast.type] || toneClasses.info
          }`}
        >
          {toast.message}
        </button>
      ))}
    </div>
  )
}

