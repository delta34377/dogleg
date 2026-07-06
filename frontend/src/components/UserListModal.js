import { useNavigate } from 'react-router-dom'
import { getInitials } from '../utils/avatarUtils'
import ModalShell from './ModalShell'

// Followers / Following list (was duplicated in MyRounds and UserProfile).
function UserListModal({ title, users, onClose }) {
  const navigate = useNavigate()

  return (
    <ModalShell onClose={onClose} maxWidth="max-w-md">
      <div className="p-5 sm:p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="-m-2 p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-gray-600 text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        {users.length === 0 ? (
          <p className="text-gray-500">No {title.toLowerCase()} yet</p>
        ) : (
          <div className="space-y-1">
            {users.map((user) => (
              <button
                key={user.id}
                className="w-full flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg text-left"
                onClick={() => {
                  navigate(`/profile/${user.username}`)
                  onClose()
                }}
              >
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center shrink-0">
                  {user.avatar_url ? (
                    <img
                      src={user.avatar_url}
                      alt={user.username}
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    <span className="text-green-700 font-semibold">
                      {getInitials(user) || '?'}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{user.username}</p>
                  {user.full_name && (
                    <p className="text-sm text-gray-600 truncate">{user.full_name}</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </ModalShell>
  )
}

export default UserListModal
