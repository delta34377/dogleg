import { useEffect } from 'react'
import { createPortal } from 'react-dom'

// Shared modal mechanics: renders into a portal at document.body (so a modal
// opened from inside a card can't be clipped or inherit card styles), closes
// on Escape and backdrop tap, and locks body scroll while open.
// Panels are rounded-2xl + shadow-xl — the app's "floating layer" treatment,
// one step above cards (rounded-xl + shadow-sm).
function ModalShell({ onClose, children, maxWidth = 'max-w-sm', panelClassName = '' }) {
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)

    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-fade-in"
      onClick={(e) => { e.stopPropagation(); onClose() }}
    >
      <div
        className={`bg-white rounded-2xl shadow-xl w-full ${maxWidth} max-h-[90vh] overflow-y-auto text-left animate-modal-pop ${panelClassName}`}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  )
}

export default ModalShell
