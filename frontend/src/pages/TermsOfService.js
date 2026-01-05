import { useNavigate } from 'react-router-dom'

function TermsOfService() {
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
          <h1 className="text-3xl font-bold text-center text-gray-900 mb-2">Terms of Service</h1>
          <p className="text-center text-green-600 font-medium mb-2">Dogleg.io</p>
          <p className="text-center text-gray-500 text-sm mb-8">Effective Date: January 5, 2026</p>

          <div className="prose prose-gray max-w-none">
            <p className="text-gray-700 mb-4">
              Welcome to Dogleg! These Terms of Service ("Terms") govern your access to and use of the Dogleg application, website, and services (collectively, the "Service"). Please read these Terms carefully before using our Service.
            </p>
            <p className="text-gray-700 mb-6">
              By creating an account or using Dogleg, you agree to be bound by these Terms. If you do not agree to these Terms, please do not use our Service.
            </p>

            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">1. Acceptance of Terms</h2>
            <p className="text-gray-700 mb-4">
              By accessing or using Dogleg, you confirm that you have read, understood, and agree to be bound by these Terms and our Privacy Policy. These Terms constitute a legally binding agreement between you and Dogleg ("we," "us," or "our").
            </p>

            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">2. Eligibility</h2>
            <p className="text-gray-700 mb-4">
              You must be at least 13 years old to use Dogleg. If you are under 18, you represent that you have your parent or guardian's permission to use the Service. By using Dogleg, you represent and warrant that you meet these eligibility requirements.
            </p>
            <p className="text-gray-700 mb-4">
              If you are using the Service on behalf of an organization, you represent that you have the authority to bind that organization to these Terms.
            </p>

            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">3. Account Registration</h2>
            <p className="text-gray-700 mb-4">
              To access certain features of Dogleg, you must create an account. When you create an account, you agree to:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li>Provide accurate, current, and complete information</li>
              <li>Maintain and promptly update your account information</li>
              <li>Maintain the security and confidentiality of your login credentials</li>
              <li>Accept responsibility for all activities that occur under your account</li>
              <li>Notify us immediately of any unauthorized use of your account</li>
            </ul>
            <p className="text-gray-700 mb-4">
              You may not use another person's account without permission, and you may not create multiple accounts to evade restrictions or bans.
            </p>

            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">4. User Content</h2>
            
            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">4.1 Your Content</h3>
            <p className="text-gray-700 mb-4">
              Dogleg allows you to post, upload, and share content, including golf scores, photos, comments, and other materials ("User Content"). You retain ownership of your User Content. However, by posting User Content on Dogleg, you grant us a non-exclusive, worldwide, royalty-free, sublicensable, and transferable license to use, reproduce, modify, adapt, publish, display, and distribute your User Content in connection with operating and providing the Service.
            </p>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">4.2 Content Responsibility</h3>
            <p className="text-gray-700 mb-4">
              You are solely responsible for your User Content. You represent and warrant that you own or have the necessary rights to your User Content and that it does not violate the rights of any third party, including intellectual property rights, privacy rights, or publicity rights.
            </p>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">4.3 Content Removal</h3>
            <p className="text-gray-700 mb-4">
              We reserve the right, but are not obligated, to remove or disable access to any User Content that we believe violates these Terms or is otherwise harmful, without prior notice.
            </p>

            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">5. Prohibited Conduct</h2>
            <p className="text-gray-700 mb-4">
              You agree not to engage in any of the following prohibited activities:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li>Violating any applicable laws, regulations, or third-party rights</li>
              <li>Posting content that is illegal, harmful, threatening, abusive, harassing, defamatory, vulgar, obscene, or otherwise objectionable</li>
              <li>Impersonating any person or entity, or falsely claiming an affiliation</li>
              <li>Posting false, misleading, or fraudulent golf scores or information</li>
              <li>Interfering with or disrupting the Service or servers or networks connected to the Service</li>
              <li>Using automated means (bots, scrapers, etc.) to access the Service without permission</li>
              <li>Attempting to gain unauthorized access to any part of the Service</li>
              <li>Harassing, bullying, or intimidating other users</li>
              <li>Collecting or harvesting any information about other users without their consent</li>
              <li>Using the Service for any commercial purpose without our prior written consent</li>
            </ul>

            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">6. Intellectual Property</h2>
            <p className="text-gray-700 mb-4">
              The Service and its original content (excluding User Content), features, and functionality are owned by Dogleg and are protected by copyright, trademark, and other intellectual property laws. Our trademarks and trade dress may not be used in connection with any product or service without our prior written consent.
            </p>
            <p className="text-gray-700 mb-4">
              Golf course data displayed in the Service is provided for informational purposes. Course names, logos, and related information may be trademarks of their respective owners.
            </p>

            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">7. Third-Party Services</h2>
            <p className="text-gray-700 mb-4">
              The Service may contain links to third-party websites or services that are not owned or controlled by Dogleg. We have no control over, and assume no responsibility for, the content, privacy policies, or practices of any third-party websites or services. We use third-party services including Supabase for authentication and data storage, Vercel for hosting, and Google for authentication options. Your use of such third-party services is subject to their respective terms and policies.
            </p>

            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">8. Disclaimers</h2>
            <p className="text-gray-700 mb-4 uppercase text-sm">
              THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, OR COURSE OF PERFORMANCE.
            </p>
            <p className="text-gray-700 mb-4">
              We do not warrant that: (a) the Service will be uninterrupted, secure, or error-free; (b) the results obtained from using the Service will be accurate or reliable; (c) any errors in the Service will be corrected; or (d) golf course information, including pars, distances, and ratings, is accurate or complete.
            </p>

            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">9. Limitation of Liability</h2>
            <p className="text-gray-700 mb-4 uppercase text-sm">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, DOGLEG AND ITS OFFICERS, DIRECTORS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, DATA, USE, OR GOODWILL, RESULTING FROM: (A) YOUR ACCESS TO OR USE OF (OR INABILITY TO ACCESS OR USE) THE SERVICE; (B) ANY CONDUCT OR CONTENT OF ANY THIRD PARTY ON THE SERVICE; (C) ANY CONTENT OBTAINED FROM THE SERVICE; OR (D) UNAUTHORIZED ACCESS, USE, OR ALTERATION OF YOUR CONTENT OR INFORMATION.
            </p>
            <p className="text-gray-700 mb-4 uppercase text-sm">
              IN NO EVENT SHALL OUR TOTAL LIABILITY TO YOU FOR ALL CLAIMS EXCEED THE AMOUNT YOU PAID US, IF ANY, IN THE PAST TWELVE (12) MONTHS.
            </p>

            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">10. Indemnification</h2>
            <p className="text-gray-700 mb-4">
              You agree to indemnify, defend, and hold harmless Dogleg and its officers, directors, employees, and agents from and against any claims, liabilities, damages, losses, and expenses, including reasonable attorney's fees, arising out of or in any way connected with: (a) your access to or use of the Service; (b) your User Content; (c) your violation of these Terms; or (d) your violation of any third-party rights.
            </p>

            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">11. Termination</h2>
            <p className="text-gray-700 mb-4">
              We may terminate or suspend your account and access to the Service immediately, without prior notice or liability, for any reason, including if you breach these Terms. Upon termination, your right to use the Service will immediately cease.
            </p>
            <p className="text-gray-700 mb-4">
              You may delete your account at any time through the Service settings. Upon account deletion, we will permanently delete your personal data and User Content in accordance with our Privacy Policy.
            </p>

            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">12. Governing Law and Disputes</h2>
            <p className="text-gray-700 mb-4">
              These Terms shall be governed by and construed in accordance with the laws of the State of Connecticut, United States, without regard to its conflict of law provisions. Any disputes arising from these Terms or the Service shall be resolved in the state or federal courts located in Connecticut, and you consent to the personal jurisdiction of such courts.
            </p>

            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">13. Changes to Terms</h2>
            <p className="text-gray-700 mb-4">
              We reserve the right to modify these Terms at any time. We will notify you of any changes by posting the new Terms on this page and updating the "Effective Date" at the top. Your continued use of the Service after any changes constitutes acceptance of the new Terms. We encourage you to review these Terms periodically.
            </p>

            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">14. Miscellaneous</h2>
            <p className="text-gray-700 mb-4">
              These Terms, together with our Privacy Policy, constitute the entire agreement between you and Dogleg regarding the Service. If any provision of these Terms is found to be unenforceable, the remaining provisions will remain in full force and effect. Our failure to enforce any right or provision of these Terms will not be considered a waiver of those rights. Any waiver must be in writing and signed by Dogleg.
            </p>

            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">15. Contact Us</h2>
            <p className="text-gray-700 mb-4">
              If you have any questions about these Terms, please contact us at:
            </p>
            <p className="text-gray-700 mb-2">
              <strong>Email:</strong> <a href="mailto:privacy@dogleg.io" className="text-green-600 hover:underline">privacy@dogleg.io</a>
            </p>
            <p className="text-gray-700 mb-4">
              <strong>Website:</strong> <a href="https://dogleg.io" className="text-green-600 hover:underline">https://dogleg.io</a>
            </p>

            <p className="text-center text-gray-500 italic mt-8">
              Thank you for using Dogleg. Play well! ⛳
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TermsOfService