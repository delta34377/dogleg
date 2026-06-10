import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { reactionEmojis } from '../utils/constants'

// Mock round data for the feature showcase
const demoPars = [4, 5, 4, 3, 4, 4, 5, 3, 4]
const demoScores = [4, 5, 3, 4, 4, 5, 5, 2, 5]

// Same score coloring as the real Scorecard in Feed/MyRounds
const getScoreStyle = (score, par) => {
  const diff = score - par
  if (diff <= -2) return { backgroundColor: '#0d7d0d', color: '#fff' }
  if (diff === -1) return { backgroundColor: '#4caf50', color: '#fff' }
  if (diff === 0) return { backgroundColor: 'white', color: '#333' }
  if (diff === 1) return { backgroundColor: '#ffcdd2', color: '#333' }
  if (diff === 2) return { backgroundColor: '#ef5350', color: '#fff' }
  return { backgroundColor: '#c62828', color: '#fff' }
}

// Mini app chrome so each mock reads as a screen from the app
function MockAppFrame({ children }) {
  return (
    <div className="w-full max-w-[300px] mx-auto bg-white rounded-2xl shadow-xl ring-1 ring-black/5 overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-gray-100 bg-white">
        <img src="/icon-192.png" alt="" className="w-6 h-6 object-contain" />
        <span className="font-bold text-sm text-green-700">Dogleg.io</span>
      </div>
      {children}
    </div>
  )
}

// Slide 1: a feed-style round card — score, photo, scorecard, caption
function MockRoundCard() {
  return (
    <MockAppFrame>
      <div className="px-3 pt-2 pb-1.5">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center">
            <span className="text-green-700 font-semibold text-[9px]">MG</span>
          </div>
          <span className="text-xs text-gray-600">mark_g posted a round</span>
        </div>
      </div>

      <div className="px-3 pb-2 border-b">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="font-bold text-sm">Pebble Creek Golf Club</h3>
            <p className="text-gray-600 text-[11px]">Phoenix, AZ</p>
            <p className="text-[10px] text-gray-500 mt-0.5">6/7/2026 • Blue tees • 6,612y</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold leading-none">79</div>
            <div className="text-base font-bold text-orange-600">+7</div>
          </div>
        </div>
      </div>

      {/* Illustrated "round photo" */}
      <div className="px-2 pt-2">
        <div className="relative h-24 rounded-lg overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-sky-300 via-sky-200 to-emerald-300"></div>
          <div className="absolute top-2 right-4 w-6 h-6 bg-amber-200 rounded-full opacity-90"></div>
          <div className="absolute -bottom-8 -left-6 w-40 h-20 bg-emerald-500 rounded-[100%]"></div>
          <div className="absolute -bottom-10 right-0 w-48 h-20 bg-emerald-600 rounded-[100%]"></div>
          <div className="absolute bottom-3 right-12 w-8 h-3 bg-amber-100 rounded-[100%]"></div>
          <div className="absolute bottom-5 left-16">
            <div className="w-0 h-0 border-y-[4px] border-y-transparent border-l-[9px] border-l-red-500 ml-[2px]"></div>
            <div className="w-[2px] h-7 bg-gray-50"></div>
          </div>
        </div>
      </div>

      {/* Front-9 scorecard, real colors */}
      <div className="px-2 pt-2">
        <div className="bg-gray-100 px-2 py-1 rounded-t-lg">
          <span className="text-[10px] font-bold text-gray-700">SCORECARD</span>
        </div>
        <div className="bg-white border border-gray-200 rounded-b-lg p-2">
          <div className="grid grid-cols-10 gap-0.5 text-center text-[9px]">
            {demoPars.map((_, i) => (
              <div key={`h-${i}`} className="text-gray-600 font-medium">{i + 1}</div>
            ))}
            <div className="text-gray-600 font-bold">OUT</div>
            {demoPars.map((par, i) => (
              <div key={`p-${i}`} className="text-gray-500 bg-gray-50 py-0.5 rounded">P{par}</div>
            ))}
            <div className="text-gray-500 bg-gray-50 py-0.5 rounded font-bold">36</div>
            {demoScores.map((score, i) => (
              <div key={`s-${i}`} className="py-1 rounded font-medium" style={getScoreStyle(score, demoPars[i])}>
                {score}
              </div>
            ))}
            <div className="py-1 bg-gray-900 text-white font-bold rounded">37</div>
          </div>
        </div>
      </div>

      {/* Caption, exact amber styling from the feed */}
      <div className="px-2 pt-2 pb-3">
        <div className="bg-amber-50 border-l-4 border-amber-400 p-2 rounded">
          <p className="text-[11px]">💬 Broke 80 for the first time!! 🍻⛳</p>
        </div>
      </div>
    </MockAppFrame>
  )
}

