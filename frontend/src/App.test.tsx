import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

const jsonResponse = (data: unknown, ok = true) => ({
  ok,
  json: async () => data,
}) as Response

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith('/api/me')) return jsonResponse({ detail: 'Not authenticated' }, false)
    return jsonResponse({})
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Agentra AI authentication', () => {
  it('shows Sign In and Create Account options', async () => {
    render(<App />)

    expect(await screen.findByRole('tab', { name: 'Sign In' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Create Account' })).toBeInTheDocument()
  })

  it('validates public registration and submits it to the backend', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/api/me')) return jsonResponse({ detail: 'Not authenticated' }, false)
      if (url.endsWith('/api/register')) {
        return jsonResponse({
          status: 'ok',
          user: { id: 1, name: 'Public User', email: 'public@agentra.ai', role: 'user' },
        })
      }
      if (init?.method === 'POST') return jsonResponse({ status: 'ok' })
      return jsonResponse({ status: 'ok', sessions: [], metrics: {} })
    })

    render(<App />)
    await user.click(await screen.findByRole('tab', { name: 'Create Account' }))
    await user.type(screen.getByLabelText('Full name'), 'Public User')
    await user.type(screen.getByLabelText('Email'), 'public@agentra.ai')
    await user.type(screen.getByLabelText('Password'), 'CorrectPass!123')
    await user.type(screen.getByLabelText('Confirm password'), 'CorrectPass!123')
    await user.click(screen.getByRole('button', { name: 'Create Account' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/register'),
      expect.objectContaining({ method: 'POST' }),
    ))
  })

  it('submits Sign In credentials', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/api/me')) return jsonResponse({ detail: 'Not authenticated' }, false)
      if (url.endsWith('/api/login')) return jsonResponse({ user: { id: 1, name: 'Admin User', email: 'admin@agentra.test', role: 'admin' } })
      return jsonResponse({ status: 'ok', sessions: [], metrics: {} })
    })

    render(<App />)
    await user.type(await screen.findByLabelText('Email'), 'admin@agentra.test')
    await user.type(screen.getByLabelText('Password'), 'CorrectPass!123')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/login'),
      expect.objectContaining({ method: 'POST' }),
    ))
  })
})
