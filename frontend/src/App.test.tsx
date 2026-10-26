import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

describe('CreditNirvana dashboard', () => {
  it('renders the main navigation and overview headings', () => {
    render(<App />)

    expect(screen.getByText('CreditNirvana Voice AI Studio')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Overview' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Live Call Studio' })).toBeInTheDocument()
  })

  it('switches to the agents section and launches a test call', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Voice Agents' }))
    expect(screen.getByText('Personal Loan Settlement Agent')).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: 'Start test call' })[0])
    expect(screen.getByText('Live call studio')).toBeInTheDocument()
  })

  it('supports text fallback input', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Live Call Studio' }))
    const input = screen.getByLabelText('Type a response')
    await user.type(input, 'I need a few days more.')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    expect(screen.getByDisplayValue('')).toBeTruthy()
  })
})
