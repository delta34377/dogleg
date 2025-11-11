// AdminDashboard.js - Main admin dashboard component
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../context/AuthContext';
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import { 
  TrendingUp, TrendingDown, Users, Activity, 
  MessageSquare, Heart, Camera, Target,
  Calendar, Clock, BarChart3, PieChartIcon
} from 'lucide-react';

const AdminDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // State for all metrics
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState(null);
  const [activityMetrics, setActivityMetrics] = useState([]);
  const [userGrowth, setUserGrowth] = useState([]);
  const [engagementMetrics, setEngagementMetrics] = useState([]);
  const [topRounds, setTopRounds] = useState([]);
  const [emojiBreakdown, setEmojiBreakdown] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState(30); // days
  const [selectedTab, setSelectedTab] = useState('overview');

  // Check if user is admin
  useEffect(() => {
    if (user?.email !== 'markgreenfield1@gmail.com') {
      navigate('/');
    }
  }, [user, navigate]);

  // Load all data on mount and period change
  useEffect(() => {
    loadDashboardData();
  }, [selectedPeriod]);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      // Load overview
      const { data: overviewData } = await supabase
        .rpc('get_dashboard_overview');
      setOverview(overviewData);

      // Load activity metrics
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - selectedPeriod);
      
      const { data: activityData } = await supabase
        .rpc('get_activity_metrics', {
          p_start_date: startDate.toISOString().split('T')[0],
          p_end_date: new Date().toISOString().split('T')[0]
        });
      setActivityMetrics(activityData || []);

      // Load user growth metrics
      const { data: growthData } = await supabase
        .rpc('get_user_growth_metrics', {
          p_days: selectedPeriod
        });
      setUserGrowth(growthData || []);

      // Load engagement metrics
      const { data: engagementData } = await supabase
        .rpc('get_engagement_metrics', {
          p_days: selectedPeriod
        });
      setEngagementMetrics(engagementData || []);

      // Load top rounds
      const { data: topRoundsData } = await supabase
        .rpc('get_top_rounds', {
          p_days: selectedPeriod === 30 ? 7 : selectedPeriod,
          p_limit: 10
        });
      setTopRounds(topRoundsData || []);

      // Load emoji breakdown
      const { data: emojiData } = await supabase
  .rpc('get_emoji_breakdown', selectedPeriod ? { p_days: selectedPeriod } : {});

      setEmojiBreakdown(emojiData || []);

    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Format numbers for display
  const formatNumber = (num) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num?.toString() || '0';
  };

  // Calculate percentage change
  const calculateChange = (current, previous) => {
    if (!previous || previous === 0) return 0;
    return ((current - previous) / previous * 100).toFixed(1);
  };

  // Emoji mapping
  const emojiMap = {
    fire: '🔥',
    clap: '👏',
    dart: '🎯',
    goat: '🐐',
    vomit: '🤮',
    clown: '🤡',
    skull: '💀',
    laugh: '😂'
  };

  // Colors for charts
  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-xl">Loading analytics...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
              <p className="text-sm text-gray-500">Analytics & Insights</p>
            </div>
            
            {/* Period Selector */}
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Period:</label>
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(Number(e.target.value))}
                className="px-3 py-1 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value={7}>Last 7 days</option>
                <option value={14}>Last 14 days</option>
                <option value={30}>Last 30 days</option>
                <option value={60}>Last 60 days</option>
                <option value={90}>Last 90 days</option>
              </select>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex gap-4 border-b">
            {['overview', 'activity', 'engagement', 'users', 'content'].map((tab) => (
              <button
                key={tab}
                onClick={() => setSelectedTab(tab)}
                className={`px-4 py-2 capitalize font-medium transition-colors ${
                  selectedTab === tab
                    ? 'text-green-600 border-b-2 border-green-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Overview Tab */}
        {selectedTab === 'overview' && overview && (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="Total Users"
                value={formatNumber(overview.total_users)}
                change={`+${overview.new_users_today} today`}
                icon={<Users className="w-5 h-5" />}
                trend="up"
              />
              <StatCard
                title="Total Rounds"
                value={formatNumber(overview.total_rounds)}
                change={`+${overview.rounds_today} today`}
                icon={<Target className="w-5 h-5" />}
                trend="up"
              />
              <StatCard
                title="Active Today"
                value={overview.active_users_today}
                change={`${(overview.engagement_rate_today * 100).toFixed(1)}% engaged`}
                icon={<Activity className="w-5 h-5" />}
                trend="neutral"
              />
              <StatCard
                title="Total Reactions"
                value={formatNumber(overview.total_reactions)}
                change={`${formatNumber(overview.total_comments)} comments`}
                icon={<Heart className="w-5 h-5" />}
                trend="up"
              />
            </div>

            {/* Quick Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* User Growth Chart */}
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-lg font-semibold mb-4">User Growth</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={userGrowth}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(date) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    />
                    <YAxis />
                    <Tooltip 
                      labelFormatter={(date) => new Date(date).toLocaleDateString()}
                      formatter={(value) => formatNumber(value)}
                    />
                    <Area type="monotone" dataKey="total_users" stroke="#10b981" fill="#10b981" fillOpacity={0.3} />
                    <Area type="monotone" dataKey="dau" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Emoji Breakdown */}
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-lg font-semibold mb-4">Reaction Types</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={emojiBreakdown}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ emoji_type, percentage }) => `${emojiMap[emoji_type]} ${percentage}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="usage_count"
                    >
                      {emojiBreakdown.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatNumber(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* Activity Tab */}
        {selectedTab === 'activity' && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-semibold mb-4">Daily Activity Metrics</h3>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={activityMetrics}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(date) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  />
                  <YAxis />
                  <Tooltip 
                    labelFormatter={(date) => new Date(date).toLocaleDateString()}
                    formatter={(value) => formatNumber(value)}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="active_users" stroke="#10b981" name="Active Users" />
                  <Line type="monotone" dataKey="rounds_posted" stroke="#3b82f6" name="Rounds" />
                  <Line type="monotone" dataKey="reactions_given" stroke="#f59e0b" name="Reactions" />
                  <Line type="monotone" dataKey="comments_made" stroke="#ef4444" name="Comments" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Activity Heatmap would go here in Phase 3 */}
          </div>
        )}

        {/* Engagement Tab */}
        {selectedTab === 'engagement' && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-semibold mb-4">Engagement Trends</h3>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={engagementMetrics}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(date) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  />
                  <YAxis />
                  <Tooltip 
                    labelFormatter={(date) => new Date(date).toLocaleDateString()}
                    formatter={(value) => typeof value === 'number' ? value.toFixed(2) : value}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="avg_reactions_per_round" stroke="#10b981" name="Avg Reactions/Round" />
                  <Line type="monotone" dataKey="avg_comments_per_round" stroke="#3b82f6" name="Avg Comments/Round" />
                  <Line type="monotone" dataKey="engagement_rate" stroke="#f59e0b" name="Engagement Rate" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Top Performing Content */}
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-semibold mb-4">Top Performing Rounds</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Course</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Score</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Reactions</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Comments</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Engagement</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Posted</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {topRounds.map((round) => (
                      <tr key={round.round_id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-sm">@{round.username}</td>
                        <td className="px-4 py-2 text-sm truncate max-w-xs">{round.course_name}</td>
                        <td className="px-4 py-2 text-sm">{round.total_score}</td>
                        <td className="px-4 py-2 text-sm">{round.reaction_count}</td>
                        <td className="px-4 py-2 text-sm">{round.comment_count}</td>
                        <td className="px-4 py-2 text-sm font-semibold">{round.engagement_score.toFixed(1)}</td>
                        <td className="px-4 py-2 text-sm">
                          {new Date(round.posted_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Users Tab */}
        {selectedTab === 'users' && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-semibold mb-4">User Growth & Retention</h3>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={userGrowth}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(date) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  />
                  <YAxis />
                  <Tooltip 
                    labelFormatter={(date) => new Date(date).toLocaleDateString()}
                    formatter={(value) => formatNumber(value)}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="new_users" stroke="#10b981" name="New Users" />
                  <Line type="monotone" dataKey="dau" stroke="#3b82f6" name="DAU" />
                  <Line type="monotone" dataKey="wau" stroke="#f59e0b" name="WAU" />
                  <Line type="monotone" dataKey="mau" stroke="#ef4444" name="MAU" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* User Segments would go here in Phase 2 */}
          </div>
        )}

        {/* Content Tab */}
        {selectedTab === 'content' && (
          <div className="space-y-6">
            {/* Photo Usage */}
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-semibold mb-4">Content Quality Metrics</h3>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={engagementMetrics}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(date) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  />
                  <YAxis />
                  <Tooltip 
                    labelFormatter={(date) => new Date(date).toLocaleDateString()}
                    formatter={(value) => `${value?.toFixed(1)}%`}
                  />
                  <Legend />
                  <Area 
                    type="monotone" 
                    dataKey="rounds_with_photo_pct" 
                    stroke="#10b981" 
                    fill="#10b981" 
                    fillOpacity={0.3}
                    name="% Rounds with Photos"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Viral Content */}
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-semibold mb-4">Viral Content Detection</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={engagementMetrics}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(date) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  />
                  <YAxis />
                  <Tooltip 
                    labelFormatter={(date) => new Date(date).toLocaleDateString()}
                  />
                  <Bar dataKey="viral_rounds_count" fill="#f59e0b" name="Viral Rounds (5+ reactions)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Stat Card Component
const StatCard = ({ title, value, change, icon, trend }) => {
  const trendColors = {
    up: 'text-green-600',
    down: 'text-red-600',
    neutral: 'text-gray-600'
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-600">{title}</span>
        <span className="text-gray-400">{icon}</span>
      </div>
      <div className="flex items-baseline justify-between">
        <span className="text-2xl font-bold text-gray-900">{value}</span>
        <span className={`text-sm ${trendColors[trend]}`}>{change}</span>
      </div>
    </div>
  );
};

export default AdminDashboard;
