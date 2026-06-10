// Central definition of who has admin access.
//
// IMPORTANT: This is a client-side convenience only. It controls what UI and
// routes are shown — it is NOT a security boundary. Anyone can call the admin
// Supabase RPCs / table writes directly with their own session, so those MUST
// enforce admin access server-side (RLS policies and/or a check inside each
// SECURITY DEFINER function). Changing the email here does not protect data.
export const ADMIN_EMAIL = 'markgreenfield1@gmail.com'

export const isAdmin = (user) => user?.email === ADMIN_EMAIL
