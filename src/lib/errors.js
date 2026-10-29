/** Turn Supabase/Postgres errors into short human messages. */
export function friendlyError(err) {
  const msg = err?.message || String(err || 'Something went wrong')
  const m = msg.match(/^(NOT_AUTHORIZED|INVALID_[A-Z]+):?\s*(.*)$/s)
  if (m) return m[2] || 'You are not allowed to do that.'
  if (/row-level security|permission denied/i.test(msg)) return 'You do not have permission to do that.'
  if (/duplicate key/i.test(msg)) return 'That record already exists.'
  if (/foreign key/i.test(msg)) return 'This record is still in use by other records.'
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'Network problem. Check your connection and try again.'
  return msg
}

export const RESULT_MESSAGES = {
  SIGN_IN_SUCCESS: { tone: 'success', title: 'SIGN-IN SUCCESSFUL' },
  SIGN_OUT_SUCCESS: { tone: 'success', title: 'SIGN-OUT SUCCESSFUL' },
  ALREADY_SIGNED_IN: { tone: 'info', title: 'Already signed in', message: 'This student has already signed in for this class.' },
  ALREADY_COMPLETE: { tone: 'info', title: 'Attendance already complete', message: 'Sign-in and sign-out are both recorded. Nothing was changed.' },
  NOT_SIGNED_IN: { tone: 'warning', title: 'Not signed in yet', message: 'This student must sign in before signing out.' },
  NOT_ENROLLED: { tone: 'error', title: 'Not enrolled in this course', message: 'This student is not registered for this class.' },
  STUDENT_NOT_FOUND: { tone: 'error', title: 'Student not found', message: 'No student with that matric number exists. Students must register through the registration link first.' },
  STUDENT_INACTIVE: { tone: 'error', title: 'Student not active', message: 'This student record is suspended or inactive. Contact an administrator.' },
  CLASS_CLOSED: { tone: 'error', title: 'Class is closed', message: 'Attendance is closed. An authorised person must reopen the class.' },
  CLASS_NOT_STARTED: { tone: 'warning', title: 'Class has not started', message: 'Attendance opens when the class is started.' },
  CLASS_CANCELLED: { tone: 'error', title: 'Class cancelled', message: 'This class was cancelled.' },
  FINGERPRINT_NOT_RECOGNIZED: { tone: 'warning', title: 'Fingerprint not recognized', message: 'Clean the finger and the sensor, then try again.' },
  CONSENT_REQUIRED: { tone: 'warning', title: 'Consent required', message: 'The student must consent to biometric enrolment.' },
  ALREADY_ENROLLED: { tone: 'info', title: 'Already enrolled', message: 'This student already has an enrolled fingerprint. Use the fingerprint scanner, or an override if it fails.' },
  TEMPLATE_IN_USE: { tone: 'error', title: 'Fingerprint already in use', message: 'That fingerprint reference belongs to another student.' },
  NOTES_REQUIRED: { tone: 'warning', title: 'Notes required', message: 'Add a note explaining the "Other" reason.' },
  ENROLLMENT_FAILED: { tone: 'error', title: 'Enrolment failed', message: 'The scanner did not return a valid enrolment.' },
}
