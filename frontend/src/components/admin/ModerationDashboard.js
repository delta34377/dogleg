// ModerationDashboard.js - Admin moderation interface
import { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import { Trash2, Search, Users, MessageSquare, Flag, AlertTriangle, CheckCircle } from 'lucide-react';

const ModerationDashboard = () => {
  const [activeTab, setActiveTab] = useState('users');
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [deleteStatus, setDeleteStatus] = useState({ show: false, success: false, message: '' });
  
  // Data states
  const [users, setUsers] = useState([]);
  const [comments, setComments] = useState([]);
  const [rounds, setRounds] = useState([]);
  
  const ITEMS_PER_PAGE = 50;

  // Fetch data based on active tab
  useEffect(() => {
    fetchData();
  }, [activeTab, currentPage, searchTerm]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const offset = (currentPage - 1) * ITEMS_PER_PAGE;
      
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
    const { data, error, count } = await supabase.rpc('get_all_users_admin', {
      search_query: searchTerm || '',
      limit_num: ITEMS_PER_PAGE,
      offset_num: offset
    });
    
    if (error) {
      console.error('Error fetching users:', error);
      return;
    }
    
    setUsers(data || []);
    setTotalPages(Math.ceil((count || 0) / ITEMS_PER_PAGE));
  };

  const fetchComments = async (offset) => {
    const { data, error, count } = await supabase.rpc('get_all_comments_admin', {
      search_query: searchTerm || '',
      limit_num: ITEMS_PER_PAGE,
      offset_num: offset
    });
    
    if (error) {
      console.error('Error fetching comments:', error);
      return;
    }
    
    setComments(data || []);
    setTotalPages(Math.ceil((count || 0) / ITEMS_PER_PAGE));
  };

  const fetchRounds = async (offset) => {
    const { data, error, count } = await supabase.rpc('get_all_rounds_admin', {
      search_query: searchTerm || '',
      limit_num: ITEMS_PER_PAGE,
      offset_num: offset
    });
    
    if (error) {
      console.error('Error fetching rounds:', error);
      return;
    }
    
    setRounds(data || []);
    setTotalPages(Math.ceil((count || 0) / ITEMS_PER_PAGE));
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
            round_id: itemToDelete.id
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
      
      // Hide status after 3 seconds
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
            Users
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
            Comments
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
            Rounds
          </button>
        </nav>
      </div>

      {/* Search Bar */}
      <form onSubmit={handleSearch} className="flex gap-2 max-w-md">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={
              activeTab === 'users' ? 'Search by username or email...' :
              activeTab === 'comments' ? 'Search comment content...' :
              'Search by course name...'
            }
            className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
        >
          Search
        </button>
      </form>

      {/* Content Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">
            Loading...
          </div>
        ) : (
          <>
            {/* Users Table */}
            {activeTab === 'users' && (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      User
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Joined
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Rounds
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Followers
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
                              @{user.username}
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
                        {user.email}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(user.created_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {user.rounds_count || 0}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {user.followers_count || 0}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Comments Table */}
            {activeTab === 'comments' && (
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
                          @{comment.author_username}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900 max-w-xs truncate">
                          {comment.content}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {comment.round_course_name}
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
            )}

            {/* Rounds Table */}
            {activeTab === 'rounds' && (
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
                          @{round.username}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">
                          {round.course_name}
                        </div>
                        <div className="text-sm text-gray-500">
                          {round.city}, {round.state}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {round.total_score}
                        </div>
                        {round.par && (
                          <div className="text-sm text-gray-500">
                            Par {round.par}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(round.played_at)}
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
            )}

            {/* Empty State */}
            {((activeTab === 'users' && users.length === 0) ||
              (activeTab === 'comments' && comments.length === 0) ||
              (activeTab === 'rounds' && rounds.length === 0)) && (
              <div className="p-8 text-center text-gray-500">
                No {activeTab} found
              </div>
            )}
          </>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className={`px-4 py-2 rounded-lg ${
              currentPage === 1
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            Previous
          </button>
          
          <div className="flex items-center gap-2">
            {[...Array(Math.min(5, totalPages))].map((_, i) => {
              let pageNum;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }
              
              return (
                <button
                  key={i}
                  onClick={() => setCurrentPage(pageNum)}
                  className={`w-10 h-10 rounded-lg ${
                    pageNum === currentPage
                      ? 'bg-green-600 text-white'
                      : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>
          
          <button
            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className={`px-4 py-2 rounded-lg ${
              currentPage === totalPages
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            Next
          </button>
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
    </div>
  );
};

export default ModerationDashboard;