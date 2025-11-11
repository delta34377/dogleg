// AdminHub.js - Main admin navigation hub
import { useEffect } from 'react';
import { useNavigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { BarChart3, Sliders, Home, TrendingUp, Users, FileText } from 'lucide-react';

const AdminHub = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  // Check if user is admin
  useEffect(() => {
    if (user?.email !== 'markgreenfield1@gmail.com') {
      navigate('/');
    }
  }, [user, navigate]);

  // Determine active tab based on current path
  const getActiveTab = () => {
    const path = location.pathname;
    if (path === '/admin') return 'overview';
    if (path.includes('/admin/analytics')) return 'analytics';
    if (path.includes('/admin/feed-algorithm')) return 'feed';
    return 'overview';
  };

  const activeTab = getActiveTab();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
              <p className="text-sm text-gray-500">Dogleg Analytics & Controls</p>
            </div>
            <button 
              onClick={() => navigate('/')}
              className="px-4 py-2 text-gray-600 hover:text-gray-900 font-medium"
            >
              ← Back to App
            </button>
          </div>
          
          {/* Navigation tabs */}
          <div className="flex gap-1 sm:gap-6 border-b -mb-px overflow-x-auto">
            <button
              onClick={() => navigate('/admin')}
              className={`px-4 py-3 border-b-2 font-medium transition-colors flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'overview' 
                  ? 'border-green-600 text-green-600' 
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              <Home className="w-4 h-4" />
              <span className="hidden sm:inline">Overview</span>
            </button>
            
            <button
              onClick={() => navigate('/admin/analytics')}
              className={`px-4 py-3 border-b-2 font-medium transition-colors flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'analytics' 
                  ? 'border-green-600 text-green-600' 
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span className="hidden sm:inline">Analytics</span>
            </button>
            
            <button
              onClick={() => navigate('/admin/feed-algorithm')}
              className={`px-4 py-3 border-b-2 font-medium transition-colors flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'feed' 
                  ? 'border-green-600 text-green-600' 
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              <Sliders className="w-4 h-4" />
              <span className="hidden sm:inline">Feed Algorithm</span>
            </button>
          </div>
        </div>
      </div>
      
      {/* Child route content renders here */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </div>
    </div>
  );
};

export default AdminHub;
