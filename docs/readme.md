# 🏌️ Dogleg - Social Golf Scorecard Platform

## Project Overview

**Dogleg** is a mobile-first social golf platform - think "Instagram meets Strava for golf". Users can quickly log scores after rounds, follow friends, react to rounds, and track their golf journey.

**Domain:** dogleg.io  
**Status:** In Development  
**Started:** October 2025  

## 🎯 Core Features

### MVP Features (Building Now)
1. **Quick Score Entry** - Log rounds in <30 seconds
2. **Social Feed** - Follow friends, see their rounds
3. **Reactions & Comments** - Engage with emoji reactions and comments
4. **Course Database** - 22,563 courses with 94,648 tee options pre-loaded
5. **Mobile PWA** - Installable app, works offline

## 📱 Feed Architecture

### Smart Blended Feed (Implemented November 2024)
Our "For You" feed intelligently mixes content for maximum engagement:

**Algorithm**: 
- **70% Following Content**: Rounds from people you follow
- **30% Discovery Content**: Suggested rounds to discover new golfers
- **Smart Ranking**: `Score = 0.6 * recency + 0.3 * engagement + 0.1 * affinity`

**Discovery Sources**:
- 📍 **Near courses you've played**: Rounds from same/nearby courses
- 🔥 **Popular rounds**: High engagement content (3+ reactions or 2+ comments)

**Key Features**:
- No empty feeds for new users
- Waterfall fill when following content is sparse
- Explainable discovery (users see why content is suggested)
- Single database call for performance
- No user location required

### Technical Implementation
- **RPC Function**: `get_feed_with_discovery`
- **Service Method**: `roundsService.getFeedWithDiscovery()`
- **Component**: `Feed.js` with discovery indicators
- **Database indexes**: Optimized for course, engagement, and time-based queries

## 🎨 Design Decisions

### Recent UI Updates
- 3-tab navigation (removed Profile tab)
- "username posted a round" integrated format
- Progressive image compression
- Mobile padding: p-2, Desktop: p-4

### User Flow
1. User finishes golf round
2. Opens app, clicks "+" button
3. Searches course (by location or name)
4. Selects tees played
5. Enters score (total, by 9s, or hole-by-hole)
6. Optionally adds photo and caption
7. Posts to feed
8. Friends can react and comment

## 📊 Database Overview

### Pre-loaded Data (CSV imports)
- **16,367** golf clubs (facilities)
- **22,563** courses (individual courses at clubs)
- **94,648** tees (different tee options per course)
- Includes hole-by-hole par, handicap, and yardage data

### Database Schema
```
clubs (16k records)
├── courses (22k records)
│   ├── pars[] (array of 18 hole pars)
│   └── tees (94k records)
│       └── hole_lengths[], slopes, ratings
│
users
├── rounds (scores posted)
│   ├── reactions (emoji reactions)
│   └── comments
├── follows (who follows whom)
└── notifications
```

### Round URL System
Each round has a unique shareable URL using a 6-character short code:
- **Format**: `/rounds/ABC123` (instead of long UUIDs)
- **Character set**: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (excludes confusing characters)
- **Capacity**: 1+ billion unique combinations with 6 characters
- **Implementation**:
  - `short_code` column in rounds table
  - Auto-generated via PostgreSQL trigger on insert
  - Collision handling with retry logic
  - `getRoundByShortCode()` service method
  - SingleRound component for individual round display

## 🏗️ Technical Stack

### Backend
- **Database:** Supabase (PostgreSQL)
- **Auth:** Supabase Auth
- **Storage:** Supabase Storage (photos)
- **Realtime:** Supabase Realtime (live feed updates)

### Frontend (To Build)
- **Framework:** React 18 + Vite
- **Styling:** Tailwind CSS
- **State:** Zustand
- **Routing:** React Router
- **PWA:** Workbox

### Hosting
- **Frontend:** Vercel
- **Database:** Supabase Cloud
- **Domain:** dogleg.io (purchased)

### 🔐 Authentication Architecture

#### Production-Ready Session Management
Our auth system implements enterprise-grade session handling optimized for mobile browsers:

##### Smart Refocus Strategy
- **Token Expiry Awareness**: Tracks JWT expiration, only refreshes when token expires within 30 seconds
- **Stale Closure Prevention**: Uses `userRef` pattern to ensure event handlers always see current state
- **Cross-Version Compatibility**: Handles `expires_at` as both UNIX timestamp (number) and ISO string
- **Single Guard Pattern**: ProtectedRoute is the sole authentication guard (no duplicate checks)
- **Event-Driven Updates**: Relies on Supabase's `onAuthStateChange` as source of truth

