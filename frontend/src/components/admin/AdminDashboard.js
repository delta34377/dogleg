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
const [selectedPeriod, setSelectedPeriod] = useState(30);
const [customDate, setCustomDate] = useState('');
const [dateRange, setDateRange] = useState({
  from: '',
  to: ''
});
const [useCustomDate, setUseCustomDate] = useState(false);
const [selectedTab, setSelectedTab] = useState('overview');
  

  // Check if user is admin
  useEffect(() => {
    if (user?.email !== 'markgreenfield1@gmail.com') {
      navigate('/');
    }
  }, [user, navigate]);

  // Load all data on mount and period change
  useEffect(() => {
  // Only load data on mount and when Apply is clicked (not on every state change)
  if (!useCustomDate) {
    loadDashboardData();
  }
}, [selectedPeriod]);

  const loadDashboardData = async () => {
  setLoading(true);
  try {
    let startDate, endDate;
    
    if (useCustomDate && dateRange.from && dateRange.to) {
      startDate = new Date(dateRange.from);
      endDate = new Date(dateRange.to);
    } else {
      endDate = new Date();
      startDate = new Date();
      startDate.setDate(startDate.getDate() - selectedPeriod);
    }
    
    const sqlStartDate = startDate.toISOString().split('T')[0];
    const sqlEndDate = endDate.toISOString().split('T')[0];
    
    console.log('Loading data from', sqlStartDate, 'to', sqlEndDate);
    
    // Overview stays the same
    const { data: overviewData } = await supabase
      .rpc('get_dashboard_overview');
    setOverview(overviewData);

    // Activity metrics already works with dates
    const { data: activityData } = await supabase
      .rpc('get_activity_metrics', {
        p_start_date: sqlStartDate,
        p_end_date: sqlEndDate
      });
    setActivityMetrics(activityData || []);

    // Use the new range-aware functions
    const { data: growthData } = await supabase
      .rpc('get_user_growth_metrics_range', {
        p_start_date: sqlStartDate,
        p_end_date: sqlEndDate
      });
    setUserGrowth(growthData || []);

    const { data: engagementData } = await supabase
      .rpc('get_engagement_metrics_range', {
        p_start_date: sqlStartDate,
        p_end_date: sqlEndDate
      });
    setEngagementMetrics(engagementData || []);

    // For the others that don't have range versions yet, 
    // calculate the day difference correctly
    const dayCount = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
    
    const { data: topRoundsData } = await supabase
      .rpc('get_top_rounds', {
        p_days: dayCount,
        p_limit: 10
      });
    
    // Filter top rounds to only show those within the date range
    const filteredTopRounds = topRoundsData?.filter(round => {
      const roundDate = new Date(round.posted_at);
      return roundDate >= startDate && roundDate <= endDate;
    }) || [];
    setTopRounds(filteredTopRounds);

    const { data: emojiData } = await supabase
      .rpc('get_emoji_breakdown', { p_days: dayCount });
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
<div className="flex items-center gap-2 flex-wrap">
  <label className="text-sm text-gray-600">Period:</label>
  <select
    value={useCustomDate ? 'custom' : selectedPeriod}
    onChange={(e) => {
      if (e.target.value === 'custom') {
        // Set custom mode but DON'T load data yet
        setUseCustomDate(true);
        // Pre-fill with last 30 days as default
        const from = new Date();
        const to = new Date();
        from.setDate(from.getDate() - 30);
        setDateRange({
          from: from.toISOString().split('T')[0],
          to: to.toISOString().split('T')[0]
        });
      } else {
        // Preset period - load immediately
        setUseCustomDate(false);
        setSelectedPeriod(Number(e.target.value));
      }
    }}
    className="px-3 py-1 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
  >
    <option value={7}>Last 7 days</option>
    <option value={14}>Last 14 days</option>
    <option value={30}>Last 30 days</option>
    <option value={60}>Last 60 days</option>
    <option value={90}>Last 90 days</option>
    <option value={365}>Last year</option>
    <option value="custom">Custom Range</option>
  </select>
  
  {useCustomDate && (
    <>
      <div className="flex items-center gap-2 bg-gray-50 p-2 rounded-lg">
        <label className="text-sm text-gray-600">From:</label>
        <input
          type="date"
          value={dateRange.from}
          onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
          max={dateRange.to || new Date().toISOString().split('T')[0]}
          className="px-2 py-1 border rounded focus:outline-none focus:ring-2 focus:ring-green-500"
        />
        <label className="text-sm text-gray-600">To:</label>
        <input
          type="date"
          value={dateRange.to}
          onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
          min={dateRange.from}
          max={new Date().toISOString().split('T')[0]}
          className="px-2 py-1 border rounded focus:outline-none focus:ring-2 focus:ring-green-500"
        />
        <button
          onClick={() => loadDashboardData()}
          className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm font-medium"
        >
          Apply
        </button>
        <button
          onClick={() => {
            setUseCustomDate(false);
            setSelectedPeriod(30);
          }}
          className="px-3 py-1 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 text-sm"
        >
          Cancel
        </button>
      </div>
      
      {/* Quick presets */}
      <div className="flex gap-2 text-xs ml-2">
        <button
          onClick={() => {
            const from = new Date();
            const to = new Date();
            from.setDate(from.getDate() - 7);
            setDateRange({
              from: from.toISOString().split('T')[0],
              to: to.toISOString().split('T')[0]
            });
          }}
          className="px-2 py-1 bg-gray-100 rounded hover:bg-gray-200"
        >
          Last week
        </button>
        <button
          onClick={() => {
            const from = new Date();
            const to = new Date();
            from.setMonth(from.getMonth() - 1);
            setDateRange({
              from: from.toISOString().split('T')[0],
              to: to.toISOString().split('T')[0]
            });
          }}
          className="px-2 py-1 bg-gray-100 rounded hover:bg-gray-200"
        >
          Last month
        </button>
        <button
          onClick={() => {
            setDateRange({
              from: '2024-10-01', // Your launch date
              to: new Date().toISOString().split('T')[0]
            });
          }}
          className="px-2 py-1 bg-gray-100 rounded hover:bg-gray-200"
        >
          Since launch
        </button>
      </div>
    </>
  )}
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
                      tickFormatter={(date) => {
  // Force local timezone interpretation by adding noon time
  const d = new Date(date + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}}
                    />
                    <YAxis />
                    <Tooltip 
                      labelFormatter={(date) => new Date(date + 'T12:00:00').toLocaleDateString()}
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
                    tickFormatter={(date) => {
  // Force local timezone interpretation by adding noon time
  const d = new Date(date + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}}
                  />
                  <YAxis />
                  <Tooltip 
                    labelFormatter={(date) => new Date(date + 'T12:00:00').toLocaleDateString()}
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
                    tickFormatter={(date) => {
  // Force local timezone interpretation by adding noon time
  const d = new Date(date + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}}
                  />
                  <YAxis />
                  <Tooltip 
                    labelFormatter={(date) => new Date(date + 'T12:00:00').toLocaleDateString()}
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
                    tickFormatter={(date) => {
  // Force local timezone interpretation by adding noon time
  const d = new Date(date + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}}
                  />
                  <YAxis />
                  <Tooltip 
                    labelFormatter={(date) => new Date(date + 'T12:00:00').toLocaleDateString()}
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
                    tickFormatter={(date) => {
  // Force local timezone interpretation by adding noon time
  const d = new Date(date + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}}
                  />
                  <YAxis />
                  <Tooltip 
                    labelFormatter={(date) => new Date(date + 'T12:00:00').toLocaleDateString()}
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
                    tickFormatter={(date) => {
  // Force local timezone interpretation by adding noon time
  const d = new Date(date + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}}
                  />
                  <YAxis />
                  <Tooltip 
                    labelFormatter={(date) => new Date(date + 'T12:00:00').toLocaleDateString()}

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
