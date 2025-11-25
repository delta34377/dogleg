// src/components/IOSInstallPrompt.js

import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

function ShareIcon() {
  return (
    <svg className="w-5 h-5 mx-1 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  );
}

export default function IOSInstallPrompt() {
  const { user } = useAuth();
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // 1. Must be logged in
    if (!user) return;

    // 2. Check Device/Browser
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    
    // Check if installed (Standalone)
    const isStandalone = 
      window.navigator.standalone === true || 
      window.matchMedia('(display-mode: standalone)').matches;
    
    // Check strict Safari (Excludes Chrome 'CriOS' and Firefox 'FxiOS' on iOS)
    const isSafari = /Safari/.test(ua) && !/CriOS/.test(ua) && !/FxiOS/.test(ua);

    // Exit if not target audience
    if (!isIOS || !isSafari || isStandalone) return;

    // 3. Check History
    const promptData = JSON.parse(localStorage.getItem('iosInstallPrompt') || '{}');
    const showCount = promptData.showCount || 0;
    const lastShownAt = promptData.lastShownAt || null;
    
    const maxShows = 3;
    const cooldownDays = 7;
    const cooldownMs = cooldownDays * 24 * 60 * 60 * 1000;

    // Stop if we've shown it 3 times already
    if (showCount >= maxShows) return;

    // 4. Determine if we should show now
    let shouldShow = false;

    if (showCount === 0) {
      // First time user? Show immediately.
      shouldShow = true;
    } else if (lastShownAt) {
      // Subsequent times? Check if 7 days have passed
      const timeSinceLastShow = Date.now() - lastShownAt;
      if (timeSinceLastShow >= cooldownMs) {
        shouldShow = true;
      }
    }

    if (shouldShow) {
      const timer = setTimeout(() => {
        setShowPrompt(true);
        
        // --- CRITICAL FIX ---
        // Mark as shown IMMEDIATELY when we trigger the state.
        // This prevents it from showing again on refresh if they don't click 'X'.
        localStorage.setItem('iosInstallPrompt', JSON.stringify({
          showCount: showCount + 1,
          lastShownAt: Date.now()
        }));
        
      }, 3000); // 3 second delay

      return () => clearTimeout(timer);
    }
  }, [user]);

  const handleDismiss = () => {
    setShowPrompt(false);
    // No need to update localStorage here anymore
  };

  if (!showPrompt) return null;

  return (
    <div 
      className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg p-4 z-50 transition-transform duration-500 transform translate-y-0"
      style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
    >
      <div className="flex items-start gap-3">
        <div className="text-3xl">⛳</div>
        <div className="flex-1">
          <p className="font-semibold text-gray-900">Add Dogleg to Home Screen</p>
          <p className="text-sm text-gray-600 mt-1">
            Tap <span className="inline-flex items-center align-middle"><ShareIcon /></span> then <span className="font-semibold">"Add to Home Screen"</span> for the best experience.
          </p>
        </div>
        <button 
          onClick={handleDismiss}
          className="text-gray-400 hover:text-gray-600 p-2 -mr-2"
          aria-label="Dismiss"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}