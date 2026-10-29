import { z } from 'zod'
import { normalizeMatric, isValidMatric } from './matric'

export const MAX_PHOTO_BYTES = 2 * 1024 * 1024
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export function validatePhoto(file) {
  if (!file) return 'A passport photograph is required'
  if (!PHOTO_TYPES.includes(file.type)) return 'Photo must be a JPG, PNG or WebP image'
  if (file.size > MAX_PHOTO_BYTES) return 'Photo must be 2 MB or smaller'
  return null
}

export const registrationSchema = z.object({
  full_name: z.string().trim().min(3, 'Enter your full name').max(120, 'Name is too long'),
  matric_number: z.string().refine(isValidMatric, 'Enter a valid matriculation number (letters, digits, / or -)').transform(normalizeMatric),
  phone: z.string().trim().regex(/^\+?[0-9 -]{7,20}$/, 'Enter a valid phone number'),
  email: z.string().trim().email('Enter a valid email address'),
  address: z.string().trim().min(5, 'Enter your residential address').max(300),
  consent: z.literal(true, { errorMap: () => ({ message: 'You must accept the declaration to register' }) }),
})

export const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

export const classSessionSchema = z
  .object({
    course_id: z.string().uuid('Select a course'),
    academic_session_id: z.string().uuid('Select an academic session'),
    semester: z.enum(['FIRST', 'SECOND']),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date'),
    start: z.string().regex(/^\d{2}:\d{2}$/, 'Pick a start time'),
    end: z.string().regex(/^\d{2}:\d{2}$/, 'Pick an end time'),
    grace_minutes: z.coerce.number().int().min(0).max(240),
    early_signin_minutes: z.coerce.number().int().min(0).max(240),
    late_after_minutes: z.coerce.number().int().min(0).max(240),
    venue: z.string().trim().max(120).optional(),
    instructions: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.end > v.start, { path: ['end'], message: 'End time must be after the start time' })
