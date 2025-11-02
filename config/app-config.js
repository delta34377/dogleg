// FILE: /config/app-config.js
// PURPOSE: Centralized configuration for easy rebranding
// Change app name in ONE place and it updates everywhere

export const APP_CONFIG = {
    // ============================================
    // BRANDING - Change these to rebrand
    // ============================================
    app: {
        name: 'Dogleg',
        tagline: 'Your Social Golf Scorecard',
        domain: 'dogleg.io',
        email: 'hello@dogleg.io',
        copyright: '© 2024 Dogleg. All rights reserved.',
    },
    
    // SEO & Meta
    seo: {
        title: 'Dogleg - Social Golf Scorecard',
        description: 'Track rounds, follow friends, and share your golf journey.',
        keywords: 'golf, scorecard, social, rounds, handicap, courses',
        ogImage: '/images/og-image.jpg',
    },
    
    // PWA Manifest
    pwa: {
        name: 'Dogleg',
        shortName: 'Dogleg',
        themeColor: '#2E7D32',
        backgroundColor: '#FFFFFF',
    },
    
    // Database/Backend
    supabase: {
        projectName: 'dogleg-prod', // Your Supabase project name
    },
    
    // ============================================
    // FEATURE FLAGS - Easy to toggle features
    // ============================================
    features: {
        socialFeed: true,
        photoUpload: true,
        reactions: true,
        comments: true,
        handicapCalculation: true,
        weatherTracking: true,
        clubTracking: false, // Future feature
        shotTracking: false, // Future feature
    },
    
    // ============================================
    // CONSTANTS - Rarely change
    // ============================================
    constants: {
        maxPhotoSizeMB: 5,
        maxScorePerHole: 12,
        defaultTees: 'White',
        scorePrivacyDefault: false, // false = public by default
        feedPageSize: 20,
        nearbyCoursesRadiusMiles: 50,
    },
    
    // Emoji reactions available
    reactions: ['🔥', '👏', '💪', '🎯', '⛳', '😂', '🙌', '⚡'],
    
    // ============================================
    // THEME - Easy to customize look
    // ============================================
    theme: {
        colors: {
            primary: '#2E7D32', // Golf green
            primaryDark: '#1B5E20',
            secondary: '#FFC107', // Gold
            success: '#4CAF50',
            error: '#F44336',
            warning: '#FF9800',
            info: '#2196F3',
        },
        fonts: {
            primary: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            display: 'Georgia, serif', // For headers if wanted
        },
    },
    
    // ============================================
    // EXTERNAL SERVICES
    // ============================================
    services: {
        analytics: {
            enabled: false,
            googleAnalyticsId: 'G-XXXXXXXXXX',
        },
        sentry: {
            enabled: false,
            dsn: '',
        },
        mapbox: {
            enabled: false,
            token: '',
        },
    },
};

// ============================================
// ENVIRONMENT-SPECIFIC OVERRIDES
// ============================================

const ENV = process.env.NODE_ENV || 'development';

if (ENV === 'development') {
    APP_CONFIG.app.domain = 'localhost:5173';
    APP_CONFIG.supabase.projectName = 'dogleg-dev';
}

if (ENV === 'staging') {
    APP_CONFIG.app.domain = 'staging.dogleg.io';
    APP_CONFIG.supabase.projectName = 'dogleg-staging';
}

// ============================================
// HELPER FUNCTIONS
// ============================================

export const getAppName = () => APP_CONFIG.app.name;
export const getAppDomain = () => APP_CONFIG.app.domain;
export const getAppEmail = () => APP_CONFIG.app.email;
export const isFeatureEnabled = (feature) => APP_CONFIG.features[feature];

// For using in HTML templates
export const getMetaTags = () => `
    <title>${APP_CONFIG.seo.title}</title>
    <meta name="description" content="${APP_CONFIG.seo.description}">
    <meta name="keywords" content="${APP_CONFIG.seo.keywords}">
    <meta property="og:title" content="${APP_CONFIG.seo.title}">
    <meta property="og:description" content="${APP_CONFIG.seo.description}">
    <meta property="og:image" content="${APP_CONFIG.seo.ogImage}">
    <meta property="og:url" content="https://${APP_CONFIG.app.domain}">
    <meta name="twitter:card" content="summary_large_image">
`;

// For PWA manifest
export const getPWAManifest = () => ({
    name: APP_CONFIG.pwa.name,
    short_name: APP_CONFIG.pwa.shortName,
    description: APP_CONFIG.seo.description,
    theme_color: APP_CONFIG.pwa.themeColor,
    background_color: APP_CONFIG.pwa.backgroundColor,
    display: 'standalone',
    orientation: 'portrait',
    scope: '/',
    start_url: '/',
    icons: [
        {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
        },
        {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
        },
    ],
});

export default APP_CONFIG;