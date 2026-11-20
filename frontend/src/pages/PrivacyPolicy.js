import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAnalyticsChoice, setAnalyticsOptOut } from '../utils/analyticsConsent'

// Keep this page describing only what Dogleg actually does. If a feature
// changes (new service, push notifications, self-serve account deletion...),
// update the text here and the "Last updated" date.
const LAST_UPDATED = 'November 20, 2026'
const CONTACT_EMAIL = 'hello@dogleg.io'

function EmailLink() {
  return (
    <a href={`mailto:${CONTACT_EMAIL}`} className="text-green-700 hover:underline">
      {CONTACT_EMAIL}
    </a>
  )
}

// The on/off choice for Google Analytics cookies. Neither button is selected
// until the visitor chooses, because the default depends on their country
// (Google decides that from their connection, so the page can't know it).
function AnalyticsCookieSetting() {
  const [choice, setChoice] = useState(() => getAnalyticsChoice()) // 'on' | 'off' | null
  const [notSaved, setNotSaved] = useState(false)

  const choose = (next) => {
    const saved = setAnalyticsOptOut(next === 'off')
    setChoice(next)
    setNotSaved(!saved)
  }

  const options = [
    { value: 'on', label: 'On' },
    { value: 'off', label: 'Off' },
  ]

  let status
  if (choice === 'on') status = 'Analytics cookies are on in this browser.'
  else if (choice === 'off') status = 'Analytics cookies are off in this browser.'
  else status = "You haven't chosen yet, so the default applies: off in the EEA, the UK and Switzerland, on everywhere else."

  return (
    <div id="analytics-cookies" className="my-6 rounded-xl border border-green-200 bg-green-50 p-4">
      <fieldset>
        <legend className="font-semibold text-gray-900">Analytics cookies (Google Analytics)</legend>
        <p className="mt-1 mb-3 text-sm text-gray-700">
          Your choice is saved in this browser only, so set it again on other devices or browsers.
        </p>
        <div className="flex gap-2">
          {options.map((option) => (
            <label key={option.value} className="cursor-pointer">
              {/* Real radio buttons (visually hidden) keep this keyboard and screen-reader friendly */}
              <input
                type="radio"
                name="analytics-cookies"
                value={option.value}
                checked={choice === option.value}
                onChange={() => choose(option.value)}
                className="peer sr-only"
              />
              <span className="inline-flex min-w-[4.5rem] justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 peer-checked:border-green-700 peer-checked:bg-green-700 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-green-600 peer-focus-visible:ring-offset-2">
                {option.label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <p className="mt-3 text-sm text-gray-700" aria-live="polite">
        {status}
        {notSaved && ' Your browser would not let us save this choice, so it only lasts until you close this page.'}
      </p>
    </div>
  )
}

function PrivacyPolicy() {
  const navigate = useNavigate()

  // This page is often opened in a new tab (the sign-up form's links do
  // that), where there is no earlier page to go back to. React Router keeps
  // its position in history.state.idx; 0 means this is the first page.
  const goBack = () => {
    if (window.history.state?.idx > 0) navigate(-1)
    else navigate('/')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <button
              onClick={goBack}
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
          <p className="text-center text-green-700 font-medium mb-2">Dogleg.io</p>
          <p className="text-center text-gray-500 text-sm mb-8">Last updated: {LAST_UPDATED}</p>

          <div className="prose prose-gray max-w-none">
            <p className="text-gray-700 mb-4">
              This Privacy Policy explains what information Dogleg ("we," "us," or "our") collects when you use the Dogleg website and web app at dogleg.io (the "Service"), how we use it, who can see it, and the choices you have.
            </p>
            <p className="text-gray-700 mb-6">
              Questions or requests? Email us at <EmailLink />.
            </p>

            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">1. Information We Collect</h2>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">1.1 Information You Give Us</h3>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li><strong>Account information:</strong> your email address, username and full name. If your account was created with a phone number, that number.</li>
              <li><strong>Sign-in information:</strong> your password (we only ever store it in scrambled, hashed form), or, if you use Google Sign-In, the name and email address of your Google account.</li>
              <li><strong>Profile information (optional):</strong> a profile picture, bio, location and handicap, if you add them.</li>
              <li><strong>Golf data:</strong> the rounds you post: course, date, scores (including hole-by-hole scores if you enter them), any caption and photo you add, and the statistics we calculate from them, such as your handicap and Dogleg Scores.</li>
              <li><strong>Social activity:</strong> who you follow, who follows you, and the comments and reactions you post.</li>
              <li><strong>Newsletter choice:</strong> whether you ticked the optional newsletter box when you signed up.</li>
              <li><strong>Messages:</strong> anything you send us by email.</li>
            </ul>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">1.2 Information Collected Automatically</h3>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li><strong>Usage information (Google Analytics):</strong> pages viewed, how you got to Dogleg, device and browser type, and approximate location (such as country or city). See section 6 for cookies and how to turn this off.</li>
              <li><strong>Page-view counts (Vercel Web Analytics):</strong> anonymous counts of page visits, collected without cookies.</li>
              <li><strong>Error reports (Sentry):</strong> when something goes wrong in the app (for example, a crash), a report with technical details (such as the error, the page and your browser) and, if you are signed in, your account's random user ID. Reports never include your email address or name.</li>
              <li><strong>Server logs:</strong> our hosting providers keep standard technical logs of requests (such as IP address, time and the address requested) to run the Service and keep it secure.</li>
            </ul>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">1.3 Your Device's Location</h3>
            <p className="text-gray-700 mb-4">
              When you search for a course to add a round, you can choose to search for courses near you. Your browser will ask for permission first. Your device's location is then used only to find nearby courses; we don't save it to your account. You can say no and search by name instead, and you can turn off location access in your browser or device settings at any time.
            </p>

            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">2. How We Use Your Information</h2>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li>Run the Service: create and manage your account and sign you in</li>
              <li>Show and score your rounds, and calculate your handicap, Dogleg Scores and other statistics</li>
              <li>Power the social features: your feed (including choosing the order of posts in it), follows, comments, reactions and in-app notifications</li>
              <li>Send account emails, such as confirming your email address and resetting your password</li>
              <li>Send our newsletter, only if you opted in when you signed up</li>
              <li>Understand how Dogleg is used so we can improve it (analytics)</li>
              <li>Find and fix bugs (error reports)</li>
              <li>Keep Dogleg safe: moderate content, enforce our Terms of Service, and prevent abuse</li>
              <li>Comply with the law</li>
            </ul>

            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">3. Who Can See Your Information</h2>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">3.1 Other Dogleg Users</h3>
            <p className="text-gray-700 mb-4">
              Dogleg is a social app. Other signed-in Dogleg users can see your profile (username, name, profile picture and the other details you add, such as your location, handicap and bio), the rounds you post with their scores, captions and photos, your golf statistics, who you follow and who follows you, and the comments and reactions you post. Other users can also find you by searching for your username or name.
            </p>
            <p className="text-gray-700 mb-4">
              If your account has a phone number, it is kept with your sign-in details, not in your profile, and is not shown to other users. Your newsletter choice is not shown to other users in the app.
            </p>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">3.2 Anyone With a Round's Link</h3>
            <p className="text-gray-700 mb-4">
              Each round has its own web page (for example, the link you get from the Share button). Anyone who has that link can open the page, even without a Dogleg account. It shows the round (course, date, score, scorecard and photo), your username, name and profile picture, how many reactions it has, and its comments with each commenter's username, name and profile picture. When a round's link is shared in a messaging or social app, that app may show a preview with the score, course and photo.
            </p>
            <p className="text-gray-700 mb-4">
              We ask search engines not to list round pages in their search results, and the major search engines respect that request. It doesn't make a round private, though: anyone who has the link can still open the page and pass the link on, including anyone who finds it where it has been posted publicly.
            </p>
            <p className="text-gray-700 mb-4">
              Photos you upload (round photos and profile pictures) are stored at public web addresses, so anyone who has a photo's address can view it.
            </p>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">3.3 Photo Location Data Is Removed</h3>
            <p className="text-gray-700 mb-4">
              Photos taken on phones and cameras often contain hidden information (called EXIF metadata), such as the GPS location where the photo was taken. Before a round photo or profile picture is uploaded, the app re-saves it on your device, which removes this information. This is done in your browser by code that is part of the Dogleg app (nothing is downloaded from another company to do it), and the original photo is never uploaded.
            </p>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">3.4 Service Providers</h3>
            <p className="text-gray-700 mb-4">
              <strong>We do not sell your personal information.</strong> We use these companies to run Dogleg, and they process information on our behalf:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li><strong>Supabase:</strong> hosts our database, user accounts and sign-in, and photo storage. Your account and everything you post is stored with Supabase.</li>
              <li><strong>Vercel:</strong> hosts the Dogleg website and provides Vercel Web Analytics (cookieless page-view counts).</li>
              <li><strong>Google:</strong> Google Sign-In (if you choose to use it) and Google Analytics.</li>
              <li><strong>Sentry:</strong> error monitoring (crash reports, as described in section 1.2).</li>
            </ul>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">3.5 Legal Requirements and Business Transfers</h3>
            <p className="text-gray-700 mb-4">
              We may disclose information if the law requires it or in response to valid requests by public authorities, or when we believe in good faith that it is necessary to protect the rights, property or safety of Dogleg, our users or the public. If Dogleg is involved in a merger, acquisition or sale of assets, your information may be transferred as part of that deal; we will tell you before your information becomes subject to a different privacy policy.
            </p>

            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">4. Notifications and Emails</h2>
            <p className="text-gray-700 mb-4">
              Dogleg's notifications (for example, when someone follows you, reacts to or comments on your round) appear inside the app only. We don't send push notifications.
            </p>
            <p className="text-gray-700 mb-4">
              We send account emails, such as email confirmation and password-reset emails, through Supabase. We only send newsletters if you ticked the newsletter box when you signed up; to stop them, email <EmailLink /> and we will take you off the list.
            </p>

            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">5. Keeping and Deleting Your Information</h2>
            <p className="text-gray-700 mb-4">
              We keep your information for as long as you have a Dogleg account.
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li><strong>Deleting a round:</strong> you can delete any of your rounds in the app. The round and its photo are removed.</li>
              <li>
                <strong>Deleting your account:</strong> email <EmailLink /> from the email address on your Dogleg account and ask us to delete it. We will delete your account and everything connected to it (your profile, rounds, photos, comments, reactions and follows) within 30 days, and email you when it's done. Account deletion is not yet available in the app's settings.
              </li>
              <li><strong>Removed content:</strong> if we remove content for breaking our Terms of Service, it is hidden from everyone; we may keep a record of it for moderation and safety purposes.</li>
            </ul>
            <p className="text-gray-700 mb-4">
              Copies of deleted information may remain in our providers' backups for a limited time until they are overwritten. Error reports and analytics data are kept for the periods our providers allow and are then deleted.
            </p>

            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">6. Cookies, Browser Storage and Analytics</h2>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li><strong>Essential browser storage:</strong> Dogleg keeps your sign-in session and a few app settings (such as your analytics choice below, and whether you dismissed the "add to home screen" tip) in your browser's local storage. The app needs these to work, and we don't use them for tracking.</li>
              <li>
                <strong>Google Analytics cookies:</strong> Google Analytics sets cookies (named <code>_ga</code> and <code>_ga_…</code>) to tell visits apart and count returning visitors. We use Google's Consent Mode:
                <ul className="list-[circle] pl-6 mt-2 space-y-1">
                  <li>In the European Economic Area (EEA), the UK and Switzerland, analytics and advertising cookies are <strong>off</strong> unless you turn them on below.</li>
                  <li>Everywhere else they are <strong>on</strong> unless you turn them off below.</li>
                  <li>While they are off, Google Analytics does not store or read cookies on your device. Google may still receive basic, cookieless information that a page was visited.</li>
                  <li>Turning them off also deletes the Google Analytics cookies already stored for Dogleg in this browser.</li>
                </ul>
              </li>
              <li><strong>Vercel Web Analytics:</strong> counts page views without using cookies.</li>
            </ul>

            <AnalyticsCookieSetting />

            <p className="text-gray-700 mb-4">
              You can also block or delete cookies and site data in your browser settings. If you block local storage, you won't be able to stay signed in.
            </p>

            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">7. Your Rights and Choices</h2>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li><strong>Access and correction:</strong> you can see and edit your profile in the app at any time. To get a copy of your information, email us.</li>
              <li><strong>Deletion:</strong> email us as described in section 5.</li>
              <li><strong>Analytics:</strong> use the analytics cookie setting in section 6.</li>
              <li><strong>Location:</strong> don't use the "near you" course search, or turn off location access in your browser or device settings.</li>
            </ul>
            <p className="text-gray-700 mb-4">
              Depending on where you live, you may have further rights, such as to access, correct, delete or receive a copy of your information, to object to or restrict how we use it, and to withdraw consent. To use any of these rights, email <EmailLink /> from the email address on your account. We will reply within 30 days.
            </p>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">7.1 California Residents</h3>
            <p className="text-gray-700 mb-4">
              California residents have the right to know what personal information we collect, to ask us to correct or delete it, and not to be treated differently for using these rights. We do not sell personal information. To make a request, email <EmailLink />.
            </p>

            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">7.2 EEA, UK and Swiss Residents</h3>
            <p className="text-gray-700 mb-4">
              We use your information to provide the Service you signed up for (performance of our contract with you); for our legitimate interests in keeping Dogleg secure, fixing errors and understanding basic usage; and, for analytics cookies, with your consent, which you can withdraw at any time using the setting in section 6. You also have the right to complain to your local data protection authority.
            </p>

            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">8. Security</h2>
            <p className="text-gray-700 mb-4">
              We protect your information with measures such as encryption in transit (HTTPS), hashed passwords, and database access rules that limit what each account can read and change. No method of transmission or storage is 100% secure, so we cannot guarantee absolute security.
            </p>

            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">9. International Data Transfers</h2>
            <p className="text-gray-700 mb-4">
              Dogleg is based in the United States. Our service providers may store and process your information in the United States and other countries, which may have different data protection rules than where you live.
            </p>

            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">10. Children's Privacy</h2>
            <p className="text-gray-700 mb-4">
              Dogleg is not intended for children under 13, and we do not knowingly collect personal information from children under 13. If you believe a child under 13 has given us personal information, please contact us at <EmailLink /> and we will delete it.
            </p>

            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">11. Links to Other Websites</h2>
            <p className="text-gray-700 mb-4">
              The Service may link to other websites or services. We are not responsible for their privacy practices, so please read their privacy policies.
            </p>

            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">12. Changes to This Privacy Policy</h2>
            <p className="text-gray-700 mb-4">
              We may update this Privacy Policy from time to time. When we do, we will post the new version on this page and change the "Last updated" date at the top. For significant changes, we may also tell you by email or in the app.
            </p>

            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">13. Contact Us</h2>
            <p className="text-gray-700 mb-2">
              <strong>Email:</strong> <EmailLink />
            </p>
            <p className="text-gray-700 mb-4">
              <strong>Website:</strong> <a href="https://dogleg.io" className="text-green-700 hover:underline">https://dogleg.io</a>
            </p>

            <p className="text-center text-gray-500 italic mt-8">
              Thank you for trusting Dogleg with your information. ⛳
            </p>
            <p className="text-center text-gray-400 text-sm mt-4">© {new Date().getFullYear()} Dogleg.io</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PrivacyPolicy
