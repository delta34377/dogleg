// Loading spinners shared by the app shell, route guards and lazy-loaded pages.

function Spinner() {
  return (
    <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
      <svg className="animate-spin h-8 w-8 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
    </div>
  )
}

// Fills the whole screen (used before we know whether the user is signed in)
function FullPageSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <Spinner />
        <p className="text-gray-600">Loading...</p>
      </div>
    </div>
  )
}

// Fills just the page area inside the app shell, so the header and tab bar
// stay visible while a page's code downloads
export function PageSpinner() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="text-center">
        <Spinner />
        <p className="text-gray-600">Loading...</p>
      </div>
    </div>
  )
}

export default FullPageSpinner
