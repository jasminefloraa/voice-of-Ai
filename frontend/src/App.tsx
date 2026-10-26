import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

type Section =
  | 'overview'
  | 'agents'
  | 'studio'
  | 'history'
  | 'analytics'
  | 'settings'

type User = {
  id: number
  name: string
  email: string
  role?: string
  created_at?: string
  last_login_at?: string
}

type LoginFormValues = {
  email: string
  password: string
}

const navItems: Array<{ key: Section; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'studio', label: 'Voice Studio' },
  { key: 'agents', label: 'Agents' },
  { key: 'history', label: 'History' },
  { key: 'settings', label: 'Profile' },
]

type SessionRecord = {
  id: number
  session_id: string
  agent: string
  customer_name?: string
  objective?: string
  transcript?: string
  status?: string
  outcome?: string
  created_at?: string
  duration_seconds?: number
}

const agentMeta = {
  loan_settlement: {
    name: 'Personal Loan Settlement Agent',
    description: 'Commercially focused settlement conversations for overdue personal loans.',
    status: 'Ready',
    language: 'English • Hindi',
    voice: 'Premium call voice',
    objective: 'Resolve the account with a realistic commitment or human escalation.',
  },
  insurance_renewal: {
    name: 'Car Insurance Renewal Agent',
    description: 'Value-based renewal guidance for Maruti Brezza policy decisions.',
    status: 'Ready',
    language: 'English • Hindi',
    voice: 'Consultative renewal tone',
    objective: 'Present suitable coverage with clear trade-offs and a clear renewal decision.',
  },
} as const

const defaultAnalytics = {
  metrics: {
    total_calls: 0,
    completed_calls: 0,
    successful_commitments: 0,
    success_rate: 0,
    average_duration_seconds: 0,
  },
  sessions: [] as SessionRecord[],
}

const STUDIO_HINT_KEY = 'creditnirvana-studio-hint-dismissed'
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8001'

