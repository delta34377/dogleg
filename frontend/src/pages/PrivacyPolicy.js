import { useNavigate } from 'react-router-dom'

function PrivacyPolicy() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span>Back</span>
            </button>
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <span className="text-2xl">🏌️</span>
              <span className="font-bold text-xl text-green-700">Dogleg.io</span>
            </button>
            <div className="w-16"></div> {/* Spacer for centering */}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-white rounded-xl shadow-sm p-6 md:p-8">
          <h1 className="text-3xl font-bold text-center text-gray-900 mb-2">Privacy Policy</h1>
          <p className="text-center text-green-600 font-medium mb-2">Dogleg.io</p>
          <p className="text-center text-gray-500 text-sm mb-8">Effective Date: January 5, 2026</p>

          <div className="prose prose-gray max-w-none">
            <p className="text-gray-700 mb-4">
              At Dogleg ("we," "us," or "our"), we take your privacy seriously. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our mobile application and website (collectively, the "Service"). Please read this Privacy Policy carefully.
            </p>
            <p className="text-gray-700 mb-6">
              By using Dogleg, you consent to the practices described in this Privacy Policy. If you do not agree with the terms of this Privacy Policy, please do not access or use the Service.
            </p>

            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">1. Information We Collect</h2>
            
            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">1.1 Information You Provide</h3>
            <p className="text-gray-700 mb-4">
              When you create an account or use our Service, you may provide us with:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li><strong>Account Information:</strong> Email address, username, full name, and profile picture</li>
              <li><strong>Authentication Data:</strong> Password (encrypted) or third-party login credentials (Google)</li>
              <li><strong>Phone Number:</strong> If you choose to sign in via phone authentication (optional)</li>
              <li><strong>Golf Data:</strong> Scores, rounds played, courses visited, and related statistics</li>
              <li><strong>User Content:</strong> Photos, comments, reactions, and other content you post</li>
              <li><strong>Social Data:</strong> Users you follow, users who follow you, and interactions with other users</li>
            </ul>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">1.2 Information Collected Automatically</h3>
            <p className="text-gray-700 mb-4">
              When you access the Service, we automatically collect certain information:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li><strong>Device Information:</strong> Device type, operating system, browser type, and unique device identifiers</li>
              <li><strong>Usage Data:</strong> Pages visited, features used, time spent on the Service, and interaction data</li>
              <li><strong>Log Data:</strong> IP address, access times, referring URLs, and error logs</li>
              <li><strong>Analytics Data:</strong> Information collected through Google Analytics and Vercel Analytics</li>
            </ul>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">1.3 Location Information</h3>
            <p className="text-gray-700 mb-4">
              With your permission, we may collect your device's precise location to help you find nearby golf courses. This is entirely optional, and you can disable location services at any time through your device settings. We also infer general location based on the courses you play for our discovery features.
            </p>

            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">2. How We Use Your Information</h2>
            <p className="text-gray-700 mb-4">
              We use the information we collect to:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li>Provide, maintain, and improve the Service</li>
              <li>Create and manage your account</li>
              <li>Display your golf rounds and statistics</li>
              <li>Enable social features (following, reactions, comments)</li>
              <li>Personalize your experience and content recommendations</li>
              <li>Send you notifications about activity on your account (with your consent)</li>
              <li>Send you updates, newsletters, and promotional communications (with your consent)</li>
              <li>Process payments and transactions (if applicable)</li>
              <li>Analyze usage patterns and improve our Service</li>
              <li>Detect, prevent, and address technical issues and fraud</li>
              <li>Comply with legal obligations</li>
            </ul>

            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">3. How We Share Your Information</h2>
            <p className="text-gray-700 mb-4">
              <strong>We do not sell your personal information.</strong> We may share your information in the following circumstances:
            </p>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">3.1 Public Information</h3>
            <p className="text-gray-700 mb-4">
              Your profile information (username, profile picture), posted rounds, comments, and reactions are visible to other users of the Service. You can control some visibility settings within the app.
            </p>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">3.2 Service Providers</h3>
            <p className="text-gray-700 mb-4">
              We share information with third-party service providers who perform services on our behalf:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li><strong>Supabase:</strong> Database hosting, user authentication, and file storage</li>
              <li><strong>Vercel:</strong> Application hosting and analytics</li>
              <li><strong>Google:</strong> Authentication services (Google Sign-In) and analytics (Google Analytics)</li>
              <li><strong>Payment Processors:</strong> If we implement payment features in the future</li>
            </ul>
            <p className="text-gray-700 mb-4">
              These providers are bound by contractual obligations to keep personal information confidential and use it only for the purposes for which we disclose it to them.
            </p>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">3.3 Legal Requirements</h3>
            <p className="text-gray-700 mb-4">
              We may disclose your information if required to do so by law or in response to valid requests by public authorities (e.g., a court or government agency), or if we believe in good faith that such action is necessary to comply with legal obligations, protect and defend our rights or property, prevent or investigate possible wrongdoing, or protect the personal safety of users or the public.
            </p>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">3.4 Business Transfers</h3>
            <p className="text-gray-700 mb-4">
              If we are involved in a merger, acquisition, or asset sale, your information may be transferred as part of that transaction. We will notify you before your information becomes subject to a different Privacy Policy.
            </p>

            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">4. Data Retention</h2>
            <p className="text-gray-700 mb-4">
              We retain your personal information for as long as your account is active or as needed to provide you the Service. When you delete your account, we will permanently delete your personal data and User Content immediately. Some information may be retained in backup systems for a limited period or as required by law.
            </p>
            <p className="text-gray-700 mb-4">
              We may retain anonymized or aggregated data that cannot be used to identify you for analytics and service improvement purposes.
            </p>

            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">5. Data Security</h2>
            <p className="text-gray-700 mb-4">
              We implement appropriate technical and organizational security measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction. These measures include encryption in transit (HTTPS), secure password storage, and access controls. However, no method of transmission over the Internet or electronic storage is 100% secure, and we cannot guarantee absolute security.
            </p>

            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">6. Your Rights and Choices</h2>
            <p className="text-gray-700 mb-4">
              Depending on your location, you may have certain rights regarding your personal information:
            </p>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">6.1 Access and Portability</h3>
            <p className="text-gray-700 mb-4">
              You can access most of your personal information through your account settings. You may request a copy of your data by contacting us.
            </p>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">6.2 Correction</h3>
            <p className="text-gray-700 mb-4">
              You can update or correct your account information at any time through the app settings.
            </p>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">6.3 Deletion</h3>
            <p className="text-gray-700 mb-4">
              You can delete your account at any time through the Service settings. Upon deletion, we will permanently delete your personal data and User Content. You may also request deletion by contacting us at <a href="mailto:privacy@dogleg.io" className="text-green-600 hover:underline">privacy@dogleg.io</a>.
            </p>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">6.4 Marketing Communications</h3>
            <p className="text-gray-700 mb-4">
              You can opt out of receiving promotional emails by clicking the "unsubscribe" link in any promotional email or by updating your notification preferences in the app. Note that you may still receive transactional or account-related messages.
            </p>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">6.5 Push Notifications</h3>
            <p className="text-gray-700 mb-4">
              You can manage push notification preferences in your device settings or within the app.
            </p>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">6.6 Location Data</h3>
            <p className="text-gray-700 mb-4">
              You can disable location services at any time through your device settings.
            </p>

            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">7. International Data Transfers</h2>
            <p className="text-gray-700 mb-4">
              Dogleg is based in the United States. If you access the Service from outside the United States, please be aware that your information may be transferred to, stored, and processed in the United States and other countries where our service providers are located. By using the Service, you consent to the transfer of your information to countries outside your country of residence, which may have different data protection rules.
            </p>

            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">8. Children's Privacy</h2>
            <p className="text-gray-700 mb-4">
              The Service is not intended for children under 13 years of age. We do not knowingly collect personal information from children under 13. If you are a parent or guardian and believe your child has provided us with personal information, please contact us at <a href="mailto:privacy@dogleg.io" className="text-green-600 hover:underline">privacy@dogleg.io</a> and we will delete such information from our systems.
            </p>

            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">9. Third-Party Links</h2>
            <p className="text-gray-700 mb-4">
              The Service may contain links to third-party websites or services. We are not responsible for the privacy practices of these third parties. We encourage you to read the privacy policies of any third-party sites you visit.
            </p>

            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">10. Cookies and Tracking Technologies</h2>
            <p className="text-gray-700 mb-4">
              We use cookies and similar tracking technologies to collect and track information about your use of the Service. Cookies are small data files stored on your device. We use:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li><strong>Essential Cookies:</strong> Required for the Service to function (authentication, session management)</li>
              <li><strong>Analytics Cookies:</strong> Help us understand how users interact with the Service (Google Analytics, Vercel Analytics)</li>
              <li><strong>Preference Cookies:</strong> Remember your settings and preferences</li>
            </ul>
            <p className="text-gray-700 mb-4">
              You can instruct your browser to refuse all cookies or to indicate when a cookie is being sent. However, some features of the Service may not function properly without cookies.
            </p>

            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">11. California Privacy Rights</h2>
            <p className="text-gray-700 mb-4">
              If you are a California resident, you may have additional rights under the California Consumer Privacy Act (CCPA), including the right to know what personal information we collect, the right to request deletion, and the right to opt-out of the "sale" of personal information. We do not sell personal information. To exercise your rights, please contact us at <a href="mailto:privacy@dogleg.io" className="text-green-600 hover:underline">privacy@dogleg.io</a>.
            </p>

            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">12. European Users (GDPR)</h2>
            <p className="text-gray-700 mb-4">
              If you are in the European Economic Area (EEA), you have certain rights under the General Data Protection Regulation (GDPR), including the right to access, correct, or delete your personal data, the right to data portability, the right to restrict or object to processing, and the right to lodge a complaint with a supervisory authority. Our legal basis for processing your information includes your consent, the performance of our contract with you, and our legitimate interests in operating the Service.
            </p>

            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">13. Changes to This Privacy Policy</h2>
            <p className="text-gray-700 mb-4">
              We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Effective Date" at the top. For significant changes, we may also notify you via email or through the Service. Your continued use of the Service after any changes constitutes acceptance of the new Privacy Policy.
            </p>

            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">14. Contact Us</h2>
            <p className="text-gray-700 mb-4">
              If you have any questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact us at:
            </p>
            <p className="text-gray-700 mb-2">
              <strong>Email:</strong> <a href="mailto:privacy@dogleg.io" className="text-green-600 hover:underline">privacy@dogleg.io</a>
            </p>
            <p className="text-gray-700 mb-4">
              <strong>Website:</strong> <a href="https://dogleg.io" className="text-green-600 hover:underline">https://dogleg.io</a>
            </p>

            <p className="text-center text-gray-500 italic mt-8">
              Thank you for trusting Dogleg with your information. ⛳
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PrivacyPolicy