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
- ✅ Smart Blended Feed with discovery content
- ✅ Discovery indicators on feed cards
- ✅ Deployed to Vercel (production environment)
- ✅ Git/GitHub repository setup with auto-deploy
- ✅ Mobile PWA fully functional
- ✅ **Production-ready authentication system** 
  - Smart tab focus handling with token expiry awareness
  - Fixed stale closure bug in event handlers using userRef pattern
  - Robust expires_at parsing for cross-Supabase-version compatibility
  - Single-guard architecture (removed duplicate guards from AuthenticatedApp)
  - Optimized refocus logic - only refreshes when token expires <30s
  - No false logouts on mobile tab switches
  - No full-page refreshes on quick tab switches
  - Ctrl+R works without infinite loading
  - Handles iOS Safari back/forward cache
  - Fixed React useMemo dependencies for rechecking state
  - ✅ **Shareable Round URLs**
  - Short code system (6-character alphanumeric codes)
  - SingleRound component at route `/rounds/:shortCode`
  - Share button functionality with native share API
  - Automatic short code generation for new rounds
  - Database column `short_code` with unique constraint
  - Service method `getRoundByShortCode` in roundsService
  - ✅ **Admin Panel for Feed Algorithm**
  - Adjustable discovery ratio
  - Mode selection (mixed/following/discover only)
  - Scoring weight controls
  - Settings persist in localStorage
- ✅ **3-dots menu system** - Expandable menus for future options
- ✅ **Consistent round counting** - All pages use actual rounds table
- ✅ **Fixed profile stats** - Accurate follower/following counts
- ✅ **Admin Analytics Dashboard (Phase 1)**
  - Multi-tab analytics dashboard at `/admin/*`
  - Activity tracking via PostgreSQL triggers
  - User growth and retention metrics
  - Engagement analytics with time series charts
  - Top performing content identification
  - Custom date range selection
  - Retroactive data analysis of all existing content
  - User segmentation (power_user, active, casual, dormant)
  - Session tracking and page view analytics
  - Admin hub with navigation between tools
  - ✅ **Content Moderation Dashboard (Admin Phase 2)**
  - Full moderation panel at `/admin/moderation`
  - User management with sortable columns
  - Content deletion (rounds, comments, user's all content)
  - Soft delete system (content marked deleted but retained)
  - Search and filter across users, comments, rounds
  - Pagination with customizable page sizes
  - Delete confirmations with modals
  - Admin-only access (markgreenfield1@gmail.com)
  - SQL RPC functions for all moderation actions
  - Follower count auto-updating via database triggers
  - Fixed feed to exclude soft-deleted content
  - 3-dot dropdown menus for user actions
  - Clear search functionality with visible button
  - Force page reload after deletions to clear caches


## 🔄 Currently Working On
- Live in production at vercel app URL
- Monitoring user engagement with discovery content

## Next Steps
- Add user discovery ("Find Golfers to Follow")
- Add following/followers functionality
- Push notifications
- Offline support (PWA)

## 🎯 Current Decisions

### 📊 Feed Algorithm Details
- **Function**: `get_feed_with_discovery` (PostgreSQL RPC)
- **Mix**: 70% following, 30% discovery
- **Discovery Sources**: 
  - Rounds from courses/clubs user has played
  - Popular rounds (high engagement)
- **Ranking**: Time-decay scoring with engagement weight
- **No user location required** - uses course locations instead
### 🔊 Feed Algorithm Details
- **Function**: `get_feed_with_discovery` (PostgreSQL RPC)
- **Mix**: Adjustable via admin panel (default 70% following, 30% discovery)
- **Discovery Sources**: 
  - Rounds from courses/clubs user has played
  - Popular rounds (adjustable thresholds via admin)
- **Ranking**: Adjustable weights via admin panel
- **Modes**: mixed, following-only, discovery-only
- **Admin Panel**: `/admin` route for algorithm tweaking

## Authentication Architecture
- **Smart Refocus Logic**: Only refreshes session when token expires within 30 seconds
- **userRef Pattern**: Prevents stale closures in event handlers
- **Robust Parsing**: Handles expires_at as both UNIX timestamp and ISO string
- **Single Guard Pattern**: ProtectedRoute is the only authentication guard
- **Event Selection**: visibilitychange + pageshow (not focus - fires too often)

## 📊 Analytics Implementation Details
- **Tech Stack**: Recharts for visualizations, Supabase RPC functions
- **Performance**: All metrics calculated via SQL, minimal frontend processing
- **Tracking Method**: Database triggers (no JavaScript tracking needed)
- **Data Retention**: All historical data preserved
- **Admin Access**: Restricted to markgreenfield1@gmail.com via RLS policies


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
### Authentication Technical Notes
- **Token Expiry Tracking**: sessionExpRef stores expires_at, checked on refocus
- **Stale Closure Prevention**: userRef.current always has current user state
- **Cross-Version Compatibility**: Handles both number and string expires_at formats
- **Performance**: No unnecessary getSession() calls on quick tab switches
- **React Best Practices**: Proper useMemo dependencies, cleanup in useEffect
- **Mobile Optimization**: Visibility API + pageshow for all browser scenarios


## ❌ Blockers
- None currently

## 📝 Notes for Next Session
- Need to build React components

## Supabase Details
- Project URL: [saved in .env]
- Project Name: dogleg
- Project URL: https://egnnjhlbnlhvudgopzvq.supabase.co
- Auth configured with Google OAuth
### Supabase Auth Configuration
- Session expiry tracked and refreshed intelligently
- Handles different expires_at formats across Supabase versions
- Auth state listener as primary source of truth
- Google OAuth configured with select_account prompt
- Password reset flow with proper redirects
