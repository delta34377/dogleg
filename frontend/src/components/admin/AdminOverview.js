// AdminOverview.js - Landing page for /admin route
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { 
  BarChart3, Sliders, Users, Activity, Target, Heart,
  TrendingUp, Calendar, Award, Globe
} from 'lucide-react';

const AdminOverview = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadQuickStats();
  }, []);

  const loadQuickStats = async () => {
    try {
      // Get basic stats from the dashboard overview function
      const { data } = await supabase.rpc('get_dashboard_overview');
      setStats(data);
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num?.toString() || '0';
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="text-xl text-gray-600">Loading admin dashboard...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="bg-gradient-to-r from-green-600 to-green-700 rounded-lg p-6 text-white">
        <h2 className="text-2xl font-bold mb-2">Welcome to Admin Dashboard</h2>
        <p className="opacity-90">
          Monitor your app's performance, manage user engagement, and control feed algorithms all in one place.
        </p>
      </div>

      {/* Quick Stats Grid */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <QuickStatCard
            title="Total Users"
            value={formatNumber(stats.total_users)}
            subtitle={`+${stats.new_users_today} today`}
            icon={<Users className="w-5 h-5" />}
            color="blue"
          />
          <QuickStatCard
            title="Total Rounds"
            value={formatNumber(stats.total_rounds)}
            subtitle={`+${stats.rounds_today} today`}
            icon={<Target className="w-5 h-5" />}
            color="green"
          />
          <QuickStatCard
            title="Active Today"
            value={stats.active_users_today}
            subtitle={`${(stats.engagement_rate_today * 100).toFixed(1)}% engagement`}
            icon={<Activity className="w-5 h-5" />}
            color="purple"
          />
          <QuickStatCard
            title="Total Reactions"
            value={formatNumber(stats.total_reactions)}
            subtitle={`${formatNumber(stats.total_comments)} comments`}
            icon={<Heart className="w-5 h-5" />}
            color="red"
          />
        </div>
      )}

      {/* Admin Tools Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Analytics Tool */}
        <div 
          onClick={() => navigate('/admin/analytics')}
          className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow cursor-pointer p-6 border border-gray-200"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="p-3 bg-blue-100 rounded-lg">
              <BarChart3 className="w-6 h-6 text-blue-600" />
            </div>
            <span className="text-sm text-gray-500">Full Dashboard →</span>
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">Analytics Dashboard</h3>
          <p className="text-gray-600 mb-4">
            Deep dive into user behavior, engagement metrics, and growth trends with interactive charts.
          </p>
          <div className="space-y-2">
            <div className="flex items-center text-sm text-gray-600">
              <TrendingUp className="w-4 h-4 mr-2 text-green-500" />
              User growth & retention metrics
            </div>
            <div className="flex items-center text-sm text-gray-600">
              <Award className="w-4 h-4 mr-2 text-yellow-500" />
              Top performing content
            </div>
            <div className="flex items-center text-sm text-gray-600">
              <Calendar className="w-4 h-4 mr-2 text-blue-500" />
              Historical data analysis
            </div>
          </div>
        </div>

        {/* Feed Algorithm Tool */}
        <div 
          onClick={() => navigate('/admin/feed-algorithm')}
          className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow cursor-pointer p-6 border border-gray-200"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="p-3 bg-green-100 rounded-lg">
              <Sliders className="w-6 h-6 text-green-600" />
            </div>
            <span className="text-sm text-gray-500">Configure →</span>
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">Feed Algorithm Controls</h3>
          <p className="text-gray-600 mb-4">
            Fine-tune the feed algorithm with real-time adjustments to discovery ratio and scoring weights.
          </p>
          <div className="space-y-2">
            <div className="flex items-center text-sm text-gray-600">
              <Globe className="w-4 h-4 mr-2 text-purple-500" />
              Discovery ratio control
            </div>
            <div className="flex items-center text-sm text-gray-600">
              <Activity className="w-4 h-4 mr-2 text-orange-500" />
              Engagement weight tuning
            </div>
            <div className="flex items-center text-sm text-gray-600">
              <Target className="w-4 h-4 mr-2 text-red-500" />
              Popular content thresholds
            </div>
          </div>
        </div>
      </div>

      {/* Coming Soon Section */}
      <div className="bg-gray-50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Coming in Future Phases</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ComingSoonCard 
            title="User Management" 
            description="Search, filter, and moderate user accounts"
            phase="Phase 4"
          />
          <ComingSoonCard 
            title="Content Moderation" 
            description="Review and manage user-generated content"
            phase="Phase 4"
          />
          <ComingSoonCard 
            title="Real-time Monitoring" 
            description="Live activity feeds and alerts"
            phase="Phase 5"
          />
        </div>
      </div>
    </div>
  );
};

// Quick Stat Card Component
const QuickStatCard = ({ title, value, subtitle, icon, color }) => {
  const colorClasses = {
    blue: 'text-blue-600 bg-blue-100',
    green: 'text-green-600 bg-green-100',
    purple: 'text-purple-600 bg-purple-100',
    red: 'text-red-600 bg-red-100'
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-600">{title}</span>
        <span className={`p-2 rounded-lg ${colorClasses[color]}`}>{icon}</span>
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-sm text-gray-500 mt-1">{subtitle}</div>
    </div>
  );
};

// Coming Soon Card Component
const ComingSoonCard = ({ title, description, phase }) => (
  <div className="bg-white p-4 rounded-lg border border-gray-200">
    <div className="flex items-center justify-between mb-2">
      <h4 className="font-semibold text-gray-900">{title}</h4>
      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">{phase}</span>
    </div>
    <p className="text-sm text-gray-600">{description}</p>
  </div>
);

export default AdminOverview;
