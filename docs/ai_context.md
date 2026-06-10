# 🤖 AI Context Document - Dogleg Project

## Quick Project Summary
I'm building **Dogleg** (dogleg.io) - a social golf scorecard app. Think "Instagram for golf" where users follow friends, react/comment on each other's rounds, and post their own scores. Mobile-first PWA.

**Positioning (June 2026):** Lead with the social side (follow/react/comment on friends' rounds). De-emphasize the stat-tracking/"Strava" angle in user-facing copy and ads — see `/docs/google_ads.md` and `/docs/feature_ideas.md`.

## Current Status
- ✅ Database schema ready (Supabase)
- ✅ 22,563 golf courses imported to Supabase
- ✅ Import scripts working
- ✅ React app created with Create React App
- ✅ Course search component working (all 3 methods)
- ✅ Score entry with photo uploads
- ✅ My Rounds page with database integration
- ✅ Reactions and comments saving to database
- ✅ User authentication
- ✅ **Notifications System** - Bell icon with dropdown showing comments, reactions, follows
  - Red dot indicator for new notifications
  - Last 30 days of activity shown
  - Follow back buttons inline
  - Mobile-optimized dropdown positioning
  - Auto-marks as read when opened
  - Database triggers creating notifications automatically
  
- ✅ **Profile Navigation Fix** - Comments no longer collapse when clicking usernames
  - Used key={location.pathname} on UserProfile component
  - Ensures fresh component instance on profile changes
  
- ✅ **Consistent Loading States** - Skeleton loaders across all pages
  - Profile page now uses same skeleton pattern as Feed
  - Better visual feedback during data loading

### Recently Fixed
- ✅ Infinite loading on tab switch (useRef solution in AuthContext)
- ✅ Login after logout bug (proper SIGNED_IN event handling)
- ✅ Image over-compression (now targets 4.9MB, not 1.25MB)
- ✅ Feed styling matches MyRounds exactly
- ✅ Removed redundant Profile tab from navigation
- ✅ Refresh (Ctrl+R) infinite loading (Supabase getSession hanging - using auth listener)
- ✅ User profile navigation from Feed working
- ✅ User profile pages with MyRounds-style display
- ✅ Follow/unfollow system working
- ✅ Comments showing as Anonymous (fixed get_feed_with_everything and get_my_rounds_with_everything RPCs)
- ✅ Foreign key constraints (notifications, follows tables now properly reference profiles)
- ✅ Navigation on user profiles (mobile working, desktop pending)
- ✅ Infinite loading on tab switch (useRef solution in AuthContext)
- ✅ Login after logout bug (proper SIGNED_IN event handling)
- ✅ Navigation on user profiles (mobile and desktop working)
- ✅ **Smart Blended Feed implemented** - 70/30 mix of following/discovery content
- ✅ **Discovery content with indicators** - Shows why users see suggested rounds
- ✅ **Deployed to Vercel** - Live at https://dogleg-eta.vercel.app/
- ✅ **Mobile tab focus authentication completely resolved**
  - Smart refocus logic with token expiry awareness (only refreshes when <30s to expiry)
  - Fixed stale closure bug using userRef for event handlers
  - Robust expires_at parsing handles both string and number formats from different Supabase versions
  - Removed duplicate auth guards in AuthenticatedApp (single-guard pattern)
  - Fixed React useMemo dependencies for rechecking state
  - No more false logouts, infinite loading, or unnecessary refreshes on tab switches
  - ✅ **Individual Round Pages with Short URLs** - Each round now has a shareable URL
  - Added 6-character short codes (e.g., `/rounds/K7FX9M` instead of UUIDs)
  - Created SingleRound component that displays rounds exactly like Feed
  - Share button now generates working shareable links
  - Database trigger auto-generates unique short codes for all rounds
  - ✅ **Feed algorithm admin panel** - Adjustable algorithm parameters without code changes
- ✅ **Discovery mode filtering** - Fixed SQL function parameter mismatch ('discover' vs 'discovery')
- ✅ **Round count consistency** - All pages now count from actual rounds table
- ✅ **3-dots menu for rounds** - Replaced delete button with expandable menu
- ✅ **Profile stats accuracy** - Fixed follower/following counts using followService
- ✅ **Content Moderation System Complete**
  - Admin dashboard at `/admin/moderation` 
  - Soft delete system for rounds and comments
  - User content management (delete all content from user)
  - Fixed feed functions to exclude soft-deleted content
  - Follower counts auto-update via database triggers
  - Search/filter/sort across all content types
  - Pagination and bulk operations
  
### Key Technical Decisions
1. **userRef Pattern**: Event handlers in useEffect with [] deps use refs to avoid stale closures
2. **Smart Refocus**: Only refresh when `tokenExpiry - now <= 30 seconds` OR no user
3. **Robust Parsing**: Handle both `expires_at` as number (UNIX) and string (ISO)
4. **Single Guard**: ProtectedRoute is the ONLY place that redirects to /login
5. **Event Sources**: Use visibilitychange and pageshow, but NOT focus (fires too often)
6. **Component Keys for Navigation**: Use location.pathname as key when navigating between same component types (prevents state persistence issues)
7. **Notification Dropdown Positioning**: Fixed positioning on mobile, absolute on desktop for proper alignment
8. **Soft Delete Pattern**: is_deleted flags with RPC functions filtering them out, not actual DELETE operations


# Feed Strategy Decision
**Latest Feed Implementation
**Smart Blended Feed Algorithm:**
- Single "For You" feed with intelligent content mixing
- 70% following content, 30% discovery content
- Discovery sources:
  - 📍 Near courses you've played (same course/club)
  - 🔥 Popular rounds (3+ reactions or 2+ comments)
- Scoring algorithm: `0.6 * recency + 0.3 * engagement + 0.1 * affinity`
- Waterfall fill: When following content is sparse, discovery fills the gap
- SQL RPC function: `get_feed_with_discovery`
- No empty feeds for new users

## Admin Panel (Mark Only)
- **Access**: `/admin` route (only for markgreenfield1@gmail.com)
- **Adjustable Parameters**:
  - Discovery ratio (0-100%)
  - Feed mode (mixed/following/discover)
  - Popular thresholds (reactions/comments)
  - Scoring weights (recency/engagement/affinity)
  - Near-you radius
- **Settings Storage**: localStorage (device-specific)
- **Apply & Refresh**: Instant feed algorithm updates
## Admin Features (Mark Only)
- **Analytics Dashboard**: `/admin` - User growth, engagement metrics
- **Feed Algorithm Control**: `/admin` - Adjust discovery ratio and weights  
- **Content Moderation**: `/admin/moderation` - User and content management
  - Search/filter/sort users by activity
  - Delete individual rounds/comments
  - Delete all content from a user
  - View user statistics
  - Soft delete system (content hidden but retained)
  - **Soft Delete System**:
  - Content marked as is_deleted=true but retained in database
  - Feed functions exclude soft-deleted content automatically
  - Moderation actions logged for audit trail
  - Force page refresh after deletions to clear caches

## Tech Stack
- **Database:** Supabase (PostgreSQL) - COMPLETED
- **Frontend:** React (Create React App) + Tailwind CSS - IN PROGRESS
- **Auth:** Supabase Auth (not yet implemented)
- **Hosting:** Vercel (not yet deployed)
- **State:** Zustand - INSTALLED

## Database Structure
```sql
-- 16,367 clubs → 22,563 courses → 94,648 tees
clubs (ClubID, ClubName, City, State, Latitude, Longitude...)
courses (CourseID, ClubID, CourseName, NumHoles, Par1-18, Hcp1-18...)
tees (TeeID, CourseID, TeeName, TeeColor, Slope, CR, Length1-18...)

-- User data
users → rounds → reactions, comments
users → follows → feed generation

-- Moderation tables
moderation_log (audit trail for all admin actions)
rounds/comments (is_deleted soft delete flags)

-- Auto-updating triggers
update_follow_counts() - maintains follower_count in profiles


### Important Database Notes
- Using `profiles` table for all user data (NOT `users` table)
- All foreign keys must reference `profiles` table
- RPC functions need to join profiles for user data:
  - `get_feed_with_everything` - joins profiles for comments
  - `get_my_rounds_with_everything` - joins profiles for comments
- Notifications table has trigger on follows table

## File Structure
```
dogleg/
├── config/app-config.js    # Central config (change name here)
├── database/               # SQL schemas
├── scripts/               # Import scripts
├── admin/                # Admin dashboard
├── frontend/             # React app (TO BUILD)
└── data/                # CSV files (clubs.csv, courses.csv, tees.csv)
```

## NEW File Structure With React
```
dogleg/
├── frontend/          # ← Your React app
│   ├── public/
│   ├── src/
│   │   ├── components/   # Reusable components
│   │   ├── pages/       # Full page components
│   │   ├── services/    # API/Supabase calls
│   │   ├── hooks/       # Custom React hooks
│   │   └── App.js       # Main app
│   └── .env            # Environment variables
├── scripts/           # Your import scripts (keep these)
├── prototypes/        # Your HTML prototypes (reference)
└── docs/

## Key Features to Build
1. **Score Entry:** Quick posting after round (course search → tee selection → score input → post)
2. **Social Feed:** Follow friends, see their rounds
3. **Reactions:** Emoji reactions (🔥👏💪🎯⛳😂)
4. **Course Search:** 22k courses with location-based search

## Current Task
[Describe what you need help with]

## Important Context
- Mobile-first design (bottom nav, big buttons)
- Most users will use after playing golf
- Quick score entry is critical (<30 seconds)
- Privacy: rounds can be public/private
- CSV data can be re-uploaded anytime (admin feature)

## Environment Variables Needed
```bash
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJ... (public)
SUPABASE_SERVICE_KEY=eyJ... (secret, for imports)
```

## If You Need to See Code
Key files to reference:
- `/config/app-config.js` - App configuration
- `/database/schema.sql` - Database structure  
- `/scripts/import-golf-data.js` - CSV import logic
- `/docs/README.md` - Full documentation

## Design Principles
- **Fast:** <30 second score entry
- **Social:** Feed, follows, reactions
- **Mobile:** Touch-first, works offline
- **Flexible:** Can rebrand easily (change in config)

---

**What I typically need help with:**
- React component development
- Supabase queries
- UI/UX for mobile
- Performance optimization for 22k courses
- Social feed algorithms
- I am a novice using VSCode, so I generally need step-by-step instruction

**Current blockers:**
[List any current issues]

**Next steps:**
[What you're trying to accomplish]

# LATEST UPDATE:

# AI Context - Dogleg Project

## About Me (The Developer)
- **Experience Level**: Beginner/Novice in coding
- **Development Environment**: VSCode on Windows (PowerShell terminal)
- **Learning Style**: Need step-by-step instructions with exact file paths
- **Working Directory**: `C:\Users\markg\OneDrive\Desktop\dogleg`

## Project Status
**Current Phase**: Building frontend components
**Completed**: ✅ Database setup, ✅ Data import (16k clubs, 22k courses, 94k tees)

## Tech Stack
- **Database**: Supabase (PostgreSQL) - COMPLETED
- **Frontend**: Vanilla JavaScript (React coming later)  
- **IDs**: Using TEXT type (some IDs are 20+ digits)
- **Hosting**: Will use Vercel
- **Development**: Node.js v20.11.0, npm

## Database Structure
```sql
clubs (16,367 records) - TEXT IDs
  └── courses (22,563 records) - TEXT IDs  
      └── tees (94,648 records) - TEXT IDs
          └── hole_lengths[], slopes, ratings

users → rounds → reactions/comments (social features ready)
```

## What I Need From AI
1. **Always provide exact file paths** where code should be saved
2. **Include full terminal commands** with proper Windows/PowerShell syntax
3. **Explain what each code block does** in simple terms
4. **Show me where to click** in VSCode or Supabase dashboard
5. **Warn me about common errors** before they happen
6. **Test code snippets** before major implementations

## Current Working Directory Structure
```
C:\Users\markg\OneDrive\Desktop\dogleg\
├── config/
│   └── app-config.js
├── database/
│   └── [SQL files]
├── scripts/
│   ├── import-golf-data.js ✅ WORKING
│   ├── package.json
│   └── .env (contains Supabase keys)
├── data/
│   └── [CSV files - imported successfully]
└── docs/
    ├── README.md
    └── AI_CONTEXT.md (this file)
```

## Known Issues/Gotchas
- IDs are TEXT not numbers (too large for BIGINT)
- Some clubs have multiple courses
- Tees CSV had duplicates (handled in import)
- Need `"type": "module"` in package.json for ES6 imports

## Next Priority
Building course search with:
1. Search by club name
2. Search by location (city/state or zip)
3. Find nearest courses (15 mile radius)
4. Handle clubs with multiple courses

## Key Context for Search Implementation
- Must be FAST with 22k courses
- Mobile-first design
- Location search is critical
- Some clubs have multiple courses (one-to-many relationship)

## Example of Good AI Response Format
```
Step 1: Create this file
Path: C:\Users\markg\OneDrive\Desktop\dogleg\[exact-path]\filename.js

[code block with comments]

Step 2: Run this command
In PowerShell:
> cd C:\Users\markg\OneDrive\Desktop\dogleg
> [exact command]

What this does: [simple explanation]
```

### ✅ AUTHENTICATION COMPLETE & PRODUCTION-READY
- Supabase Auth fully integrated with email/password and Google OAuth
- Password reset flow functional
- **Smart session management:**
  - Token expiry tracking prevents unnecessary refreshes
  - Only refreshes when token expires within 30 seconds
  - Handles both UNIX timestamp and ISO string expires_at formats
  - userRef pattern prevents stale closures in event handlers
- **Mobile-optimized:**
  - No false logouts on tab switches
  - No full-page refreshes on quick tab switches
  - Handles iOS Safari back/forward cache
  - Visibility API for modern browsers
- **Single-guard architecture:**
  - ProtectedRoute is sole auth guard
  - No duplicate checks causing race conditions
  - Smart loading states: `loading || (!user && rechecking)`


### Current Architecture
```
Frontend (React)
├── AuthContext (manages auth state)
├── ProtectedRoute (guards pages)
├── AuthScreen (login/signup)
└── Components use useAuth() hook

Database
├── auth.users (Supabase managed)
├── profiles (our user data)
│   └── Foreign keys: rounds, reactions, comments
└── RLS policies enabled
```

## Auth Implementation Notes
- Using auth state listener as primary source (more reliable than getSession)
- getSession() can hang due to Supabase localStorage issues
- Profile loading is non-blocking for better UX
- Loading state managed independently from profile fetch
- **Event handlers use userRef.current to avoid stale closures**
- **expires_at parsing handles both number (UNIX) and string (ISO) formats**
- **rechecking state properly included in useMemo dependencies**


### Fixed Issues
- Infinite loading on tab switch - FIXED (userRef for current state)
- Refresh (Ctrl+R) infinite loading - FIXED (rechecking in useMemo deps)
- User profile navigation - FIXED
- Foreign key constraints pointing to wrong table - FIXED  
- Email login not navigating - FIXED
- Password reset hanging - FIXED with timeout workaround
- Date timezone issues - FIXED
- Tab focus false logouts - FIXED (smart refocus with token expiry check)
- Unnecessary refreshes on tab switch - FIXED (only refreshes near expiry)
- Stale closure in event handlers - FIXED (userRef pattern)
- Different Supabase expires_at formats - FIXED (robust parsing)
- Double auth guards causing races - FIXED (single-guard pattern)


### Environment Variables
```bash
REACT_APP_SUPABASE_URL=https://egnnjhlbnlhvudgopzvq.supabase.co
REACT_APP_SUPABASE_ANON_KEY=eyJ... (in .env)
```

### Auth Flow
1. User signs up → profile created automatically
2. User logs in → AuthContext manages session
3. Protected routes check auth status
4. All database operations use authenticated user ID

### Ready for Production
- All core features working
- Authentication secure
- Database relationships correct
- Ready to deploy to Vercel