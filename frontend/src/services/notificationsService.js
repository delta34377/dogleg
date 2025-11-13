// src/services/notificationsService.js
import { supabase } from './supabase';

export const notificationsService = {
  // Fetch recent notifications
  async getNotifications(limit = 50) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const { data, error } = await supabase
      .from('notifications')
      .select(`
        *,
        actor:profiles!notifications_actor_id_fkey(
          id,
          username,
          full_name,
          avatar_url
        ),
        round:rounds(
          id,
          short_code,
          course_name,
          total_score
        )
      `)
      .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) {
      console.error('Error fetching notifications:', error);
      return { data: [], error };
    }
    
    return { data, error: null };
  },

  // Check if user has new notifications
  async hasNewNotifications() {
    const { data: profile } = await supabase
      .from('profiles')
      .select('last_notifications_check')
      .eq('id', (await supabase.auth.getUser()).data.user?.id)
      .single();
    
    if (!profile) return false;
    
    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
      .gt('created_at', profile.last_notifications_check || new Date(0).toISOString());
    
    return count > 0;
  },

  // Mark notifications as checked (updates last_notifications_check)
  async markAsChecked() {
    const { error } = await supabase.rpc('mark_notifications_checked');
    return !error;
  }
};