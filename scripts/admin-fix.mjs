import { createClient } from '@supabase/supabase-js'

const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!key) { console.error('SUPABASE_SERVICE_ROLE_KEY not set'); process.exit(1) }
if (!process.env.ATHLETE_PW) { console.error('ATHLETE_PW not set'); process.exit(1) }

const supabase = createClient(
  'https://peufunxsckntvzyulddz.supabase.co',
  key,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const r1 = await supabase.auth.admin.updateUserById(
  '85c76cbf-aec6-4f16-87ef-956eae4719e1',
  { email: 'emidiopacecca@gmail.com', email_confirm: true }
)
console.log('email:', r1.error ? r1.error.message : r1.data.user.email)

const r2 = await supabase.auth.admin.updateUserById(
  'f434c335-dadb-4d6c-b047-910912d0086d',
  { password: process.env.ATHLETE_PW }
)
console.log('password:', r2.error ? r2.error.message : 'set for ' + r2.data.user.email)
