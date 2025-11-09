import { useState, useRef } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../context/AuthContext'
import { getInitials } from '../utils/avatarUtils'

/**
 * Reusable Avatar Upload Component
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
    
    setIsUploading(true)
    setUploadProgress(0)
    
    try {
      // Compress and resize image
      const compressedFile = await compressImage(file)
      
      // Generate unique filename
      const fileExt = file.name.split('.').pop()
      const fileName = `${user.id}-${Date.now()}.${fileExt}`
      const filePath = `avatars/${fileName}`
      
      // Upload to Supabase Storage
      setUploadProgress(30)
      
      // First, try to remove old avatar if it exists
      if (profile?.avatar_url) {
        const oldPath = profile.avatar_url.split('/').pop()
        if (oldPath && oldPath.includes(user.id)) {
          await supabase.storage
            .from('avatars')
            .remove([`avatars/${oldPath}`])
        }
      }
      
      setUploadProgress(50)
      
      // Upload new avatar
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, compressedFile, {
          cacheControl: '3600',
          upsert: true
        })
      
      if (uploadError) throw uploadError
      
      setUploadProgress(70)
      
      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath)
      
      // Update profile with new avatar URL
      setUploadProgress(90)
      
      const { error: updateError } = await updateProfile({
        avatar_url: publicUrl,
        profile_picture_url: publicUrl // Update both fields for compatibility
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

  // Handle click to upload (no dropdown menu)
  const handleAvatarClick = () => {
    if (editable && !isUploading) {
      fileInputRef.current?.click()
    }
  }

  return (
    <div 
      className={`relative ${sizeClasses[size]} ${className}`}
      onMouseEnter={() => editable && setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {/* Avatar Display - matching green/white styling */}
      <div 
        className={`${sizeClasses[size]} bg-green-100 rounded-full flex items-center justify-center overflow-hidden shadow-lg cursor-pointer`}
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
        
        {/* Upload Overlay (hover/uploading state) - now properly sized */}
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
  )
}

export default AvatarUpload