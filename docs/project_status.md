# Project Status - Dogleg

## Last Updated: [10/27/25]

## ✅ Completed
- ✅ Created Supabase project
- ✅ Ran database schema
- ✅ Imported CSV data (16k clubs, 22k courses, 94k tees)
- ✅ React app created with Create React App
- ✅ Tailwind CSS configured
- ✅ Course search component (all 3 methods working)
- ✅ Score entry component with full features
- ✅ My Rounds page with:
  - Instagram-style card layout
  - Emoji reactions (8 types) - saves to database
  - Comments system with character limits - saves to database
  - Color-coded scorecards
  - Smart course/club name display
  - Proper date handling
  - Delete functionality
- ✅ Navigation between Add Round and My Rounds
- ✅ Rounds saving to Supabase database
- ✅ Photo upload to Supabase Storage (5MB limit)
- ✅ Reactions and comments working with database
- ✅ Temporary reaction tracking via localStorage (until auth)
- ✅ Authentication system (Supabase Auth)
  - Email/password login
  - Google OAuth login  
  - Password reset flow
  - Protected routes
- ✅ Feed page with social features
- ✅ User profiles with stats
- ✅ Navigation without infinite loading issues
- ✅ Foreign key constraints fixed (profiles table)
- ✅ User profile pages with full round display
- ✅ Follow/unfollow functionality 
- ✅ Follower/following lists with modals
- ✅ Comments showing usernames (fixed RPC functions)
- ✅ Database foreign keys properly configured (profiles table)
- ✅ Notifications table RLS policies


## 🔄 Currently Working On
- Ready for deployment to Vercel

## Next Steps
- Deploy to Vercel
- Add user discovery ("Find Golfers to Follow")
- Add following/followers functionality
- Push notifications
- Offline support (PWA)

## 🎯 Current Decisions

### Feed Strategy: Smart Blended Feed
- Single feed that intelligently blends content
- Following rounds prioritized
- Discovery content fills in (local, popular, similar skill)
- No empty states for new users

### Navigation: 3 Tabs
- Feed, Add Round, My Rounds
- Removed Profile tab (access via username in header)

### Image Quality Settings
- <3MB: No compression
- 3-5MB: Light compression (0.95 quality)
- >5MB: Target 4.9MB (not 1.25MB)

## 🚀 Deployment Readiness
**Status: READY FOR BETA**
- All core features functional
- No blocking bugs
- Performance optimized


## Tech Notes
- Pars stored as array in database
- Using Supabase for all data storage
- Photos stored in 'round-photos' bucket
- Reactions table uses 'emoji' column
- Comments table uses 'content' column
- Using profiles table (not users) for foreign keys
- Photos in 'round-photos' bucket
- All user data properly associated via auth
- No more localStorage - everything in database

## ❌ Blockers
- None currently

## 📝 Notes for Next Session
- Need to build React components

## Supabase Details
- Project URL: [saved in .env]
- Project Name: dogleg
- Project URL: https://egnnjhlbnlhvudgopzvq.supabase.co
- Auth configured with Google OAuth