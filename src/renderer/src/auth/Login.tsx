import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Cpu, ShieldCheck, Mail, Lock, User } from 'lucide-react'
import { FcGoogle } from 'react-icons/fc'
import {
  consumeAuthFlashMessage,
  startGoogleOAuth,
  signInWithEmail,
  signUpWithEmail
} from '@renderer/services/cloud-auth'
import { useAuthStore } from '@renderer/store/auth-store'
import { useNavigate } from 'react-router-dom'

type Tab = 'signin' | 'signup'

export default function LoginPage() {
  const navigate = useNavigate()
  const setAccessToken = useAuthStore((s) => s.setAccessToken)

  const [tab, setTab] = useState<Tab>('signin')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null)

  // Sign-in fields
  const [siEmail, setSiEmail] = useState('')
  const [siPassword, setSiPassword] = useState('')

  // Sign-up fields
  const [suName, setSuName] = useState('')
  const [suEmail, setSuEmail] = useState('')
  const [suPassword, setSuPassword] = useState('')
  const [suConfirm, setSuConfirm] = useState('')

  useEffect(() => {
    const flashMessage = consumeAuthFlashMessage()
    if (flashMessage) {
      setMessage(flashMessage)
    }
  }, [])

  const handleGoogleAuth = async (mode: Tab) => {
    setMessage(null)
    setLoading(true)

    try {
      await startGoogleOAuth(mode)
      setMessage({
        type: 'success',
        text:
          mode === 'signup'
            ? 'Continue in your browser to create your Google-linked account.'
            : 'Continue in your browser to finish Google sign-in.'
      })
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || 'Google sign-in failed.' })
    } finally {
      setLoading(false)
    }
  }

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)
    setLoading(true)
    try {
      const token = await signInWithEmail(siEmail.trim(), siPassword)
      setAccessToken(token)
      navigate('/')
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Sign-in failed.' })
    } finally {
      setLoading(false)
    }
  }

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)
    if (suPassword !== suConfirm) {
      setMessage({ type: 'error', text: 'Passwords do not match.' })
      return
    }
    if (suPassword.length < 6) {
      setMessage({ type: 'error', text: 'Password must be at least 6 characters.' })
      return
    }
    setLoading(true)
    try {
      const result = await signUpWithEmail(suEmail.trim(), suPassword, suName.trim())
      if (result.status === 'authenticated') {
        setAccessToken(result.token)
        navigate('/')
        return
      }

      setMessage({ type: 'success', text: result.message })
      setSuName('')
      setSuEmail('')
      setSuPassword('')
      setSuConfirm('')
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Sign-up failed.' })
    } finally {
      setLoading(false)
    }
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.2 } }
  }

  const itemVariants: any = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
  }

  const inputClass =
    'w-full bg-[#111] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#6b21a8]/60 transition-colors'

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans flex items-center justify-center p-6 relative overflow-hidden selection:bg-[#6b21a8] selection:text-black">
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-[#6b21a8]/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-[#044a33]/30 blur-[120px] rounded-full pointer-events-none" />

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="w-full max-w-md relative z-10"
      >
        <motion.div variants={itemVariants} className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#6b21a8]/10 border border-[#6b21a8]/30 shadow-[0_0_20px_rgba(107,33,168,0.2)] mb-6">
            <Cpu className="w-8 h-8 text-[#6b21a8]" />
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tighter mb-2">
            Authenticate{' '}
            <span className="text-transparent bg-clip-text bg-linear-to-r from-[#6b21a8] to-purple-200">
              ELI
            </span>
          </h1>
          <p className="text-gray-400 text-sm font-mono tracking-widest uppercase">
            Initialize secure neural link
          </p>
        </motion.div>

        <motion.div
          variants={itemVariants}
          className="bg-[#0a0a0a] border border-white/10 rounded-4xl p-8 shadow-2xl relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-linear-to-r from-transparent via-[#6b21a8]/50 to-transparent opacity-50" />

          {/* Tabs */}
          <div className="flex rounded-xl bg-[#111] p-1 mb-6">
            {(['signin', 'signup'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setMessage(null) }}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                  tab === t
                    ? 'bg-[#6b21a8] text-white shadow'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {t === 'signin' ? 'Sign In' : 'Sign Up'}
              </button>
            ))}
          </div>

          {/* Feedback message */}
          <AnimatePresence>
            {message && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`mb-4 p-3 rounded-xl text-xs font-mono leading-relaxed border ${
                  message.type === 'error'
                    ? 'bg-red-500/10 border-red-500/30 text-red-300'
                    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                }`}
              >
                {message.text}
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            {tab === 'signin' ? (
              <motion.form
                key="signin"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                transition={{ duration: 0.18 }}
                onSubmit={handleEmailSignIn}
                className="flex flex-col gap-3"
              >
                <div className="relative">
                  <Mail className="absolute left-3 top-3.5 w-4 h-4 text-gray-500" />
                  <input
                    type="email"
                    placeholder="Email"
                    value={siEmail}
                    onChange={(e) => setSiEmail(e.target.value)}
                    required
                    className={`${inputClass} pl-10`}
                  />
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-3.5 w-4 h-4 text-gray-500" />
                  <input
                    type="password"
                    placeholder="Password"
                    value={siPassword}
                    onChange={(e) => setSiPassword(e.target.value)}
                    required
                    className={`${inputClass} pl-10`}
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="cursor-pointer w-full py-3 rounded-xl bg-[#6b21a8] hover:bg-[#7c3aed] transition-colors text-white font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed mt-1"
                >
                  {loading ? 'Signing in…' : 'Sign In'}
                </button>

                <div className="flex items-center gap-3 my-1">
                  <div className="flex-1 h-px bg-white/10" />
                  <span className="text-gray-600 text-xs">or</span>
                  <div className="flex-1 h-px bg-white/10" />
                </div>

                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleGoogleAuth('signin')}
                  className="cursor-pointer flex w-full items-center justify-center gap-3 py-3 px-4 rounded-xl bg-white text-black hover:bg-gray-100 transition-all font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FcGoogle className="w-5 h-5" />
                  Continue with Google
                </button>
              </motion.form>
            ) : (
              <motion.form
                key="signup"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.18 }}
                onSubmit={handleEmailSignUp}
                className="flex flex-col gap-3"
              >
                <div className="mb-2 p-3 rounded-xl bg-[#6b21a8]/5 border border-[#6b21a8]/20 flex items-start gap-3">
                  <ShieldCheck className="w-4 h-4 text-[#6b21a8] shrink-0 mt-0.5" />
                  <p className="text-xs text-gray-400 font-mono leading-relaxed">
                    Create an account with email or Google. If Supabase email confirmation is enabled, verify your email once and then sign in.
                  </p>
                </div>
                <div className="relative">
                  <User className="absolute left-3 top-3.5 w-4 h-4 text-gray-500" />
                  <input
                    type="text"
                    placeholder="Full name"
                    value={suName}
                    onChange={(e) => setSuName(e.target.value)}
                    required
                    className={`${inputClass} pl-10`}
                  />
                </div>
                <div className="relative">
                  <Mail className="absolute left-3 top-3.5 w-4 h-4 text-gray-500" />
                  <input
                    type="email"
                    placeholder="Email"
                    value={suEmail}
                    onChange={(e) => setSuEmail(e.target.value)}
                    required
                    className={`${inputClass} pl-10`}
                  />
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-3.5 w-4 h-4 text-gray-500" />
                  <input
                    type="password"
                    placeholder="Password (min 6 chars)"
                    value={suPassword}
                    onChange={(e) => setSuPassword(e.target.value)}
                    required
                    className={`${inputClass} pl-10`}
                  />
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-3.5 w-4 h-4 text-gray-500" />
                  <input
                    type="password"
                    placeholder="Confirm password"
                    value={suConfirm}
                    onChange={(e) => setSuConfirm(e.target.value)}
                    required
                    className={`${inputClass} pl-10`}
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="cursor-pointer w-full py-3 rounded-xl bg-[#6b21a8] hover:bg-[#7c3aed] transition-colors text-white font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed mt-1"
                >
                  {loading ? 'Creating account…' : 'Create Account'}
                </button>

                <div className="flex items-center gap-3 my-1">
                  <div className="flex-1 h-px bg-white/10" />
                  <span className="text-gray-600 text-xs">or</span>
                  <div className="flex-1 h-px bg-white/10" />
                </div>

                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleGoogleAuth('signup')}
                  className="cursor-pointer flex w-full items-center justify-center gap-3 py-3 px-4 rounded-xl bg-white text-black hover:bg-gray-100 transition-all font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FcGoogle className="w-5 h-5" />
                  Sign Up with Google
                </button>
              </motion.form>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </div>
  )
}
