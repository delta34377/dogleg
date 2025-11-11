// analyticsService.js - Service layer for analytics functionality
import { supabase } from './supabase';

export const analyticsService = {
  // Track user events
  trackEvent: async (eventType, eventData = {}) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('analytics_events')
        .insert({
          user_id: user?.id,
          event_type: eventType,
          event_data: eventData,
          session_id: sessionStorage.getItem('session_id') || generateSessionId()
        });
      
      if (error) console.error('Error tracking event:', error);
    } catch (error) {
      console.error('Error in trackEvent:', error);
    }
  },

  // Track page views
  trackPageView: async (pageName, pageData = {}) => {
    await analyticsService.trackEvent('page_view', {
      page: pageName,
      ...pageData
    });
  },

  // Session management
  startSession: () => {
    const sessionId = generateSessionId();
    sessionStorage.setItem('session_id', sessionId);
    sessionStorage.setItem('session_start', Date.now().toString());
    
    // Track session start
    supabase.from('analytics_sessions')
      .insert({
        id: sessionId,
        user_id: supabase.auth.getUser()?.id,
        started_at: new Date().toISOString(),
        device_info: {
          userAgent: navigator.userAgent,
          screen: `${window.screen.width}x${window.screen.height}`,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          platform: navigator.platform
        }
      })
      .then(() => {})
      .catch(console.error);
    
    return sessionId;
  },

  // End session tracking
  endSession: async () => {
    const sessionId = sessionStorage.getItem('session_id');
    const sessionStart = parseInt(sessionStorage.getItem('session_start') || '0');
    
    if (sessionId && sessionStart) {
      const duration = Math.floor((Date.now() - sessionStart) / 1000);
      
      await supabase
        .from('analytics_sessions')
        .update({
          ended_at: new Date().toISOString(),
          duration_seconds: duration
        })
        .eq('id', sessionId);
    }
  },

  // Dashboard functions
  getDashboardOverview: async () => {
    const { data, error } = await supabase.rpc('get_dashboard_overview');
    return { data, error };
  },

  getActivityMetrics: async (startDate, endDate) => {
    const { data, error } = await supabase.rpc('get_activity_metrics', {
      p_start_date: startDate,
      p_end_date: endDate
    });
    return { data, error };
  },

  getUserGrowthMetrics: async (days = 30) => {
    const { data, error } = await supabase.rpc('get_user_growth_metrics', {
      p_days: days
    });
    return { data, error };
  },

  getEngagementMetrics: async (days = 30) => {
    const { data, error } = await supabase.rpc('get_engagement_metrics', {
      p_days: days
    });
    return { data, error };
  },

  getTopRounds: async (days = 7, limit = 10) => {
    const { data, error } = await supabase.rpc('get_top_rounds', {
      p_days: days,
      p_limit: limit
    });
    return { data, error };
  },

  getEmojiBreakdown: async (days = 30) => {
    const { data, error } = await supabase.rpc('get_emoji_breakdown', {
      p_days: days
    });
    return { data, error };
  },

  // Get user segments (for Phase 2)
  getUserSegments: async () => {
    const { data, error } = await supabase
      .from('analytics_user_metrics')
      .select('user_segment')
      .then(result => {
        if (result.error) return { data: null, error: result.error };
        
        // Count users in each segment
        const segments = result.data.reduce((acc, user) => {
          const segment = user.user_segment || 'unknown';
          acc[segment] = (acc[segment] || 0) + 1;
          return acc;
        }, {});
        
        return {
          data: Object.entries(segments).map(([name, count]) => ({
            segment: name,
            count
          })),
          error: null
        };
      });
    
    return { data, error };
  },

  // Get power users (for Phase 2)
  getPowerUsers: async (limit = 20) => {
    const { data, error } = await supabase
      .from('analytics_user_metrics')
      .select(`
        user_id,
        total_rounds,
        total_reactions_given,
        total_comments_made,
        engagement_score,
        user_segment,
        profiles!inner(username, full_name, avatar_url)
      `)
      .order('engagement_score', { ascending: false })
      .limit(limit);
    
    return { data, error };
  },

  // Get activity heat map data (for Phase 3)
  getActivityHeatMap: async (days = 7) => {
    const { data, error } = await supabase
      .from('analytics_events')
      .select('created_at, event_type')
      .gte('created_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
      .then(result => {
        if (result.error) return { data: null, error: result.error };
        
        // Process into hourly buckets
        const heatmap = {};
        result.data.forEach(event => {
          const date = new Date(event.created_at);
          const hour = date.getHours();
          const day = date.getDay();
          const key = `${day}-${hour}`;
          heatmap[key] = (heatmap[key] || 0) + 1;
        });
        
        return { data: heatmap, error: null };
      });
    
    return { data, error };
  },

  // Get course analytics (for Phase 3)
  getCourseAnalytics: async (limit = 20) => {
    const { data, error } = await supabase
      .from('rounds')
      .select('course_id, course_name, club_name, total_score')
      .then(result => {
        if (result.error) return { data: null, error: result.error };
        
        // Aggregate by course
        const courses = {};
        result.data.forEach(round => {
          const key = round.course_id;
          if (!courses[key]) {
            courses[key] = {
              course_id: key,
              course_name: round.course_name,
              club_name: round.club_name,
              rounds_played: 0,
              total_score: 0,
              scores: []
            };
          }
          courses[key].rounds_played++;
          courses[key].total_score += round.total_score;
          courses[key].scores.push(round.total_score);
        });
        
        // Calculate averages and sort
        const courseList = Object.values(courses)
          .map(course => ({
            ...course,
            avg_score: course.total_score / course.rounds_played,
            min_score: Math.min(...course.scores),
            max_score: Math.max(...course.scores)
          }))
          .sort((a, b) => b.rounds_played - a.rounds_played)
          .slice(0, limit);
        
        return { data: courseList, error: null };
      });
    
    return { data, error };
  },

  // Update user segments (scheduled job for Phase 5)
  updateUserSegments: async () => {
    const { data, error } = await supabase.rpc('update_user_segments');
    return { data, error };
  }
};

// Helper function to generate session ID
function generateSessionId() {
  return `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

// Auto-start session on load
if (typeof window !== 'undefined' && !sessionStorage.getItem('session_id')) {
  analyticsService.startSession();
}

// Auto-end session on unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    analyticsService.endSession();
  });
}

export default analyticsService;