function App() {
  const [section, setSection] = useState<Section>('overview')
  const [selectedAgent, setSelectedAgent] = useState<'loan_settlement' | 'insurance_renewal'>('loan_settlement')
  const [sessions, setSessions] = useState<SessionRecord[]>([])
  const [analytics, setAnalytics] = useState(defaultAnalytics)
  const [serviceStatus, setServiceStatus] = useState<{ backend: 'connected' | 'offline'; voice: 'connected' | 'demo' | 'offline' }>({
    backend: 'offline',
    voice: 'demo',
  })
  const [activeSession, setActiveSession] = useState<SessionRecord | null>(null)
  const [callState, setCallState] = useState<'idle' | 'listening' | 'processing' | 'speaking' | 'error'>('idle')
  const [transcript, setTranscript] = useState<{ speaker: string; text: string }[]>([
    { speaker: 'agent', text: 'Hello, I am here to discuss the next step and agree on a realistic plan.' },
  ])
  const [inputText, setInputText] = useState('')
  const [muted, setMuted] = useState(false)
  const [isMicrophoneActive, setIsMicrophoneActive] = useState(false)
  const [micError, setMicError] = useState<string | null>(null)
  const [showStudioHint, setShowStudioHint] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(STUDIO_HINT_KEY) !== 'true'
  })
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [authStatus, setAuthStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading')
  const [user, setUser] = useState<User | null>(null)
  const [accountLoading, setAccountLoading] = useState(false)
  const [accountError, setAccountError] = useState('')
  const [loginForm, setLoginForm] = useState<LoginFormValues>({ email: '', password: '' })
  const [loginErrors, setLoginErrors] = useState<Partial<Record<keyof LoginFormValues, string>>>({})
  const [loginSubmitting, setLoginSubmitting] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const lastAgentReplyRef = useRef('')

  const getInitials = (name: string) =>
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || 'CN'

  const validateLoginForm = () => {
    const nextErrors: Partial<Record<keyof LoginFormValues, string>> = {}
    const email = loginForm.email.trim()

    if (!email) {
      nextErrors.email = 'Email is required.'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      nextErrors.email = 'Enter a valid work email.'
    }

    if (!loginForm.password) {
      nextErrors.password = 'Password is required.'
    } else if (loginForm.password.length < 6) {
      nextErrors.password = 'Password must be at least 6 characters.'
    }

    setLoginErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const loadCurrentUser = async () => {
    setAccountLoading(true)
    setAccountError('')

    try {
      const response = await fetch(`${API_BASE}/api/me`, { credentials: 'include' })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'Authentication failed')
      }

      setUser(data.user)
      setAuthStatus('authenticated')
      setSection('overview')
    } catch (error) {
      setUser(null)
      setAuthStatus('unauthenticated')
      setSection('overview')
    } finally {
      setAccountLoading(false)
    }
  }

  const handleLoginSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!validateLoginForm()) return

    setLoginSubmitting(true)
    setLoginError('')

    try {
      const response = await fetch(`${API_BASE}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: loginForm.email.trim().toLowerCase(),
          password: loginForm.password,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.detail || 'Unable to sign in.')
      }

      setUser(data.user)
      setAuthStatus('authenticated')
      setLoginForm({ email: '', password: '' })
      setLoginErrors({})
      setSection('overview')
      void loadData()
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Unable to sign in. Please try again.')
      setAuthStatus('unauthenticated')
    } finally {
      setLoginSubmitting(false)
    }
  }

  const handleSignOut = async () => {
    try {
      await fetch(`${API_BASE}/api/logout`, {
        method: 'POST',
        credentials: 'include',
      })
    } catch (error) {
      console.warn('Sign out request failed:', error)
    } finally {
      setUser(null)
      setAuthStatus('unauthenticated')
      setSection('overview')
    }
  }

  useEffect(() => {
    void loadCurrentUser()
  }, [])

  useEffect(() => {
    if (authStatus !== 'authenticated') return
    void loadData()
  }, [authStatus])

  const overviewStats = useMemo(() => {
    const metrics = analytics?.metrics ?? defaultAnalytics.metrics
    const total = metrics.total_calls || 0
    const completed = metrics.completed_calls || 0
    const success = metrics.successful_commitments || 0
    return {
      total,
      completed,
      success,
      conversion: metrics.success_rate || 0,
      avgDuration: metrics.average_duration_seconds || 0,
    }
  }, [analytics])

  const loadData = async () => {
    try {
      const [healthRes, configRes, analyticsRes, sessionsRes] = await Promise.all([
        fetch(`${API_BASE}/api/health`, { credentials: 'include' }),
        fetch(`${API_BASE}/api/config`, { credentials: 'include' }),
        fetch(`${API_BASE}/api/analytics`, { credentials: 'include' }),
        fetch(`${API_BASE}/api/sessions`, { credentials: 'include' }),
      ])

      const healthData = await healthRes.json().catch(() => ({ status: 'offline' }))
      const configData = await configRes.json()
      const analyticsData = await analyticsRes.json()
      const sessionData = await sessionsRes.json()

      setAnalytics(analyticsData)
      setSessions(sessionData.sessions || [])
      setServiceStatus({
        backend: healthData.status === 'ok' ? 'connected' : 'offline',
        voice: configData.sarvam?.configured ? 'connected' : configData.demo_mode ? 'demo' : 'offline',
      })
    } catch (error) {
      console.warn('Backend not ready yet:', error)
      setServiceStatus({ backend: 'offline', voice: 'offline' })
    }
  }

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = muted ? 0 : 1
    }
    if ('speechSynthesis' in window) {
      const voices = window.speechSynthesis.getVoices()
      if (voices.length > 0 && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel()
      }
    }
  }, [muted])

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      const isMeta = event.metaKey || event.ctrlKey
      if (isMeta && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandPaletteOpen((current) => !current)
      }
      if (event.key === '/' && !event.shiftKey && !isMeta) {
        const target = event.target as HTMLElement | null
        if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return
        event.preventDefault()
        const element = document.getElementById('message-input')
        element?.focus()
      }
      if (event.key === 'Escape') {
        setCommandPaletteOpen(false)
        stopPlayback()
      }
    }

    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [])

  const dismissStudioHint = () => {
    setShowStudioHint(false)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STUDIO_HINT_KEY, 'true')
    }
  }

  const stopPlayback = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    setCallState('idle')
  }

  const playVoiceReply = async (text: string) => {
    if (!text.trim()) return

    lastAgentReplyRef.current = text
    try {
      const response = await fetch(`${API_BASE}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          text,
          language_code: 'en-IN',
          speaker: 'kavya_hi_conversational',
        }),
      })
      const data = await response.json()
      if (!data.audio_base64) {
        throw new Error('No audio payload returned from backend.')
      }

      const binary = atob(data.audio_base64)
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
      const blob = new Blob([bytes], { type: data.mime_type || 'audio/wav' })
      const url = URL.createObjectURL(blob)

      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
      }

      const audio = new Audio(url)
      audioRef.current = audio
      audio.volume = muted ? 0 : 1
      audio.onended = () => {
        setCallState('idle')
        URL.revokeObjectURL(url)
      }
      audio.onerror = () => {
        console.warn('Browser could not play the generated voice response.')
        setCallState('idle')
        URL.revokeObjectURL(url)
      }

      if (typeof window !== 'undefined' && 'AudioContext' in window) {
        const audioContext = new window.AudioContext()
        if (audioContext.state === 'suspended') {
          await audioContext.resume()
        }
      }

      await audio.play()
      setCallState('speaking')
    } catch (error) {
      console.warn('Unable to play generated voice; falling back to browser speech synthesis.', error)
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel()
        const utterance = new SpeechSynthesisUtterance(text)
        utterance.lang = 'en-IN'
        utterance.rate = 1
        utterance.volume = muted ? 0 : 1
        window.speechSynthesis.speak(utterance)
        setCallState('speaking')
      } else {
        setCallState('idle')
      }
    }
  }

  const stopMicrophoneCapture = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop())
      mediaStreamRef.current = null
    }

    setIsMicrophoneActive(false)
    if (callState !== 'error') {
      setCallState('idle')
    }
  }

  const transcribeVoiceBlob = async (blob: Blob) => {
    setCallState('processing')
    const formData = new FormData()
    formData.append('file', blob, 'customer-message.webm')

    try {
      const response = await fetch(`${API_BASE}/api/stt`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.detail || 'Speech-to-text failed.')
      }

      const recognizedText = data.transcript || ''
      if (!recognizedText.trim()) {
        setMicError('No speech was recognized. Please type your message or try speaking more clearly.')
        setCallState('error')
        return
      }

      setMicError(null)
      await submitCustomerMessage(recognizedText)
    } catch (error) {
      console.warn('Speech-to-text failed:', error)
      setMicError('Voice transcription failed. You can still type a response manually.')
      setCallState('error')
    }
  }

  const startMicrophoneCapture = async () => {
    if (isMicrophoneActive) return

    setMicError(null)
    setCallState('listening')

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('This browser does not support microphone capture.')
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      const chunks: BlobPart[] = []

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data)
        }
      }

      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
        stopMicrophoneCapture()
        await transcribeVoiceBlob(blob)
      }

      mediaRecorderRef.current = recorder
      mediaStreamRef.current = stream
      setIsMicrophoneActive(true)
      recorder.start()
    } catch (error) {
      console.warn('Microphone permission failed:', error)
      setMicError('Microphone access was denied. Use the text box when voice capture is unavailable.')
      setCallState('error')
      setIsMicrophoneActive(false)
    }
  }

  const submitCustomerMessage = async (message: string) => {
    const trimmedMessage = message.trim()
    if (!trimmedMessage) return

    const historyForReply = [...transcript, { speaker: 'customer', text: trimmedMessage }]
    setTranscript((current) => [...current, { speaker: 'customer', text: trimmedMessage }])
    setInputText('')
    setCallState('processing')

    try {
      const response = await fetch(`${API_BASE}/api/agent-response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          agent: selectedAgent,
          latest_customer_message: trimmedMessage,
          history: historyForReply,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.detail || 'AI response generation failed.')
      }

      const replyText = data.reply || 'I am unable to generate a live response right now. Please try again.'
      setTranscript((current) => [...current, { speaker: 'agent', text: replyText }])
      lastAgentReplyRef.current = replyText
      setMicError(null)
      setCallState('processing')
      void playVoiceReply(replyText)
    } catch (error) {
      const failureText = 'I could not generate a live response because the AI request failed. Please try again or type your message.'
      setTranscript((current) => [...current, { speaker: 'agent', text: failureText }])
      setMicError(error instanceof Error ? error.message : 'AI request failed.')
      setCallState('error')
    }
  }

  const startSession = async (agentKey: 'loan_settlement' | 'insurance_renewal') => {
    setSelectedAgent(agentKey)
    setSection('studio')
    setCallState('listening')
    const startMessage =
      agentKey === 'loan_settlement'
        ? 'Hello, this is the settlement desk. I am calling to confirm the status of the personal loan and agree on the next step.'
        : 'Hi, I am reviewing the Maruti Brezza renewal and the current IDV trade-off before we confirm the right coverage.'

    setTranscript([{ speaker: 'agent', text: startMessage }])
    setMicError(null)

    try {
      const response = await fetch(`${API_BASE}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          agent: agentKey,
          customer_name: 'Demo customer',
          objective: agentKey === 'loan_settlement' ? 'Resolve overdue loan' : 'Renew insurance policy',
        }),
      })
      const data = await response.json()
      setActiveSession(data)
    } catch (error) {
      console.warn('Unable to create a session:', error)
      setActiveSession({
        id: 0,
        session_id: `demo-${Date.now()}`,
        agent: agentKey,
        customer_name: 'Demo customer',
        objective: agentKey === 'loan_settlement' ? 'Resolve overdue loan' : 'Renew insurance policy',
        status: 'demo',
        outcome: 'pending',
      })
    }

    void playVoiceReply(startMessage)
  }

  const startFreshConversation = (agentKey = selectedAgent) => {
    const freshText =
      agentKey === 'loan_settlement'
        ? 'Ready when you are. Tell me the balance or the payment you can realistically manage.'
        : 'Ready when you are. Tell me what you want to compare on the renewal before we decide what matters.'

    setTranscript([{ speaker: 'agent', text: freshText }])
    setInputText('')
    setMicError(null)
    setCallState('idle')
    setSection('studio')
    void playVoiceReply(freshText)
  }

  const endSession = async () => {
    if (!activeSession) return
    try {
      await fetch(`${API_BASE}/api/sessions/${activeSession.session_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          status: 'completed',
          outcome: selectedAgent === 'loan_settlement' ? 'converted' : 'renewal_reviewed',
          duration_seconds: 240,
        }),
      })
      setCallState('idle')
      await loadData()
    } catch (error) {
      console.warn('Unable to end session:', error)
    }
  }

  const sendFallbackText = () => {
    void submitCustomerMessage(inputText)
  }

  const renderOverview = () => (
    <section className="overview-grid">
      <div className="hero-panel panel">
        <div className="hero-copy">
          <span className="eyebrow">Voice AI Studio</span>
          <h1>Warm, clear conversations that move customers forward.</h1>
          <p>
            CreditNirvana helps teams handle difficult payment and renewal conversations with a steady hand, practical guidance, and a human tone.
          </p>
        </div>
        <div className="hero-actions">
          <button type="button" className="primary" onClick={() => startSession('loan_settlement')}>
            Launch loan agent
          </button>
          <button type="button" className="secondary" onClick={() => startSession('insurance_renewal')}>
            Launch insurance agent
          </button>
        </div>
      </div>

      <div className="status-row panel compact-status">
        <div className="status-badge-group">
          <span className={`status-badge ${serviceStatus.backend === 'connected' ? 'success' : 'warning'}`}>
            {serviceStatus.backend === 'connected' ? 'Backend online' : 'Backend offline'}
          </span>
          <span className={`status-badge ${serviceStatus.voice === 'connected' ? 'success' : serviceStatus.voice === 'demo' ? 'neutral' : 'warning'}`}>
            {serviceStatus.voice === 'connected' ? 'Voice connected' : serviceStatus.voice === 'demo' ? 'Demo mode' : 'Voice offline'}
          </span>
        </div>
        <button type="button" className="ghost" onClick={() => void loadData()}>
          Refresh status
        </button>
      </div>

      <div className="agent-cards">
        <article className="panel agent-spotlight loan-agent" data-agent="loan_settlement">
          <div className="agent-visual loan-visual" aria-hidden="true">
            <div className="mini-graphic mini-graphic-loan" />
            <div className="mini-graphic mini-graphic-loan-alt" />
          </div>
          <div className="agent-content">
            <div className="card-header-row">
              <span className="eyebrow">Loan settlement</span>
              <span className="status-pill success">Ready</span>
            </div>
            <h3>Personal Loan Settlement</h3>
            <p>Clear account guidance for balance reviews, hardship checks, and realistic next steps.</p>
            <button type="button" className="primary" onClick={() => startSession('loan_settlement')}>
              Open agent <span aria-hidden="true">→</span>
            </button>
          </div>
        </article>

        <article className="panel agent-spotlight insurance-agent" data-agent="insurance_renewal">
          <div className="agent-visual insurance-visual" aria-hidden="true">
            <div className="mini-graphic mini-graphic-insurance" />
            <div className="mini-graphic mini-graphic-insurance-alt" />
          </div>
          <div className="agent-content">
            <div className="card-header-row">
              <span className="eyebrow">Insurance renewal</span>
              <span className="status-pill success">Ready</span>
            </div>
            <h3>Car Insurance Renewal</h3>
            <p>Coverage-first renewal guidance that makes value, IDV trade-offs, and clarity feel easy.</p>
            <button type="button" className="secondary" onClick={() => startSession('insurance_renewal')}>
              Open agent <span aria-hidden="true">→</span>
            </button>
          </div>
        </article>
      </div>

      <div className="overview-lower-grid">
        <div className="panel how-to-panel">
          <h3>How to test</h3>
          <ol>
            <li>Open an agent and jump into the studio.</li>
            <li>Speak naturally or type a reply.</li>
            <li>Listen for the response and review the transcript.</li>
          </ol>
        </div>

        <div className="panel recent-panel">
          <h3>Recent sessions</h3>
          <div className="table-list minimal-list">
            {(sessions.length ? sessions : []).slice(0, 4).map((item) => (
              <div key={item.session_id || item.id} className="table-row compact-row">
                <span>{item.agent === 'loan_settlement' ? 'Loan' : 'Insurance'}</span>
                <span>{item.status || 'active'}</span>
                <span>{item.outcome || 'pending'}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )

  const renderAgents = () => (
    <section className="grid-2">
      {Object.entries(agentMeta).map(([key, value]) => (
        <article key={key} className="panel agent-card">
          <div className="card-topline">
            <div>
              <span className="eyebrow">Agent</span>
              <h3>{value.name}</h3>
            </div>
            <span className="status-pill">{value.status}</span>
          </div>
          <p>{value.description}</p>
          <ul className="agent-specs">
            <li><strong>Objective:</strong> {value.objective}</li>
            <li><strong>Language:</strong> {value.language}</li>
            <li><strong>Voice:</strong> {value.voice}</li>
          </ul>
          <div className="button-row">
            <button type="button" className="primary" onClick={() => startSession(key as 'loan_settlement' | 'insurance_renewal')}>
              Start test call
            </button>
            <button type="button" className="secondary">
              Configure agent
            </button>
            <button type="button" className="ghost">
              Previous sessions
            </button>
          </div>
        </article>
      ))}
    </section>
  )

  const renderStudio = () => (
    <section className="studio-shell">
      <div className="panel studio-main">
        <div className="studio-header">
          <div>
            <span className="eyebrow">Live call studio</span>
            <h2>{agentMeta[selectedAgent].name}</h2>
          </div>
          <div className="status-row">
            <span className={`indicator ${callState}`}>{callState}</span>
            <button type="button" className="secondary" onClick={() => startFreshConversation()}>
              New conversation
            </button>
          </div>
        </div>

        {showStudioHint && (
          <div className="studio-hint" role="status">
            <div>
              <strong>Tap the mic and just talk.</strong>
              <span>You can type anytime.</span>
            </div>
            <button type="button" className="ghost small" onClick={dismissStudioHint}>
              Dismiss
            </button>
          </div>
        )}

        <div className="voice-stage">
          <button
            type="button"
            className={`voice-state-button ${callState}`}
            onClick={() => {
              if (isMicrophoneActive || callState === 'listening') {
                stopMicrophoneCapture()
                return
              }
              void startMicrophoneCapture()
            }}
            aria-label={callState === 'idle' ? 'Start speaking' : callState === 'listening' ? 'Listening' : callState === 'processing' ? 'Thinking' : callState === 'speaking' ? 'Speaking' : 'Something went wrong'}
          >
            <span className="voice-state-icon" aria-hidden="true" />
            <span className="voice-state-text">
              {callState === 'idle' && 'Tap to speak'}
              {callState === 'listening' && 'Listening…'}
              {callState === 'processing' && 'Thinking…'}
              {callState === 'speaking' && 'Speaking…'}
              {callState === 'error' && 'Something went wrong'}
            </span>
          </button>
          <div className="voice-orb-wrap">
            <div className={`voice-orb ${callState}`} aria-label="AI voice status">
              <div className="orb-ring ring-1" />
              <div className="orb-ring ring-2" />
              <div className="orb-ring ring-3" />
              <div className="orb-core" />
            </div>
          </div>
        </div>

        <div className="call-summary">
          <div>
            <label>Objective</label>
            <strong>{agentMeta[selectedAgent].objective}</strong>
          </div>
          <div>
            <label>Current concern</label>
            <strong>{selectedAgent === 'loan_settlement' ? 'Payment pressure' : 'Value comparison'}</strong>
          </div>
          <div>
            <label>Best next step</label>
            <strong>{selectedAgent === 'loan_settlement' ? 'Clarify a realistic commitment' : 'Compare policy value on facts'}</strong>
          </div>
        </div>

        <div className="waveform" aria-label="Audio waveform">
          {Array.from({ length: 28 }, (_, index) => (
            <span key={index} style={{ height: `${18 + ((index * 11) % 54)}px` }} />
          ))}
        </div>

        <div className="transcript" aria-live="polite">
          {transcript.map((entry, index) => (
            <div key={`${entry.speaker}-${index}`} className={`bubble ${entry.speaker}`}>
              <span>{entry.speaker === 'agent' ? 'Agent' : 'Customer'}</span>
              <p>{entry.text}</p>
            </div>
          ))}
        </div>

        <div className="composer">
          <textarea
            id="message-input"
            value={inputText}
            onChange={(event) => setInputText(event.target.value)}
            placeholder="Type a message…"
            aria-label="Type a response"
            title="Type a response"
            rows={1}
          />
          <button type="button" className="primary" onClick={sendFallbackText} disabled={!inputText.trim()}>
            Send
          </button>
        </div>
        {micError ? (
          <div className="mini-panel error-panel" aria-live="polite">
            <span>Voice status</span>
            <strong>{micError}</strong>
          </div>
        ) : null}
      </div>

      <aside className="panel studio-side">
        <h3>Session controls</h3>
        <div className="control-stack">
          <button type="button" className="primary" onClick={() => void startMicrophoneCapture()}>
            {isMicrophoneActive ? 'Listening…' : 'Start listening'}
          </button>
          <button type="button" className="secondary" onClick={stopMicrophoneCapture}>
            Stop listening
          </button>
          <button type="button" className="ghost" onClick={() => void playVoiceReply(lastAgentReplyRef.current || transcript.at(-1)?.text || '')}>
            Replay agent voice
          </button>
          <button type="button" className="ghost" onClick={stopPlayback}>
            Stop playback
          </button>
          <button type="button" className="ghost" onClick={endSession}>
            End session
          </button>
          <button type="button" className="ghost" onClick={() => setMuted((value) => !value)}>
            {muted ? 'Unmute' : 'Mute'}
          </button>
        </div>

        <div className="mini-panel">
          <span>Call duration</span>
          <strong>02:34</strong>
        </div>
        <div className="mini-panel">
          <span>Session outcome</span>
          <strong>{selectedAgent === 'loan_settlement' ? 'Follow-up scheduled' : 'Demo renewal review'}</strong>
        </div>
      </aside>
    </section>
  )

  const renderHistory = () => (
    <section className="panel">
      <h3>Conversation history</h3>
      <div className="table-list table-full">
        {sessions.length ? (
          sessions.map((item) => (
            <div key={item.session_id || item.id} className="table-row history-row">
              <span>{item.customer_name || 'Demo customer'}</span>
              <span>{item.agent === 'loan_settlement' ? 'Personal loan settlement' : 'Insurance renewal'}</span>
              <span>{item.status || 'active'}</span>
              <span>{item.outcome || 'pending'}</span>
              <span>{item.duration_seconds || 0}s</span>
            </div>
          ))
        ) : (
          <div className="empty">No saved sessions yet. Start a demo call to create one.</div>
        )}
      </div>
    </section>
  )

  const renderAnalytics = () => (
    <section className="analytics-grid">
      <div className="panel">
        <h3>Conversion metrics</h3>
        <ul className="metric-list">
          <li><span>Total calls</span><strong>{overviewStats.total}</strong></li>
          <li><span>Completed calls</span><strong>{overviewStats.completed}</strong></li>
          <li><span>Commitments</span><strong>{overviewStats.success}</strong></li>
          <li><span>Rate</span><strong>{overviewStats.conversion}%</strong></li>
        </ul>
      </div>
      <div className="panel">
        <h3>Agent split</h3>
        <div className="comparison-list">
          <div className="comparison-row">
            <span>Loan</span>
            <div className="bar"><i style={{ width: '71%' }} /></div>
            <strong>71%</strong>
          </div>
          <div className="comparison-row">
            <span>Insurance</span>
            <div className="bar"><i style={{ width: '63%' }} /></div>
            <strong>63%</strong>
          </div>
        </div>
      </div>
    </section>
  )

  const renderSettings = () => {
    if (accountLoading && !user) {
      return (
        <section className="panel account-panel">
          <div className="account-skeleton skeleton-header" />
          <div className="account-skeleton skeleton-line" />
          <div className="account-skeleton skeleton-line short" />
          <div className="account-skeleton skeleton-line" />
        </section>
      )
    }

    if (accountError) {
      return (
        <section className="panel account-panel">
          <div className="empty-state">
            <h3>Unable to load your account</h3>
            <p>Something went wrong while fetching the profile from the server.</p>
            <button type="button" className="primary" onClick={() => void loadCurrentUser()}>
              Retry
            </button>
          </div>
        </section>
      )
    }

    if (!user) return null

    const rows = [
      { label: 'Full name', value: user.name },
      { label: 'Email', value: user.email },
      ...(user.role ? [{ label: 'Role', value: user.role }] : []),
      ...(user.created_at ? [{ label: 'Account created', value: new Date(user.created_at).toLocaleString() }] : []),
      ...(user.last_login_at ? [{ label: 'Last login', value: new Date(user.last_login_at).toLocaleString() }] : []),
    ]

    return (
      <section className="panel account-panel">
        <div className="account-header">
          <div className="account-avatar">{getInitials(user.name)}</div>
          <div>
            <span className="eyebrow">Profile</span>
            <h2>Your account</h2>
          </div>
        </div>

        <div className="account-details-list">
          {rows.map((row) => (
            <div key={row.label} className="detail-row">
              <span>{row.label}</span>
              <strong>{row.value}</strong>
            </div>
          ))}
        </div>

        <div className="profile-actions">
          <button type="button" className="secondary" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </section>
    )
  }

  const currentSection =
    section === 'overview'
      ? renderOverview()
      : section === 'agents'
        ? renderAgents()
        : section === 'studio'
          ? renderStudio()
          : section === 'history'
            ? renderHistory()
            : section === 'analytics'
              ? renderAnalytics()
              : renderSettings()

  const commandPaletteItems = [
    { label: 'Overview', action: () => setSection('overview') },
    { label: 'Voice Studio', action: () => setSection('studio') },
    { label: 'Agents', action: () => setSection('agents') },
    { label: 'History', action: () => setSection('history') },
    { label: 'Profile', action: () => setSection('settings') },
    { label: 'New loan call', action: () => { setSelectedAgent('loan_settlement'); startFreshConversation('loan_settlement') } },
    { label: 'New insurance call', action: () => { setSelectedAgent('insurance_renewal'); startFreshConversation('insurance_renewal') } },
  ]

  if (authStatus === 'loading') {
    return (
      <div className="app-shell auth-loader-shell">
        <div className="login-card loading-card">
          <div className="account-skeleton skeleton-header" />
          <div className="account-skeleton skeleton-line" />
          <div className="account-skeleton skeleton-line short" />
        </div>
      </div>
    )
  }

  if (authStatus === 'unauthenticated') {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div className="brand-block login-brand">
            <div className="brand-mark">C</div>
            <div>
              <strong>CreditNirvana</strong>
            </div>
          </div>

          <h1>Welcome back</h1>
          <p className="login-supporting">Sign in to continue to the voice studio.</p>

          <form onSubmit={handleLoginSubmit} className="login-form" noValidate>
            <label className="field-label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoFocus
              autoComplete="email"
              value={loginForm.email}
              onChange={(event) => {
                setLoginForm((current) => ({ ...current, email: event.target.value }))
                setLoginErrors((current) => ({ ...current, email: undefined }))
                setLoginError('')
              }}
              placeholder="you@creditnirvana.com"
              aria-invalid={Boolean(loginErrors.email)}
            />
            {loginErrors.email ? <span className="field-error">{loginErrors.email}</span> : null}

            <div className="password-row">
              <label className="field-label" htmlFor="password">
                Password
              </label>
              <button type="button" className="inline-toggle" onClick={() => setShowPassword((value) => !value)}>
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={loginForm.password}
              onChange={(event) => {
                setLoginForm((current) => ({ ...current, password: event.target.value }))
                setLoginErrors((current) => ({ ...current, password: undefined }))
                setLoginError('')
              }}
              placeholder="Enter your password"
              aria-invalid={Boolean(loginErrors.password)}
            />
            {loginErrors.password ? <span className="field-error">{loginErrors.password}</span> : null}

            {loginError ? <div className="login-alert">{loginError}</div> : null}

            <button type="submit" className="primary login-button" disabled={loginSubmitting || !loginForm.email.trim() || loginForm.password.length < 6}>
              {loginSubmitting ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">C</div>
          <div>
            <strong>CreditNirvana</strong>
            <small>Voice AI Studio</small>
          </div>
        </div>

        <nav className="nav-list" aria-label="Main navigation">
          {navItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={section === item.key ? 'nav-item active' : 'nav-item'}
              onClick={() => setSection(item.key)}
            >
              <span className="nav-item-label">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <span className="avatar">{user ? getInitials(user.name) : 'CN'}</span>
            <div>
              <strong>{user?.name || 'User'}</strong>
            </div>
          </div>
          <button type="button" className="ghost small" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="topbar-title">
            <span className="eyebrow">Operations</span>
            <h2>Command center</h2>
          </div>
          <div className="header-actions">
            <div className="status-cluster">
              <span className={`mini-status ${serviceStatus.backend === 'connected' ? 'online' : 'offline'}`}>
                {serviceStatus.backend === 'connected' ? 'Backend online' : 'Backend offline'}
              </span>
              <span className={`mini-status ${serviceStatus.voice === 'connected' ? 'online' : serviceStatus.voice === 'demo' ? 'demo' : 'offline'}`}>
                {serviceStatus.voice === 'connected' ? 'Voice live' : serviceStatus.voice === 'demo' ? 'Demo mode' : 'Voice offline'}
              </span>
            </div>
            <button type="button" className="secondary" onClick={() => void loadData()}>
              Refresh data
            </button>
            <div className="profile-pill">
              <span className="avatar">{user ? getInitials(user.name) : 'CN'}</span>
              <div>
                <strong>{user?.name || 'Ops desk'}</strong>
                <small>{user?.role || 'Premium access'}</small>
              </div>
            </div>
          </div>
        </header>

        {commandPaletteOpen && (
          <div className="command-overlay" onClick={() => setCommandPaletteOpen(false)}>
            <div className="command-palette" onClick={(event) => event.stopPropagation()}>
              <div className="command-header">
                <span className="eyebrow">Quick actions</span>
                <button type="button" className="ghost small" onClick={() => setCommandPaletteOpen(false)}>Close</button>
              </div>
              <div className="command-list">
                {commandPaletteItems.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    className="command-item"
                    onClick={() => {
                      item.action()
                      setCommandPaletteOpen(false)
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {currentSection}
      </main>
    </div>
  )
}

export default App
