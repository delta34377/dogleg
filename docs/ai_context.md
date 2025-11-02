# 🤖 AI Context Document - Dogleg Project

## Quick Project Summary
I'm building **Dogleg** (dogleg.io) - a social golf scorecard app. Think "Strava/Instagram for golf" where users post rounds, follow friends, and react/comment on each other's scores. Mobile-first PWA.

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

# Feed Strategy Decision
**Implementing Smart Blended Feed (Single Feed)**:
- Following rounds always appear first/prioritized
- Fill with discovery content when following runs out:
  - Rounds from local area (within 50 miles)
  - Rounds from courses user has played
  - Popular rounds (lots of reactions/comments)
  - Recent rounds from similar skill level
- Subtle indicators for discovery content ("Near you", "Popular", etc.)


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
```

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

### ✅ AUTHENTICATION COMPLETE
- Supabase Auth fully integrated
- Email/password and Google OAuth working
- Password reset flow functional
- All user data properly associated

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

### Auth Implementation Notes
- Using auth state listener as primary source (more reliable than getSession)
- getSession() can hang due to Supabase localStorage issues
- Profile loading is non-blocking for better UX
- Loading state managed independently from profile fetch

### Fixed Issues
- Infinite loading on tab switch - FIXED
- Refresh (Ctrl+R) infinite loading - FIXED (auth listener approach)
- User profile navigation - FIXED
- Foreign key constraints pointing to wrong table - FIXED  
- Email login not navigating - FIXED
- Password reset hanging - FIXED with timeout workaround
- Date timezone issues - FIXED

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