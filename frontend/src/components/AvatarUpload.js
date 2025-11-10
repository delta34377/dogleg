import { useState, useRef } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../context/AuthContext'
import { getInitials } from '../utils/avatarUtils'

/**
 * Production-ready Avatar Upload Component
 * 
 * Fixes applied:
 * - Proper JPEG extension handling
 * - Safe deletion order (after successful upload)
 * - User-scoped storage paths with RLS
 * - EXIF orientation support
 * - Better error handling
 * 
 * @param {Object} props
 * @param {string} props.size - Size class: 'sm' (48px), 'md' (64px), 'lg' (96px), 'xl' (128px)
 * @param {boolean} props.editable - Whether the avatar is editable (shows upload on hover/tap)
 * @param {Object} props.profile - Profile object with avatar_url and avatar_path
 * @param {Function} props.onUploadComplete - Callback after successful upload
 * @param {string} props.className - Additional CSS classes
 */
function AvatarUpload({ 
  size = 'lg', 
  editable = true, 
  profile = null, 
  onUploadComplete = null,
  className = ''
}) {
  const { user, updateProfile } = useAuth()
  const [isHovering, setIsHovering] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const fileInputRef = useRef(null)
  
  // Size mappings
  const sizeClasses = {
    sm: 'w-12 h-12',
    md: 'w-16 h-16',
    lg: 'w-24 h-24',
    xl: 'w-32 h-32'
  }
  
  const textSizes = {
    sm: 'text-lg',
    md: 'text-xl',
    lg: 'text-3xl',
    xl: 'text-4xl'
  }

  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
    xl: 'w-7 h-7'
  }

  // Utility: Generate user-scoped storage path
  const makeAvatarPath = (uid, ext = 'jpg') => {
    // Use crypto.randomUUID if available, fallback to timestamp
    const uniqueId = typeof crypto?.randomUUID === 'function' 
      ? crypto.randomUUID() 
      : `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    return `${uid}/${uniqueId}.${ext}`
  }

  // Compress and properly orient image
  const compressImage = async (file) => {
    const maxSize = 500

    // Modern path: createImageBitmap respects EXIF when asked
    if ('createImageBitmap' in window) {
      try {
        const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
        let { width, height } = bitmap
        
        if (width > height && width > maxSize) {
          height = Math.round(height * maxSize / width)
          width = maxSize
        } else if (height > maxSize) {
          width = Math.round(width * maxSize / height)
          height = maxSize
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d', { alpha: false })
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(bitmap, 0, 0, width, height)

        const blob = await new Promise((resolve, reject) =>
          canvas.toBlob(
            b => b ? resolve(b) : reject(new Error('toBlob failed')), 
            'image/jpeg', 
            0.85
          )
        )
        return new File([blob], 'avatar.jpg', { 
          type: 'image/jpeg', 
          lastModified: Date.now() 
        })
      } catch (e) {
        console.warn('createImageBitmap failed, using fallback:', e)
        // Fall through to legacy path
      }
    }

    // Fallback path (for older browsers)
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      
      reader.onload = (e) => {
        const img = new Image()
        
        img.onload = () => {
          let width = img.width
          let height = img.height
          
          if (width > height && width > maxSize) {
            height = Math.round(height * maxSize / width)
            width = maxSize
          } else if (height > maxSize) {
            width = Math.round(width * maxSize / height)
            height = maxSize
          }

          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d', { alpha: false })
          ctx.fillStyle = '#FFFFFF'
          ctx.fillRect(0, 0, width, height)
          ctx.drawImage(img, 0, 0, width, height)

          canvas.toBlob((blob) => {
            if (!blob) return reject(new Error('Failed to compress image'))
            resolve(new File([blob], 'avatar.jpg', {
              type: 'image/jpeg',
              lastModified: Date.now()
            }))
          }, 'image/jpeg', 0.85)
        }
        
        img.onerror = () => reject(new Error('Failed to load image'))
        img.src = String(e.target?.result)
      }
      
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsDataURL(file)
    })
  }

  // Handle file selection with safer flow
  const handleFileSelect = async (event) => {
    const file = event.target.files?.[0]
    if (!file || !user) return
    
    // Be explicit about allowed types to avoid HEIC surprises
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!allowed.includes(file.type)) {
      alert('Please select a JPEG, PNG, WebP, or GIF image')
      return
    }
    
    // Increased limit since we compress client-side
    if (file.size > 20 * 1024 * 1024) {
      alert('Image too large (max 20MB)')
      return
    }
    
    setShowModal(false)
    setIsUploading(true)
    setUploadProgress(0)
    
    try {
      // 1) Compress + orient correctly
      const compressedFile = await compressImage(file) // returns JPEG
      
      // 2) Correct extension from blob type (always jpg for our JPEG output)
      const ext = 'jpg'
      
      // 3) Store under user-scoped path
      const path = makeAvatarPath(user.id, ext)
      
      setUploadProgress(30)
      
      // 4) Upload (no upsert since path is unique)
      const { error: uploadError } = await supabase.storage
        .from('profile-pictures')
        .upload(path, compressedFile, {
          cacheControl: '3600',
          upsert: false,
          contentType: 'image/jpeg'
        })
      
      if (uploadError) {
        // Surface specific error for better debugging
        if (uploadError.message?.includes('row-level security')) {
          throw new Error('Permission denied. Please check storage policies.')
        }
        throw uploadError
      }
      
      setUploadProgress(60)
      
      // 5) Get URL (assuming public bucket)
      const { data: { publicUrl } } = supabase.storage
        .from('profile-pictures')
        .getPublicUrl(path)
      
      setUploadProgress(80)
      
      // 6) Store old path before updating
      const oldPath = profile?.avatar_path || extractPathFromUrl(profile?.avatar_url)
      
      // 7) Update profile (storing both URL and path for robustness)
      const { error: updateError } = await updateProfile({
        avatar_url: publicUrl,
        avatar_path: path // Add this column to your profiles table
      })
      
      if (updateError) throw updateError
      
      setUploadProgress(90)
      
      // 8) Best-effort delete the previous file AFTER successful update
      if (oldPath && oldPath !== path && oldPath.startsWith(`${user.id}/`)) {
        try {
          await supabase.storage
            .from('profile-pictures')
            .remove([oldPath])
        } catch (e) {
          console.warn('Failed to delete old avatar:', e)
          // Don't throw - this is best-effort cleanup
        }
      }
      
      setUploadProgress(100)
      
      // Call success callback
      if (onUploadComplete) {
        onUploadComplete(publicUrl, path)
      }
      
      // Reset after short delay to show completion
      setTimeout(() => {
        setIsUploading(false)
        setUploadProgress(0)
      }, 500)
      
    } catch (error) {
      console.error('Error uploading avatar:', error)
      
      // More helpful error messages
      let message = 'Failed to upload avatar. '
      if (error.message?.includes('Permission')) {
        message += 'Permission denied.'
      } else if (error.message?.includes('size')) {
        message += 'File too large.'
      } else if (error.message?.includes('type')) {
        message += 'Invalid file type.'
      } else {
        message += 'Please try again.'
      }
      
      alert(message)
      setIsUploading(false)
      setUploadProgress(0)
    }
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Extract storage path from URL (fallback for legacy data)
  const extractPathFromUrl = (url) => {
    if (!url) return null
    const match = url.match(/\/object\/public\/profile-pictures\/(.+)/)
    return match?.[1] || null
  }

  // Handle remove avatar
  const handleRemoveAvatar = async () => {
    if (!user || !profile?.avatar_url) return
    
    setShowModal(false)
    setIsUploading(true)
    
    try {
      // Get the storage path
      const path = profile.avatar_path || extractPathFromUrl(profile.avatar_url)
      
      // Update profile first (safer order)
      const { error } = await updateProfile({
        avatar_url: null,
        avatar_path: null
      })
      
      if (error) throw error
      
      // Then try to delete from storage (best-effort)
      if (path && path.startsWith(`${user.id}/`)) {
        try {
          await supabase.storage
            .from('profile-pictures')
            .remove([path])
        } catch (e) {
          console.warn('Failed to delete avatar file:', e)
          // Don't throw - profile is already updated
        }
      }
      
      if (onUploadComplete) {
        onUploadComplete(null, null)
      }
      
    } catch (error) {
      console.error('Error removing avatar:', error)
      alert('Failed to remove avatar. Please try again.')
    } finally {
      setIsUploading(false)
    }
  }

  // Handle click to show modal
  const handleAvatarClick = () => {
    if (editable && !isUploading) {
      setShowModal(true)
    }
  }

  // Get proper alt text for accessibility
  const getAltText = () => {
    if (profile?.full_name) return `${profile.full_name}'s avatar`
    if (profile?.username) return `@${profile.username}'s avatar`
    return 'User avatar'
  }

  return (
    <>
      <div 
        className={`relative ${sizeClasses[size]} ${className}`}
        onMouseEnter={() => editable && setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        {/* Avatar Display */}
        <div 
          className={`${sizeClasses[size]} bg-green-100 rounded-full flex items-center justify-center overflow-hidden shadow-lg ${editable ? 'cursor-pointer' : ''}`}
          onClick={handleAvatarClick}
          role={editable ? 'button' : undefined}
          tabIndex={editable ? 0 : undefined}
          onKeyDown={editable ? (e) => e.key === 'Enter' && handleAvatarClick() : undefined}
          aria-label={editable ? 'Change profile picture' : undefined}
        >
          {profile?.avatar_url ? (
            <img 
              src={profile.avatar_url} 
              alt={getAltText()}
              className="w-full h-full object-cover"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <span 
              className={`${textSizes[size]} font-semibold text-green-700`}
              aria-label={getAltText()}
            >
              {getInitials(profile) || user?.email?.[0]?.toUpperCase() || '?'}
            </span>
          )}
          
          {/* Upload Overlay (hover/uploading state) */}
          {editable && (isHovering || isUploading) && (
            <div 
              className={`absolute inset-0 bg-black bg-opacity-60 flex items-center justify-center rounded-full transition-opacity ${sizeClasses[size]}`}
              aria-hidden="true"
            >
              {isUploading ? (
                <div className="text-center">
                  <div className="text-white text-xs mb-1" aria-live="polite">
                    {uploadProgress < 100 ? 'Uploading...' : 'Complete!'}
                  </div>
                  <div className="w-16 h-1 bg-gray-300 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-white transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                      role="progressbar"
                      aria-valuenow={uploadProgress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    />
                  </div>
                </div>
              ) : (
                <svg 
                  className={`${iconSizes[size]} text-white`} 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" 
                  />
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" 
                  />
                </svg>
              )}
            </div>
          )}
        </div>
        
        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleFileSelect}
          className="hidden"
          disabled={isUploading}
          aria-label="Upload profile picture"
        />
      </div>

      {/* Modal for Upload Options */}
      {showModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          role="dialog"
          aria-labelledby="avatar-modal-title"
        >
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full">
            <div className="p-6">
              <h3 id="avatar-modal-title" className="text-lg font-semibold mb-4 text-center">
                Profile Picture
              </h3>
              
              <div className="space-y-2">
                <button
                  onClick={() => {
                    fileInputRef.current?.click()
                    setShowModal(false)
                  }}
                  className="w-full px-4 py-3 text-left rounded-lg hover:bg-gray-50 flex items-center gap-3 transition-colors"
                >
                  <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <div>
                    <div className="font-medium text-gray-900">
                      {profile?.avatar_url ? 'Change Photo' : 'Upload Photo'}
                    </div>
                    <div className="text-sm text-gray-500">
                      Choose from your device
                    </div>
                  </div>
                </button>
                
                {profile?.avatar_url && (
                  <button
                    onClick={() => {
                      if (window.confirm('Are you sure you want to remove your profile picture?')) {
                        handleRemoveAvatar()
                      }
                    }}
                    className="w-full px-4 py-3 text-left rounded-lg hover:bg-red-50 flex items-center gap-3 transition-colors"
                  >
                    <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    <div>
                      <div className="font-medium text-red-600">
                        Remove Photo
                      </div>
                      <div className="text-sm text-red-500">
                        Delete your profile picture
                      </div>
                    </div>
                  </button>
                )}
              </div>
              
              <button
                onClick={() => setShowModal(false)}
                className="w-full mt-4 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default AvatarUpload