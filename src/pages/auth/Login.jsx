import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, LogIn } from 'lucide-react'
import { useAuth, homeForRole } from '../../context/AuthContext'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Logo from '../../components/ui/Logo'
import { FullPageSpinner } from '../../components/ui/States'
import { loginSchema } from '../../lib/validation'
import { friendlyError } from '../../lib/errors'
import { isSupabaseConfigured, supabaseConfigProblem } from '../../lib/supabase'

export default function Login() {
  const { signIn, profile, user, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(loginSchema) })

  if (loading) return <FullPageSpinner />
  if (user && profile?.is_active) return <Navigate to={location.state?.from?.pathname || homeForRole(profile.role)} replace />

  const onSubmit = async (v) => {
    setError('')
    try { await signIn(v.email, v.password); navigate(location.state?.from?.pathname || '/', { replace: true }) }
    catch (e) { setError(/invalid login/i.test(e.message) ? 'Incorrect email or password.' : friendlyError(e)) }
  }

  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden flex-1 flex-col items-center justify-center bg-primary p-12 text-white lg:flex">
        <Logo size={96} />
        <h1 className="mt-6 text-4xl font-bold">EED</h1>
        <p className="mt-2 text-xl text-white/90">Electronic Entry &amp; Departure</p>
        <p className="mt-4 max-w-sm text-center text-white/70">Secure biometric attendance management.</p>
      </div>
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden"><Logo withText /></div>
          <h2 className="text-2xl font-bold">Sign in</h2>
          <p className="mt-1 text-sm text-text-secondary">Administrators, lecturers and students.</p>
          {!isSupabaseConfigured && <div role="alert" className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Supabase is not configured: {supabaseConfigProblem} Fix <code>.env</code> and restart <code>npm run dev</code>.</div>}
          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
            <Input label="Email" type="email" autoComplete="email" required error={errors.email?.message} {...register('email')} />
            <div className="relative">
              <Input label="Password" type={show ? 'text' : 'password'} autoComplete="current-password" required error={errors.password?.message} {...register('password')} />
              <button type="button" onClick={() => setShow(!show)} className="absolute right-2 top-8 rounded p-1.5 text-text-secondary hover:bg-mint" aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
            </div>
            {error && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</div>}
            <Button type="submit" size="lg" className="w-full" loading={isSubmitting} disabled={!isSupabaseConfigured}><LogIn className="h-4 w-4" />Sign in</Button>
            <div className="flex justify-between text-sm"><Link to="/forgot-password" className="text-primary hover:underline">Forgot password?</Link><Link to="/" className="text-text-secondary hover:underline">Back home</Link></div>
          </form>
        </div>
      </div>
    </div>
  )
}
