import { useState, useRef } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../context/AuthContext'
import { getInitials } from '../utils/avatarUtils'

/**
 * Reusable Avatar Upload Component with Modal
 * 
 * @param {Object} props
 * @param {string} props.size - Size class: 'sm' (48px), 'md' (64px), 'lg' (96px), 'xl' (128px)
 * @param {boolean} props.editable - Whether the avatar is editable (shows upload on hover/tap)
 * @param {Object} props.profile - Profile object with avatar_url
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

  // Handle file selection
  const handleFileSelect = async (event) => {
    const file = event.target.files?.[0]
    if (!file || !user) return
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file')
      return
    }
    
    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Image size must be less than 5MB')
      return
    }
    
    setShowModal(false)
    setIsUploading(true)
    setUploadProgress(0)
    
    try {
      // Compress and resize image
      const compressedFile = await compressImage(file)
      
      // Generate unique filename
      const fileExt = file.name.split('.').pop()
      const fileName = `${user.id}-${Date.now()}.${fileExt}`
      
      // Upload to Supabase Storage
      setUploadProgress(30)
      
      // First, try to remove old avatar if it exists
      if (profile?.avatar_url) {
        const oldPath = profile.avatar_url.split('/').pop()
        if (oldPath && oldPath.includes(user.id)) {
          await supabase.storage
            .from('profile-pictures')
            .remove([oldPath])
        }
      }
      
      setUploadProgress(50)
      
      // Upload new avatar
      const { data, error: uploadError } = await supabase.storage
        .from('profile-pictures')
        .upload(fileName, compressedFile, {
          cacheControl: '3600',
          upsert: true,
          contentType: 'image/jpeg'
        })

      if (uploadError) {
        console.error('Upload error details:', uploadError)
        throw uploadError
      }
      
      setUploadProgress(70)
      
      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('profile-pictures')
        .getPublicUrl(fileName)
      
      // Update profile with new avatar URL
      setUploadProgress(90)
      
      const { error: updateError } = await updateProfile({
        avatar_url: publicUrl
      })
      
      if (updateError) throw updateError
      
      setUploadProgress(100)
      
      // Call success callback
      if (onUploadComplete) {
        onUploadComplete(publicUrl)
      }
      
      // Reset after short delay to show completion
      setTimeout(() => {
        setIsUploading(false)
        setUploadProgress(0)
      }, 500)
      
    } catch (error) {
      console.error('Error uploading avatar:', error)
      alert('Failed to upload avatar. Please try again.')
      setIsUploading(false)
      setUploadProgress(0)
    }
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Compress and resize image
  const compressImage = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      
      reader.onload = (e) => {
        const img = new Image()
        
        img.onload = () => {
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')
          
          // Calculate dimensions (max 500x500, maintain aspect ratio)
          const maxSize = 500
          let width = img.width
          let height = img.height
          
          if (width > height) {
            if (width > maxSize) {
              height = Math.round((height * maxSize) / width)
              width = maxSize
            }
          } else {
            if (height > maxSize) {
              width = Math.round((width * maxSize) / height)
              height = maxSize
            }
          }
          
          // Set canvas dimensions
          canvas.width = width
          canvas.height = height
          
          // Draw and compress image
          ctx.fillStyle = '#FFFFFF'
          ctx.fillRect(0, 0, width, height)
          ctx.drawImage(img, 0, 0, width, height)
          
          // Convert to blob with compression
          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(new File([blob], file.name, {
                  type: 'image/jpeg',
                  lastModified: Date.now()
                }))
              } else {
                reject(new Error('Failed to compress image'))
              }
            },
            'image/jpeg',
            0.85 // 85% quality
          )
        }
        
        img.onerror = () => reject(new Error('Failed to load image'))
        img.src = e.target?.result
      }
      
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsDataURL(file)
    })
  }

  // Handle remove avatar
  const handleRemoveAvatar = async () => {
    if (!user || !profile?.avatar_url) return
    
    setShowModal(false)
    setIsUploading(true)
    
    try {
      // Remove from storage
      const fileName = profile.avatar_url.split('/').pop()
      if (fileName && fileName.includes(user.id)) {
        await supabase.storage
          .from('profile-pictures')
          .remove([fileName])
      }
      
      // Update profile
      const { error } = await updateProfile({
        avatar_url: null
      })
      
      if (error) throw error
      
      if (onUploadComplete) {
        onUploadComplete(null)
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

  return (
    <>
      <div 
        className={`relative ${sizeClasses[size]} ${className}`}
        onMouseEnter={() => editable && setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        {/* Avatar Display - matching green/white styling */}
        <div 
          className={`${sizeClasses[size]} bg-green-100 rounded-full flex items-center justify-center overflow-hidden shadow-lg ${editable ? 'cursor-pointer' : ''}`}
          onClick={handleAvatarClick}
        >
          {profile?.avatar_url ? (
            <img 
              src={profile.avatar_url} 
              alt="Profile" 
              className="w-full h-full object-cover"
            />
          ) : (
            <span className={`${textSizes[size]} font-semibold text-green-700`}>
              {getInitials(profile) || user?.email?.[0]?.toUpperCase() || '?'}
            </span>
          )}
          
          {/* Upload Overlay (hover/uploading state) */}
          {editable && (isHovering || isUploading) && (
            <div 
              className={`absolute inset-0 bg-black bg-opacity-60 flex items-center justify-center rounded-full transition-opacity ${sizeClasses[size]}`}
            >
              {isUploading ? (
                <div className="text-center">
                  <div className="text-white text-xs mb-1">
                    {uploadProgress}%
                  </div>
                  <div className="w-16 h-1 bg-gray-300 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-white transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              ) : (
                <svg 
                  className={`${iconSizes[size]} text-white`} 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
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
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
          disabled={isUploading}
        />
      </div>

      {/* Modal for Upload Options */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full">
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-4 text-center">
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