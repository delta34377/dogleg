// Central definition of who sees the admin tools.
//
// IMPORTANT: This is a client-side UI hint only. It decides which buttons and
// pages are shown — it is NOT a security boundary. Anyone can call the admin
// Supabase RPCs directly with their own session, so every admin RPC checks
// public.is_admin() on the server, which reads the same profiles.is_admin
// column used here. Keeping one definition (the database column) means the UI
// and the server can never disagree about who is an admin.
//
// `profile` is the signed-in user's profiles row from AuthContext.
export const isAdmin = (profile) => profile?.is_admin === true
