/** Mirrors public.normalize_matric() in the database: trim, remove all whitespace, upper-case. */
export const normalizeMatric = (v) => String(v ?? '').trim().replace(/\s+/g, '').toUpperCase()
export const MATRIC_PATTERN = /^[A-Z0-9/-]{3,40}$/
export const isValidMatric = (v) => MATRIC_PATTERN.test(normalizeMatric(v))
