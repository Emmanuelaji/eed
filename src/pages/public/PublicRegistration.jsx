import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertCircle, Clock, Upload, XCircle } from 'lucide-react'
import Button from '../../components/ui/Button'
import Input, { Textarea } from '../../components/ui/Input'
import { Card } from '../../components/ui/Card'
import Logo from '../../components/ui/Logo'
import { Spinner } from '../../components/ui/States'
import { registrationService } from '../../services/registrationService'
import { registrationSchema, validatePhoto } from '../../lib/validation'
import { formatDateTime } from '../../lib/time'
import { friendlyError } from '../../lib/errors'
import { isSupabaseConfigured } from '../../lib/supabase'

const UNAVAILABLE = {
  NOT_FOUND: ['Registration link not found', 'This link is not valid. Check that you copied the whole link, or ask your department for a new one.', XCircle],
  INACTIVE: ['Registration is closed', 'This registration form has been deactivated by an administrator.', XCircle],
  EXPIRED: ['Registration has expired', 'The registration deadline has passed. Contact your department if you still need to register.', Clock],
  FULL: ['Registration is full', 'The maximum number of registrations for this form has been reached.', AlertCircle],
}
const SERVER_ERRORS = {
  MATRIC_CONFLICT: 'This matric number is already registered under different details. Do not register again — contact your department administrator so the record can be checked and corrected.',
  CONSENT_REQUIRED: 'You must accept the declaration to register.',
  INVALID: 'Some details were not accepted. Please check the form and try again.',
}

export default function PublicRegistration() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [form, setForm] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [photo, setPhoto] = useState(null)
  const [photoError, setPhotoError] = useState(null)
  const [submitError, setSubmitError] = useState(null)
  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo])
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview])

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(registrationSchema), defaultValues: { consent: false } })

  useEffect(() => {
    if (!isSupabaseConfigured) { setLoadError('The application is not configured yet (missing Supabase settings).'); return }
    registrationService.getForm(token).then(setForm).catch((e) => setLoadError(friendlyError(e)))
  }, [token])

  const onPhoto = (e) => {
    const f = e.target.files?.[0]
    const err = f ? validatePhoto(f) : null
    setPhotoError(err); setPhoto(err ? null : f || null)
  }

  const onSubmit = async (values) => {
    setSubmitError(null)
    const err = validatePhoto(photo)
    if (err) { setPhotoError(err); return }
    try {
      const res = await registrationService.register(token, values, photo)
      if (res.ok) navigate('/registration-success', { replace: true, state: { reference: res.reference, matric: res.matric_number, already: res.code === 'ALREADY_REGISTERED', course: form?.course } })
      else if (UNAVAILABLE[res.code]) setForm({ ...form, state: res.code })
      else setSubmitError(SERVER_ERRORS[res.code] || 'Registration failed. Please try again.')
    } catch (e) { setSubmitError(friendlyError(e)) }
  }

  const shell = (children) => (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-2xl"><div className="mb-6 flex justify-center"><Logo withText /></div>{children}</div>
    </div>
  )

  if (loadError) return shell(<Card role="alert" className="text-center"><AlertCircle className="mx-auto h-10 w-10 text-error" /><p className="mt-3">{loadError}</p></Card>)
  if (!form) return shell(<Spinner label="Loading registration form…" />)
  if (form.state !== 'OPEN') {
    const [title, msg, Icon] = UNAVAILABLE[form.state] || UNAVAILABLE.NOT_FOUND
    return shell(<Card className="text-center"><Icon className="mx-auto h-12 w-12 text-warning" aria-hidden="true" /><h1 className="mt-3 text-xl font-semibold">{title}</h1><p className="mt-2 text-text-secondary">{msg}</p></Card>)
  }

  return shell(
    <Card>
      <h1 className="text-2xl font-bold">{form.name}</h1>
      <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-mint p-4 text-sm">
        <div><dt className="text-text-secondary">Course</dt><dd className="font-medium">{form.course?.code} — {form.course?.title}</dd></div>
        <div><dt className="text-text-secondary">Department</dt><dd className="font-medium">{form.department}</dd></div>
        <div><dt className="text-text-secondary">Level</dt><dd className="font-medium">{form.level}</dd></div>
        <div><dt className="text-text-secondary">Session / semester</dt><dd className="font-medium">{form.academic_session} · {form.semester === 'FIRST' ? 'First' : 'Second'}</dd></div>
        {form.deadline && <div className="col-span-2"><dt className="text-text-secondary">Deadline</dt><dd className="font-medium">{formatDateTime(form.deadline)}</dd></div>}
      </dl>
      {form.instructions && <p className="mt-4 whitespace-pre-line text-sm text-text-secondary">{form.instructions}</p>}

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
        <Input label="Full name" required autoComplete="name" error={errors.full_name?.message} {...register('full_name')} />
        <Input label="Matriculation number" required hint="Spaces are ignored; letters are upper-cased." autoCapitalize="characters" error={errors.matric_number?.message} {...register('matric_number')} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Phone number" required type="tel" autoComplete="tel" error={errors.phone?.message} {...register('phone')} />
          <Input label="Email address" required type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
        </div>
        <Textarea label="Residential address" required error={errors.address?.message} {...register('address')} />
        <div>
          <label htmlFor="photo" className="label label-required">Passport photograph</label>
          <div className="flex items-center gap-4">
            <div className="flex h-24 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-background">
              {preview ? <img src={preview} alt="Selected passport preview" className="h-full w-full object-cover" /> : <Upload className="h-6 w-6 text-text-secondary" aria-hidden="true" />}
            </div>
            <div className="min-w-0">
              <input id="photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={onPhoto} className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-mint file:px-3 file:py-2 file:text-primary" aria-describedby="photo-hint" />
              <p id="photo-hint" className="mt-1 text-xs text-text-secondary">JPG, PNG or WebP, up to 2 MB. Plain background, face clearly visible.</p>
              {photoError && <p role="alert" className="mt-1 text-sm text-error">{photoError}</p>}
            </div>
          </div>
        </div>
        <div className="rounded-lg bg-background p-3">
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-primary" {...register('consent')} />
            <span>I declare that the information above is true and that I consent to my details and passport photograph being stored and used for attendance and identity verification, including biometric enrolment at the attendance station.</span>
          </label>
          {errors.consent && <p role="alert" className="mt-1 text-sm text-error">{errors.consent.message}</p>}
        </div>
        {submitError && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{submitError}</div>}
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>Submit registration</Button>
      </form>
    </Card>
  )
}
