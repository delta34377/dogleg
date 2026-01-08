import { useState } from 'react'
import RoundShareModal from '../components/RoundShareModal'

// DUMMY DATA - Pretend this came from Supabase
const DUMMY_ROUND = {
  course_name: 'Pebble Beach Golf Links',
  city: 'Pebble Beach',
  state: 'CA',
  total: 82,
  front9: 40,
  back9: 42,
  // Detailed pars (standard 72)
  coursePars: [4,5,4,4,3,5,3,4,4, 4,4,3,4,5,4,3,5,5],
  // Detailed scores
  holes: [
    4, 5, 4, 5, 3, 5, 3, 5, 6, // 40
    4, 4, 3, 5, 5, 5, 3, 6, 7  // 42
  ],
  // Optional photo (comment out to test no-photo version)
  photo: 'https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?q=80&w=1000&auto=format&fit=crop',
}

const DUMMY_USER = {
  username: 'TigerWoods',
  handicap: '+5.4'
}

function TestShare() {
  const [showModal, setShowModal] = useState(false)

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
      <h1 className="text-2xl font-bold mb-8">Share Feature Lab 🧪</h1>
      
      <div className="space-y-4">
        <button 
          onClick={() => setShowModal(true)}
          className="bg-blue-600 text-white px-6 py-3 rounded-lg shadow-lg font-bold hover:bg-blue-700 transition-all"
        >
          Open Share Modal
        </button>
      </div>

      <p className="mt-8 text-gray-500 text-sm max-w-md text-center">
        Clicking this button will open the share modal with fake data ("Pebble Beach", Score 82). 
        Use this to test layout and image generation on your phone.
      </p>

      {showModal && (
        <RoundShareModal 
          round={DUMMY_ROUND} 
          userProfile={DUMMY_USER}
          onClose={() => setShowModal(false)} 
        />
      )}
    </div>
  )
}

export default TestShare