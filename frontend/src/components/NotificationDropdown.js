// src/components/NotificationDropdown.js
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { notificationsService } from '../services/notificationsService';
import { followService } from '../services/followService';
import { useAuth } from '../context/AuthContext';
import { getInitials } from '../utils/avatarUtils';

const NotificationDropdown = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasNew, setHasNew] = useState(false);
  const [followStatuses, setFollowStatuses] = useState({});
  const dropdownRef = useRef(null);
  const navigate = useNavigate();
  const { user } = useAuth();

  // Check for new notifications on mount and periodically
  useEffect(() => {
    checkForNew();
    // Check every 30 seconds
    const interval = setInterval(checkForNew, 30000);
    return () => clearInterval(interval);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const checkForNew = async () => {
    const hasNewNotifs = await notificationsService.hasNewNotifications();
    setHasNew(hasNewNotifs);
  };

  const loadNotifications = async () => {
    setLoading(true);
    const { data } = await notificationsService.getNotifications();
    setNotifications(data || []);
    
    // Get follow statuses for follow notifications
    const followNotifs = data?.filter(n => n.type === 'follow') || [];
    if (followNotifs.length > 0) {
      const actorIds = followNotifs.map(n => n.actor_id);
      const statuses = await followService.getFollowStatuses(actorIds);
      setFollowStatuses(statuses);
    }
    
    setLoading(false);
  };

  const handleBellClick = async () => {
    if (!isOpen) {
      setIsOpen(true);
      await loadNotifications();
      // Mark as checked after opening
      await notificationsService.markAsChecked();
      setHasNew(false);
    } else {
      setIsOpen(false);
    }
  };

  const handleNotificationClick = (notification) => {
    setIsOpen(false);
    
    if (notification.type === 'follow') {
      // Navigate to the follower's profile
      navigate(`/profile/${notification.actor?.username}`);
    } else if (notification.round_id && notification.round?.short_code) {
      // Navigate to the round
      navigate(`/rounds/${notification.round.short_code}`);
    }
  };

  const handleFollowBack = async (actorId, e) => {
    e.stopPropagation(); // Prevent navigation
    await followService.followUser(actorId);
    setFollowStatuses(prev => ({ ...prev, [actorId]: true }));
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 30) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const getNotificationIcon = (type) => {
    switch(type) {
      case 'follow':
        return '👤';
      case 'comment':
        return '💬';
      case 'reaction':
        return '👍';
      default:
        return '🔔';
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Icon Button */}
      <button
        onClick={handleBellClick}
        className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
        title="Notifications"
      >
        <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        
        {/* Red Dot for New Notifications */}
        {hasNew && (
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
        )}
      </button>

    {/* Dropdown */}
{isOpen && (
  <>
    {/* Mobile overlay backdrop */}
    <div 
      className="sm:hidden fixed inset-0 z-40" 
      onClick={() => setIsOpen(false)}
    />
    
    {/* Dropdown - Better positioning */}
    <div className="absolute right-0 mt-2 
      w-[calc(100vw-2rem)] sm:w-96 
      max-w-sm sm:max-w-none
      -translate-x-4 sm:translate-x-0
      bg-white rounded-lg shadow-lg border border-gray-200 
      z-50 
      max-h-[50vh] sm:max-h-[70vh] 
      overflow-hidden">
      
      <div className="p-3 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900">Notifications</h3>
        <p className="text-xs text-gray-500">Last 30 days</p>
      </div>
      
      <div className="overflow-y-auto max-h-[calc(50vh-60px)] sm:max-h-[calc(70vh-60px)]">
        {loading ? (
          <div className="p-4 text-center text-gray-500">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto"></div>
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-6 sm:p-8 text-center text-gray-500">
            <p>No notifications yet</p>
            <p className="text-sm mt-1">When someone interacts with your rounds, you'll see it here</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                onClick={() => handleNotificationClick(notification)}
                className="p-2.5 sm:p-3 hover:bg-gray-50 cursor-pointer"
              >
                <div className="flex gap-2 sm:gap-3">
                  {/* Icon/Avatar */}
                  <div className="flex-shrink-0">
                    {notification.actor?.avatar_url ? (
                      <img 
                        src={notification.actor.avatar_url} 
                        alt={notification.actor.username}
                        className="w-8 h-8 sm:w-10 sm:h-10 rounded-full"
                      />
                    ) : (
                      <div className="w-8 h-8 sm:w-10 sm:h-10 bg-green-100 rounded-full flex items-center justify-center">
                        <span className="text-green-700 font-semibold text-xs sm:text-sm">
                          {getInitials(notification.actor) || getNotificationIcon(notification.type)}
                        </span>
                      </div>
                    )}
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900">
                      <span className="font-semibold">{notification.actor?.username || 'Someone'}</span>
                      {' '}
                      {notification.type === 'follow' && 'started following you'}
                      {notification.type === 'reaction' && 'reacted to your round'}
                      {notification.type === 'comment' && 'commented on your round'}
                    </p>
                    
                    {/* Round info for reactions/comments */}
                    {notification.round && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate">
                        {notification.round.course_name} • {notification.round.total_score}
                      </p>
                    )}
                    
                    {/* Follow back button */}
                    {notification.type === 'follow' && !followStatuses[notification.actor_id] && notification.actor_id !== user?.id && (
                      <button
                        onClick={(e) => handleFollowBack(notification.actor_id, e)}
                        className="mt-1 text-xs bg-green-600 text-white px-3 py-1 rounded-full hover:bg-green-700"
                      >
                        Follow back
                      </button>
                    )}
                    
                    <p className="text-xs text-gray-400 mt-1">
                      {formatTime(notification.created_at)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  </>
 )}
    </div>
  );
};

export default NotificationDropdown;