##### Key Implementation Details
```javascript
// Smart refocus - only when actually needed
const rawExp = sessionExpRef.current
const expSec = typeof rawExp === 'number' ? rawExp : 
               typeof rawExp === 'string' ? new Date(rawExp).getTime()/1000 : null
const nearExpiry = expSec ? (expSec - now) <= 30 : !hasUser
if (hasUser && !nearExpiry) return // Skip unnecessary refresh

// Prevent stale closures in event handlers
const userRef = useRef(null)  // Always current
setUser(nextUser)
userRef.current = nextUser  // Keep in sync

// Smart loading states in ProtectedRoute
if (loading || (!user && rechecking)) showSpinner()
```

##### Browser Compatibility
- **Visibility API**: For tab focus/blur detection
- **PageShow Event**: Handles Safari/iOS back-forward cache
- **No Focus Event**: Avoided as it fires too frequently
- **Mobile Optimized**: No false logouts or unnecessary refreshes

##### Architecture Decisions
1. **userRef Pattern**: Event handlers in `useEffect(() => {}, [])` use refs to avoid stale state
2. **Token Threshold**: 30-second buffer before expiry triggers refresh
3. **Robust Parsing**: Defensive handling of different Supabase version formats
4. **Single Source of Truth**: Auth state listener, not getSession()
5. **Non-blocking Profile**: Profile loads async without blocking auth

#### Known Issues Resolved
- ✅ Tab switch doesn't cause logout
- ✅ No full refresh on quick tab switches  
- ✅ Ctrl+R doesn't cause infinite loading
- ✅ Mobile browser backgrounding handled properly
- ✅ Works with all Supabase client versions
- ✅ No race conditions from duplicate guards


## 📁 Project Structure

```
dogleg/
├── config/
│   └── app-config.js        # Central config (APP NAME HERE)
├── database/
│   ├── schema.sql           # Main database schema
│   └── schema-social.sql    # Social features schema
├── scripts/
│   ├── import-golf-data.js  # CSV import script
│   ├── package.json         # Dependencies
│   └── .env                 # Supabase keys (NEVER COMMIT)
├── admin/
│   └── index.html          # Admin upload interface
├── frontend/               # React app (TO BUILD)
│   ├── src/
│   └── public/
├── data/                   # CSV files (NEVER COMMIT)
│   ├── clubs.csv
│   ├── courses.csv
│   └── tees.csv
└── docs/
    └── README.md           # This file
```

## 🔑 Configuration & Credentials

### Supabase Project
- **Project Name:** dogleg (or dogleg-prod)
- **Region:** [Your selected region]
- **URL:** Stored in `.env`
- **Keys:** Stored in `.env`

### Environment Variables Required
```bash
# In /scripts/.env
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...  # Public key
SUPABASE_SERVICE_KEY=eyJ... # Admin key for imports

# In /frontend/.env
REACT_APP_SUPABASE_URL=https://xxxxx.supabase.co
REACT_APP_SUPABASE_ANON_KEY=eyJ...
```

## 📝 Current Progress

### ✅ Completed
- [x] Project structure created
- [x] Domain purchased (dogleg.io)
- [x] App configuration centralized
- [x] Database schema designed
- [x] Import scripts prepared
- [x] Individual round pages with shareable URLs
- [x] Short code system for clean URLs

### 🔄 In Progress
- [ ] Supabase project setup
- [ ] Database tables creation
- [ ] CSV data import

### 📋 Todo
- [ ] React app setup
- [ ] Authentication flow
- [ ] Course search component
- [ ] Score entry flow
- [ ] Social feed
- [ ] Reactions/comments
- [ ] User profiles
- [ ] PWA configuration
- [ ] Deploy to Vercel

## 🚀 Setup Instructions

### 1. Database Setup
```bash
# 1. Create Supabase project at supabase.com
# 2. Run /database/schema.sql in SQL Editor
# 3. Run /database/schema-social.sql in SQL Editor
```

### 2. Import Golf Course Data
```bash
cd scripts
npm install
# Add your keys to .env
npm run import
```

### 3. Create React App (When Ready)
```bash
npm create vite@latest frontend -- --template react
cd frontend
npm install @supabase/supabase-js zustand react-router-dom
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

### 4. Deploy
```bash
# Push to GitHub
git add .
git commit -m "Initial commit"
git push origin main

