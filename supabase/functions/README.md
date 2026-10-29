No Edge Functions are required. Anonymous registration uses the narrowly scoped `register_student` / `get_registration_form`
database functions (SECURITY DEFINER, validated, audited). Add an Edge Function here only if you later need a secret server-side
credential (e.g. a biometric vendor cloud API) — never put such secrets in `VITE_` variables.
