import { useState } from 'react'
import RoundShareModal from '../components/RoundShareModal'

// --- DUMMY DATA FOR TESTING ---
const DUMMY_ROUND = {
  course_name: 'Pebble Beach Golf Links',
  city: 'Pebble Beach', // Hardcoded for test
  state: 'CA',
  total: 82,
  front9: 40,
  back9: 42,
  date: new Date().toISOString(),
  // Detailed pars (standard 72)
  coursePars: [4,5,4,4,3,5,3,4,4, 4,4,3,4,5,4,3,5,5],
  // Detailed scores
  holes: [
    4, 5, 4, 5, 3, 5, 3, 5, 6, // 40
    4, 4, 3, 5, 5, 5, 3, 6, 7  // 42
  ],
  // Fake user profile
  user: {
    username: 'TigerWoods',
    handicap: '+5.4'
  },
  // Use a reliable placeholder image
  photo: 'https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?q=80&w=1000&auto=format&fit=crop'
}

function TestShare() {
  const [showModal, setShowModal] = useState(false)

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
      <h1 className="text-2xl font-bold mb-8">Share Feature Lab 🧪</h1>
      
      <div className="space-y-4 w-full max-w-xs">
        <button 
          onClick={() => setShowModal(true)}
          className="w-full bg-blue-600 text-white px-6 py-4 rounded-xl shadow-lg font-bold hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
        >
          <span>📸</span> Open Share Modal
        </button>
      </div>

      <p className="mt-8 text-gray-500 text-sm max-w-md text-center">
        Tap the button above to launch the share preview with fake data (Pebble Beach, 82).
        <br/><br/>
        Then tap <strong>"Share Round"</strong> to test the native mobile integration.
      </p>

      {showModal && (
        <RoundShareModal 
          round={DUMMY_ROUND} 
          userProfile={{ username: 'TestUser' }}
          onClose={() => setShowModal(false)} 
        />
      )}
    </div>
  )
}

export default TestShare