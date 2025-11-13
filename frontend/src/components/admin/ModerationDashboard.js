// ModerationDashboard.js - Full Enhanced Version with User Management
import { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import { 
  Trash2, Search, Users, MessageSquare, Flag, AlertTriangle, 
  CheckCircle, ChevronLeft, ChevronRight, ChevronsLeft, 
  ChevronsRight, X, Ban, ArrowUpDown, ArrowUp, ArrowDown,
  MoreVertical
} from 'lucide-react';

const ModerationDashboard = () => {
  const [activeTab, setActiveTab] = useState('users');
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showUserActionModal, setShowUserActionModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [deleteStatus, setDeleteStatus] = useState({ show: false, success: false, message: '' });
  
  // Sorting state for users
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('DESC');
  
  // Data states
  const [users, setUsers] = useState([]);
  const [comments, setComments] = useState([]);
  const [rounds, setRounds] = useState([]);
  
  // Calculate total pages
  const totalPages = Math.ceil(totalCount / itemsPerPage);

  // Fetch data based on active tab
  useEffect(() => {
    fetchData();
  }, [activeTab, currentPage, itemsPerPage, sortBy, sortOrder]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const offset = (currentPage - 1) * itemsPerPage;
      
      switch(activeTab) {
        case 'users':
          await fetchUsers(offset);
          break;
        case 'comments':
          await fetchComments(offset);
          break;
        case 'rounds':
          await fetchRounds(offset);
          break;
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async (offset) => {
    const { data, error } = await supabase.rpc('get_all_users_admin', {
      search_query: searchTerm || '',
      limit_num: itemsPerPage,
      offset_num: offset,
      sort_by: sortBy,
      sort_order: sortOrder
    });
    
    if (error) {
      console.error('Error fetching users:', error);
      return;
    }
    
    if (data && data.length > 0) {
      setUsers(data);
      setTotalCount(data[0].total_count || 0);
    } else {
      setUsers([]);
      setTotalCount(0);
    }
  };

  const fetchComments = async (offset) => {
    const { data, error } = await supabase.rpc('get_all_comments_admin', {
      search_query: searchTerm || '',
      limit_num: itemsPerPage,
      offset_num: offset
    });
    
    if (error) {
      console.error('Error fetching comments:', error);
      return;
    }
    
    if (data && data.length > 0) {
      setComments(data);
      setTotalCount(data[0].total_count || 0);
    } else {
      setComments([]);
      setTotalCount(0);
    }
  };

  const fetchRounds = async (offset) => {
    const { data, error } = await supabase.rpc('get_all_rounds_admin', {
      search_query: searchTerm || '',
      limit_num: itemsPerPage,
      offset_num: offset
    });
    
    if (error) {
      console.error('Error fetching rounds:', error);
      return;
    }
    
    if (data && data.length > 0) {
      setRounds(data);
      setTotalCount(data[0].total_count || 0);
    } else {
      setRounds([]);
      setTotalCount(0);
    }
  };

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setSortBy(column);
      setSortOrder('DESC');
    }
    setCurrentPage(1);
  };

  const getSortIcon = (column) => {
    if (sortBy !== column) {
      return <ArrowUpDown className="w-4 h-4 text-gray-400" />;
    }
    return sortOrder === 'ASC' 
      ? <ArrowUp className="w-4 h-4 text-green-600" />
      : <ArrowDown className="w-4 h-4 text-green-600" />;
  };

  const handleUserAction = (user, action) => {
    setSelectedUser(user);
    setShowUserActionModal(action);
  };

  const confirmUserAction = async () => {
    if (!selectedUser) return;
    
    setLoading(true);
    try {
      let result;
      
      if (showUserActionModal === 'delete_content') {
        result = await supabase.rpc('delete_user_content_admin', {
          p_user_id: selectedUser.id
        });
        
        if (!result.error && result.data) {
          setDeleteStatus({
            show: true,
            success: true,
            message: `Deleted ${result.data.rounds_deleted} rounds, ${result.data.comments_deleted} comments, ${result.data.reactions_deleted} reactions`
          });
        }
      } else if (showUserActionModal === 'ban') {
        result = await supabase.rpc('toggle_user_ban_admin', {
          p_user_id: selectedUser.id
        });
        
        if (!result.error) {
          setDeleteStatus({
            show: true,
            success: true,
            message: `User ${result.data ? 'banned' : 'unbanned'} successfully`
          });
        }
      }
      
      if (result?.error) {
        throw result.error;
      }
      
      // Refresh data
      fetchData();
      
      // Clear feed cache by triggering a refresh
      window.dispatchEvent(new Event('feedRefresh'));
      
      setTimeout(() => {
        setDeleteStatus({ show: false, success: false, message: '' });
      }, 3000);
      
    } catch (error) {
      console.error('Error with user action:', error);
      setDeleteStatus({
        show: true,
        success: false,
        message: `Failed: ${error.message}`
      });
      
      setTimeout(() => {
        setDeleteStatus({ show: false, success: false, message: '' });
      }, 3000);
    } finally {
      setLoading(false);
      setShowUserActionModal(false);
      setSelectedUser(null);
    }
  };

  const handleDelete = (item, type) => {
    setItemToDelete({ ...item, type });
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    
    setLoading(true);
    try {
      let result;
      
      switch(itemToDelete.type) {
        case 'comment':
          result = await supabase.rpc('delete_comment_admin', {
            comment_id: itemToDelete.id
          });
          break;
        case 'round':
          result = await supabase.rpc('delete_round_admin', {
            p_round_id: itemToDelete.id
          });
          break;
        default:
          throw new Error('Invalid delete type');
      }
      
      if (result.error) {
        throw result.error;
      }
      
      // Show success message
      setDeleteStatus({
        show: true,
        success: true,
        message: `${itemToDelete.type} deleted successfully`
      });
      
      // Refresh data
      fetchData();
      
      // Clear feed cache
      window.dispatchEvent(new Event('feedRefresh'));
      
      setTimeout(() => {
        setDeleteStatus({ show: false, success: false, message: '' });
      }, 3000);
      
    } catch (error) {
      console.error('Error deleting:', error);
      setDeleteStatus({
        show: true,
        success: false,
        message: `Failed to delete: ${error.message}`
      });
      
      setTimeout(() => {
        setDeleteStatus({ show: false, success: false, message: '' });
      }, 3000);
    } finally {
      setLoading(false);
      setShowDeleteModal(false);
      setItemToDelete(null);
    }
  };

  const clearSearch = () => {
    setSearchTerm('');
    setCurrentPage(1);
    fetchData();
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setCurrentPage(1);
    fetchData();
  };

  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const handleItemsPerPageChange = (value) => {
    setItemsPerPage(value);
    setCurrentPage(1);
  };

  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 7;
    
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (currentPage <= 4) {
        for (let i = 1; i <= 5; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 3) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 4; i <= totalPages; i++) {
          pages.push(i);
        }
      } else {
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(totalPages);
      }
    }
    
    return pages;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Content Moderation</h2>
        <p className="text-gray-600 mt-1">Manage users, comments, and rounds</p>
      </div>

      {/* Status Message */}
      {deleteStatus.show && (
        <div className={`p-4 rounded-lg flex items-center gap-2 ${
          deleteStatus.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
        }`}>
          {deleteStatus.success ? (
            <CheckCircle className="w-5 h-5" />
          ) : (
            <AlertTriangle className="w-5 h-5" />
          )}
          {deleteStatus.message}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          <button
            onClick={() => {
              setActiveTab('users');
              setCurrentPage(1);
              setSearchTerm('');
            }}
            className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
              activeTab === 'users'
                ? 'border-green-600 text-green-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Users className="w-4 h-4" />
            Users {totalCount > 0 && activeTab === 'users' && `(${totalCount})`}
          </button>
          <button
            onClick={() => {
              setActiveTab('comments');
              setCurrentPage(1);
              setSearchTerm('');
            }}
            className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
              activeTab === 'comments'
                ? 'border-green-600 text-green-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            Comments {totalCount > 0 && activeTab === 'comments' && `(${totalCount})`}
          </button>
          <button
            onClick={() => {
              setActiveTab('rounds');
              setCurrentPage(1);
              setSearchTerm('');
            }}
            className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
              activeTab === 'rounds'
                ? 'border-green-600 text-green-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Flag className="w-4 h-4" />
            Rounds {totalCount > 0 && activeTab === 'rounds' && `(${totalCount})`}
          </button>
        </nav>
      </div>

      {/* Search Bar and Controls */}
      <div className="flex flex-col sm:flex-row gap-4">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={
                activeTab === 'users' ? 'Search by username, email, or name...' :
                activeTab === 'comments' ? 'Search by content or author...' :
                'Search by course, city, state, username, score...'
              }
              className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            Search
          </button>
        </form>
        
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Show:</label>
          <select
            value={itemsPerPage}
            onChange={(e) => handleItemsPerPageChange(Number(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          <span className="text-sm text-gray-600">per page</span>
        </div>
      </div>

      {/* Results Info */}
      {!loading && totalCount > 0 && (
        <div className="flex justify-between items-center text-sm text-gray-600">
          <div>
            Showing {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, totalCount)} of {totalCount} results
          </div>
        </div>
      )}

      {/* Content Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">
            Loading...
          </div>
        ) : (
          <>
            {/* Users Table with Sortable Columns */}
            {activeTab === 'users' && (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <button
                          onClick={() => handleSort('username')}
                          className="flex items-center gap-1 hover:text-gray-700"
                        >
                          User
                          {getSortIcon('username')}
                        </button>
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <button
                          onClick={() => handleSort('email')}
                          className="flex items-center gap-1 hover:text-gray-700"
                        >
                          Email
                          {getSortIcon('email')}
                        </button>
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <button
                          onClick={() => handleSort('created_at')}
                          className="flex items-center gap-1 hover:text-gray-700"
                        >
                          Joined
                          {getSortIcon('created_at')}
                        </button>
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <button
                          onClick={() => handleSort('rounds')}
                          className="flex items-center gap-1 hover:text-gray-700"
                        >
                          Rounds
                          {getSortIcon('rounds')}
                        </button>
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <button
                          onClick={() => handleSort('comments')}
                          className="flex items-center gap-1 hover:text-gray-700"
                        >
                          Comments
                          {getSortIcon('comments')}
                        </button>
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <button
                          onClick={() => handleSort('followers')}
                          className="flex items-center gap-1 hover:text-gray-700"
                        >
                          Followers
                          {getSortIcon('followers')}
                        </button>
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {users.map((user) => (
                      <tr key={user.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            {user.avatar_url ? (
                              <img 
                                src={user.avatar_url} 
                                alt="" 
                                className="w-8 h-8 rounded-full mr-3"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-gray-200 mr-3 flex items-center justify-center">
                                <span className="text-xs text-gray-500">
                                  {user.username?.[0]?.toUpperCase() || '?'}
                                </span>
                              </div>
                            )}
                            <div>
                              <div className="text-sm font-medium text-gray-900">
                                @{user.username || 'no-username'}
                              </div>
                              {user.full_name && (
                                <div className="text-sm text-gray-500">
                                  {user.full_name}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {user.email || 'No email'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(user.created_at)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {user.rounds_count || 0}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {user.comments_count || 0}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {user.followers_count || 0}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="relative inline-block text-left">
                            <div className="dropdown">
                              <button className="p-1 rounded hover:bg-gray-100">
                                <MoreVertical className="w-4 h-4 text-gray-500" />
                              </button>
                              <div className="dropdown-content absolute right-0 z-10 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 hidden hover:block">
                                <div className="py-1">
                                  <button
                                    onClick={() => handleUserAction(user, 'delete_content')}
                                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                    Delete All Content
                                  </button>
                                  {/* Ban feature ready but commented out until backend support */}
                                  {/* <button
                                    onClick={() => handleUserAction(user, 'ban')}
                                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                                  >
                                    <Ban className="w-4 h-4" />
                                    Ban User
                                  </button> */}
                                </div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Comments Table (unchanged) */}
            {activeTab === 'comments' && (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Author
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Comment
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Round
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {comments.map((comment) => (
                      <tr key={comment.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            @{comment.author_username || 'unknown'}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-900 max-w-xs truncate" title={comment.content}>
                            {comment.content}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {comment.round_course_name || 'Unknown course'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(comment.created_at)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <button
                            onClick={() => handleDelete(comment, 'comment')}
                            className="text-red-600 hover:text-red-900 flex items-center gap-1"
                          >
                            <Trash2 className="w-4 h-4" />
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Rounds Table (unchanged) */}
            {activeTab === 'rounds' && (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Player
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Course
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Score
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date Played
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Reactions
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Comments
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {rounds.map((round) => (
                      <tr key={round.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            @{round.username || 'unknown'}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-900">
                            {round.course_name || 'Unknown course'}
                          </div>
                          <div className="text-sm text-gray-500">
                            {[round.city, round.state].filter(Boolean).join(', ') || 'Unknown location'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {round.total_score || '-'}
                          </div>
                          {round.par && (
                            <div className="text-sm text-gray-500">
                              Par {round.par}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {round.played_at ? formatDate(round.played_at) : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {round.reaction_count || 0}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {round.comment_count || 0}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <button
                            onClick={() => handleDelete(round, 'round')}
                            className="text-red-600 hover:text-red-900 flex items-center gap-1"
                          >
                            <Trash2 className="w-4 h-4" />
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Empty State */}
            {((activeTab === 'users' && users.length === 0) ||
              (activeTab === 'comments' && comments.length === 0) ||
              (activeTab === 'rounds' && rounds.length === 0)) && (
              <div className="p-8 text-center text-gray-500">
                {searchTerm ? `No ${activeTab} found matching "${searchTerm}"` : `No ${activeTab} found`}
              </div>
            )}
          </>
        )}
      </div>

      {/* Pagination (unchanged) */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePageChange(1)}
              disabled={currentPage === 1}
              className={`p-2 rounded-lg ${
                currentPage === 1
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
              title="First page"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
            
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className={`px-3 py-2 rounded-lg ${
                currentPage === 1
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <ChevronLeft className="w-4 h-4 inline mr-1" />
              Previous
            </button>
          </div>
          
          <div className="flex items-center gap-1">
            {getPageNumbers().map((pageNum, index) => (
              pageNum === '...' ? (
                <span key={`ellipsis-${index}`} className="px-3 py-2">...</span>
              ) : (
                <button
                  key={pageNum}
                  onClick={() => handlePageChange(pageNum)}
                  className={`w-10 h-10 rounded-lg ${
                    pageNum === currentPage
                      ? 'bg-green-600 text-white'
                      : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {pageNum}
                </button>
              )
            ))}
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className={`px-3 py-2 rounded-lg ${
                currentPage === totalPages
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              Next
              <ChevronRight className="w-4 h-4 inline ml-1" />
            </button>
            
            <button
              onClick={() => handlePageChange(totalPages)}
              disabled={currentPage === totalPages}
              className={`p-2 rounded-lg ${
                currentPage === totalPages
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
              title="Last page"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3 text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <h3 className="text-lg leading-6 font-medium text-gray-900 mt-4">
                Confirm Deletion
              </h3>
              <div className="mt-2 px-7 py-3">
                <p className="text-sm text-gray-500">
                  Are you sure you want to delete this {itemToDelete?.type}? 
                  {itemToDelete?.type === 'round' && ' This will also delete all associated comments and reactions.'}
                </p>
              </div>
              <div className="items-center px-4 py-3">
                <button
                  onClick={confirmDelete}
                  className="px-4 py-2 bg-red-600 text-white text-base font-medium rounded-md w-full shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  Delete
                </button>
                <button
                  onClick={() => {
                    setShowDeleteModal(false);
                    setItemToDelete(null);
                  }}
                  className="mt-3 px-4 py-2 bg-white text-gray-700 text-base font-medium rounded-md w-full shadow-sm border border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* User Action Modal */}
      {showUserActionModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3 text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
                {showUserActionModal === 'ban' ? (
                  <Ban className="h-6 w-6 text-red-600" />
                ) : (
                  <Trash2 className="h-6 w-6 text-red-600" />
                )}
              </div>
              <h3 className="text-lg leading-6 font-medium text-gray-900 mt-4">
                {showUserActionModal === 'ban' ? 'Ban User' : 'Delete User Content'}
              </h3>
              <div className="mt-2 px-7 py-3">
                <p className="text-sm text-gray-500">
                  {showUserActionModal === 'ban' 
                    ? `Are you sure you want to ban @${selectedUser?.username}?`
                    : `This will delete all rounds, comments, and reactions from @${selectedUser?.username}.`
                  }
                </p>
              </div>
              <div className="items-center px-4 py-3">
                <button
                  onClick={confirmUserAction}
                  className="px-4 py-2 bg-red-600 text-white text-base font-medium rounded-md w-full shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  {showUserActionModal === 'ban' ? 'Ban User' : 'Delete All Content'}
                </button>
                <button
                  onClick={() => {
                    setShowUserActionModal(false);
                    setSelectedUser(null);
                  }}
                  className="mt-3 px-4 py-2 bg-white text-gray-700 text-base font-medium rounded-md w-full shadow-sm border border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ModerationDashboard;