// Slide 2: reactions + comment thread on a friend's round
function MockComments() {
  const counts = { fire: 12, clap: 8, dart: 0, goat: 5, vomit: 1, clown: 3, skull: 2, laugh: 6 }
  const mine = ['fire', 'goat']
  const comments = [
    { author: 'sarah.golfs', text: 'Back 9 was a movie 🍿' },
    { author: 'chip_n_sip', text: 'no way that putt on 17 dropped 💀' },
    { author: 'mark_g', text: 'running it back saturday?' },
  ]

  return (
    <MockAppFrame>
      <div className="px-3 pt-2 pb-1.5 border-b">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center">
            <span className="text-green-700 font-semibold text-[9px]">T</span>
          </div>
          <span className="text-xs text-gray-600">
            tommy_3putt shot <span className="font-bold text-gray-800">91</span> at Torrey Pines
          </span>
        </div>
      </div>

      <div className="px-2 pb-3">
        <div className="flex flex-wrap items-center gap-0.5 py-2 border-b">
          {Object.entries(reactionEmojis).map(([key, emoji]) => (
            <span
              key={key}
              className={`flex items-center gap-0.5 px-1 py-0.5 rounded-full ${mine.includes(key) ? 'bg-green-100' : ''}`}
            >
              <span className="text-sm">{emoji}</span>
              {counts[key] > 0 && <span className="font-medium text-[10px]">{counts[key]}</span>}
            </span>
          ))}
        </div>

        <div className="bg-gray-50 rounded-lg p-2 mt-2">
          <div className="space-y-1.5 mb-2">
            {comments.map((c) => (
              <div key={c.author} className="bg-white rounded p-1.5">
                <span className="font-semibold text-[11px] text-blue-600">{c.author}</span>
                <span className="text-gray-500 text-[9px] ml-1.5">• 2h</span>
                <p className="text-[11px] mt-0.5">{c.text}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-1.5">
            <div className="flex-1 px-2.5 py-1.5 border rounded-full text-[11px] text-gray-800 bg-white">
              still buying the beers tho 🍺
            </div>
            <div className="px-3 py-1.5 bg-green-600 text-white rounded-full text-[11px] font-medium">Post</div>
          </div>
        </div>
      </div>
    </MockAppFrame>
  )
}

// Slide 3: the generated share image + share actions
function MockShareCard() {
  return (
    <div className="w-full max-w-[300px] mx-auto">
      <div className="w-[220px] mx-auto rounded-xl overflow-hidden shadow-xl ring-1 ring-black/10">
        <div className="relative h-[180px] bg-gradient-to-br from-green-700 via-green-800 to-green-950 p-2.5 text-white">
          <div className="flex items-center gap-1">
            <span className="text-[10px]">⛳</span>
            <span className="text-[10px] font-bold">dogleg.io</span>
          </div>
          <p className="text-[9px] opacity-90 mt-2">mark_g posted a score</p>
          <h4 className="text-sm font-bold leading-tight">Pebble Creek Golf Club</h4>
          <p className="text-[8px] opacity-80 mt-0.5">6/7/2026 • Phoenix, AZ</p>
          <div className="absolute bottom-1.5 left-2.5 flex items-end gap-1.5">
            <span className="text-5xl font-bold leading-none">79</span>
            <span className="text-lg font-bold text-red-300">(+7)</span>
          </div>
        </div>
        <div className="h-[95px] bg-gradient-to-b from-slate-100 to-slate-200 flex items-center justify-center gap-3">
          <div className="bg-white rounded-lg shadow-sm px-4 py-1.5 text-center">
            <div className="text-[9px] text-slate-500">Front 9</div>
            <div className="text-lg font-bold text-slate-800">37</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm px-4 py-1.5 text-center">
            <div className="text-[9px] text-slate-500">Back 9</div>
            <div className="text-lg font-bold text-slate-800">42</div>
          </div>
        </div>
      </div>

      <div className="flex gap-2 mt-3 max-w-[260px] mx-auto">
        <div className="flex-1 flex items-center justify-center gap-1 py-2 bg-gray-100 rounded-lg text-xs font-medium text-gray-700">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          Copy Link
        </div>
        <div className="flex-1 flex items-center justify-center gap-1 py-2 bg-green-600 text-white rounded-lg text-xs font-medium">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Share Image
        </div>
      </div>
      <p className="text-[10px] text-center text-gray-500 mt-2">Shares directly to Instagram, Messages, and more</p>
    </div>
  )
}

function LandingPage() {
  const navigate = useNavigate()
  const featuresRef = useRef(null)
  const trackRef = useRef(null)
  const [activeSlide, setActiveSlide] = useState(0)

  const goToSignUp = () => navigate('/login', { state: { mode: 'signup' } })
  const goToSignIn = () => navigate('/login')

  const features = [
    {
      step: '01',
      title: 'Post your rounds',
      description:
        'Pick from 22,000+ courses, punch in your scores hole-by-hole, and add a photo and a caption. Done in under 30 seconds.',
      mock: <MockRoundCard />,
    },
    {
      step: '02',
      title: "Pile on your friends' rounds",
      description:
        'Follow your crew and see every round they post. React with a 🔥 (or a 🤡) and keep the trash talk going in the comments.',
      mock: <MockComments />,
    },
    {
      step: '03',
      title: 'Share it anywhere',
      description:
        'Every round becomes a clean scorecard graphic, ready for Instagram, iMessage, or the group chat.',
      mock: <MockShareCard />,
    },
  ]

  const handleTrackScroll = () => {
    const el = trackRef.current
    if (!el || !el.children.length) return
    const step = el.children[0].offsetWidth + 16 // slide width + gap-4
    const index = Math.round(el.scrollLeft / step)
    setActiveSlide(Math.max(0, Math.min(features.length - 1, index)))
  }

  const scrollToSlide = (index) => {
    const el = trackRef.current
    if (!el || !el.children.length) return
    const step = el.children[0].offsetWidth + 16
    el.scrollTo({ left: index * step, behavior: 'smooth' })
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/icon-192.png" alt="Dogleg" className="w-10 h-10 object-contain" />
            <span className="font-bold text-xl text-green-700">Dogleg.io</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={goToSignIn}
              className="px-3 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
            >
              Sign In
            </button>
            <button
              onClick={goToSignUp}
              className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700"
            >
              Get Started
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-gradient-to-b from-green-50 to-white">
        <div className="max-w-5xl mx-auto px-4 pt-14 pb-12 sm:pt-20 sm:pb-16 text-center">
          <span className="inline-block px-3 py-1 bg-green-100 text-green-800 text-xs font-semibold rounded-full mb-4">
            ⛳ The social scorecard
          </span>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 tracking-tight">
            Your golf life, <span className="text-green-600">socialized.</span>
          </h1>
          <p className="mt-4 max-w-xl mx-auto text-base sm:text-lg text-gray-600">
            Post your rounds, follow your buddies, and keep the trash talk going long after the
            19th hole. Think Strava, for golf.
          </p>
          <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={goToSignUp}
              className="w-full sm:w-auto px-8 py-3 bg-green-600 text-white rounded-lg font-semibold text-base hover:bg-green-700 shadow-sm"
            >
              Create Free Account
            </button>
            <button
              onClick={() => featuresRef.current?.scrollIntoView({ behavior: 'smooth' })}
              className="w-full sm:w-auto px-8 py-3 bg-white text-gray-700 border-2 border-gray-300 rounded-lg font-semibold text-base hover:bg-gray-50"
            >
              See how it works ↓
            </button>
          </div>
          <p className="mt-4 text-sm text-gray-500">
            Already on Dogleg?{' '}
            <button onClick={goToSignIn} className="font-semibold text-green-600 hover:text-green-700">
              Sign in
            </button>
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm text-gray-600">
            <span>⛳ 22,000+ courses built in</span>
            <span>⏱️ Post a round in under 30 seconds</span>
            <span>💯 Free to play</span>
          </div>
        </div>
      </section>

      {/* Feature showcase */}
      <section ref={featuresRef} className="py-12 sm:py-16 scroll-mt-14">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <p className="text-xs font-bold tracking-widest text-green-600 uppercase">How it works</p>
          <h2 className="mt-2 text-2xl sm:text-3xl font-bold text-gray-900">
            Golf is better when your friends are watching
          </h2>
        </div>

        <div
          className="mt-8 max-w-5xl mx-auto"
          role="region"
          aria-roledescription="carousel"
          aria-label="What you can do on Dogleg"
        >
          <div
            ref={trackRef}
            onScroll={handleTrackScroll}
            className="flex gap-4 overflow-x-auto snap-x snap-mandatory px-6 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:grid md:grid-cols-3 md:gap-6 md:overflow-visible md:px-4"
          >
            {features.map((feature, i) => (
              <div
                key={feature.step}
                className="w-[82%] flex-shrink-0 snap-center md:w-auto"
                aria-label={`${i + 1} of ${features.length}`}
              >
                <div className="h-[440px] rounded-3xl bg-gradient-to-br from-green-100 via-green-50 to-emerald-50 p-4 flex items-center justify-center overflow-hidden">
                  {feature.mock}
                </div>
                <div className="mt-4 px-1 text-left">
                  <p className="text-sm font-bold text-green-600">{feature.step}</p>
                  <h3 className="mt-1 text-lg font-bold text-gray-900">{feature.title}</h3>
                  <p className="mt-1 text-sm text-gray-600">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Dots (mobile only) */}
          <div className="flex justify-center gap-2 mt-4 md:hidden">
            {features.map((feature, i) => (
              <button
                key={feature.step}
                onClick={() => scrollToSlide(i)}
                aria-label={`Go to slide ${i + 1}`}
                aria-current={activeSlide === i}
                className={`h-2 rounded-full transition-all ${
                  activeSlide === i ? 'w-6 bg-green-600' : 'w-2 bg-gray-300'
                }`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="px-4 pb-12 sm:pb-16">
        <div className="max-w-5xl mx-auto bg-green-700 rounded-3xl px-6 py-12 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white">
            Your next round deserves an audience.
          </h2>
          <p className="mt-2 text-green-100">Free to join. Your buddies are one follow away.</p>
          <button
            onClick={goToSignUp}
            className="mt-6 px-8 py-3 bg-white text-green-700 rounded-lg font-semibold hover:bg-green-50"
          >
            Create Free Account
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-6">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-gray-500">
          <span>© {new Date().getFullYear()} Dogleg.io</span>
          <div className="flex gap-4">
            <a href="/terms" className="hover:text-gray-700">Terms</a>
            <a href="/privacy" className="hover:text-gray-700">Privacy</a>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default LandingPage