# Deploy to Vercel
# 1. Import GitHub repo to Vercel
# 2. Add environment variables
# 3. Deploy
```

## 🎨 Design Decisions

### Mobile-First UI
- Bottom navigation with prominent "+" button
- Touch-optimized controls
- Swipe gestures for navigation
- Pull-to-refresh on feeds
- Offline-first architecture

### Social Features
- Instagram-style feed
- Emoji reactions: 🔥👏🎯🐐🤮🤡💀😂
- Threaded comments
- Follow/follower system
- Activity notifications

### Privacy
- Rounds can be public or private
- Private rounds don't appear in feeds
- Users control who can follow them

## 🔄 Rebranding Strategy

The app name "Dogleg" can be easily changed:
1. Update `/config/app-config.js` (single source of truth)
2. Find/replace in documentation
3. Update external services (domain, Supabase project name)

## 📈 Growth Plan

### Phase 1: Alpha (Weeks 1-2)
- You + 10 friends testing
- Core features only
- Bug fixes

### Phase 2: Beta (Weeks 3-4)
- 50-100 users
- Local golf groups
- Feature refinement

### Phase 3: Launch (Month 2)
- ProductHunt launch
- Golf subreddit promotion
- Golf Facebook groups

### Future Monetization
- Premium features ($4.99/mo)
- Course partnerships
- Golf brand sponsorships

## 🛠️ Development Commands

```bash
# Import data
cd scripts && npm run import

# Start frontend dev
cd frontend && npm run dev

# Build for production
cd frontend && npm run build

# Run admin interface
cd admin && open index.html
```

## 📚 Key Files Reference

### Must Read First
1. `/config/app-config.js` - All app configuration
2. `/database/schema.sql` - Database structure
3. `/scripts/import-golf-data.js` - How data import works

### UI/UX Reference
1. `/docs/prototypes/mobile-score-entry.html` - Score entry flow
2. `/admin/index.html` - Admin dashboard

### Core Authentication Files
1. `/src/context/AuthContext.js` - Smart session management with refocus logic
2. `/src/components/ProtectedRoute.js` - Single auth guard for all routes
3. `/src/App.js` - Routes structure (no duplicate guards in AuthenticatedApp)

Key patterns to maintain:
- Event handlers use `userRef.current`, not `user` from closure
- `expires_at` parsing handles both number and string formats
- `rechecking` state properly propagates via useMemo dependencies
- Only ProtectedRoute redirects to /login


## 🚨 Important Notes

### Security
- NEVER commit `.env` files
- NEVER commit CSV data files
- Service keys are SECRET
- Anon keys are PUBLIC (safe for frontend)

### Data Updates
- CSVs can be re-uploaded anytime via admin interface
- Existing user data is preserved during updates
- IDs remain consistent

### Performance
- 22k courses require pagination
- Use PostgreSQL full-text search
- Cache frequently accessed data
- Lazy load images

### Authentication Best Practices
- **NEVER add auth checks in child components** - causes race conditions
- **Let ProtectedRoute handle all /login redirects** - single guard pattern
- **userRef.current for event handlers** - prevents stale closures
- **Token expiry tracked in sessionExpRef** - enables smart refresh
- **rechecking must be in useMemo deps** - prevents infinite loading
- **The 800ms fallback is a safety net** - auth events are primary

### Debugging Auth Issues
```javascript
// Temporary debug helper (add to kickRefocusRecheck)
console.log('Refocus check:', {
  hasUser: !!userRef.current,
  expiresAt: sessionExpRef.current,
  expiresType: typeof sessionExpRef.current,
  secondsUntilExpiry: expSec - now,
  willRefresh: !hasUser || nearExpiry
})
```



## 💬 AI Context for Future Chats

If starting a new chat, share:
1. This README file
2. `/config/app-config.js`
3. Current progress status
4. Specific file you're working on

Key context: "I'm building Dogleg, a social golf app like Instagram for golf. I have 22k courses in Supabase, need help with [specific feature]. Here's my README and current code..."

## 🔗 Resources

- **Supabase Docs:** https://supabase.com/docs
- **React Docs:** https://react.dev
- **Tailwind CSS:** https://tailwindcss.com
- **Vite:** https://vitejs.dev

## 📞 Contact

- **Domain:** dogleg.io
- **Email:** hello@dogleg.io (to set up)
- **GitHub:** [Your GitHub repo]

---

**Last Updated:** October 2025  
**Version:** 0.1.0 (Pre-Alpha)