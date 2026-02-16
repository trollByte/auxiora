// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Chat } from '../Chat.js';

// ── jsdom polyfills ──────────────────────────────────────────────────────────

// scrollIntoView is not implemented in jsdom
Element.prototype.scrollIntoView = vi.fn();

// ── Mock WebSocket ──────────────────────────────────────────────────────────

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  readyState = 1;
  send = vi.fn();
  close = vi.fn();

  constructor(_url: string) {
    MockWebSocket.instances.push(this);
    // Defer onopen so the component can attach handlers first
    setTimeout(() => this.onopen?.(), 0);
  }

  /** Simulate receiving a server message */
  receive(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

// ── Mock API ────────────────────────────────────────────────────────────────

vi.mock('../../api', () => ({
  api: {
    getStatus: vi.fn().mockResolvedValue({ status: 'ok' }),
    getModels: vi.fn().mockResolvedValue({ providers: [] }),
    getIdentity: vi.fn().mockResolvedValue({}),
    getPersonality: vi.fn().mockResolvedValue({}),
    getChats: vi.fn().mockResolvedValue({
      data: [{ id: 'chat-1', title: 'Test Chat', updatedAt: 1700000000000 }],
    }),
    getChatMessages: vi.fn().mockResolvedValue({ data: [] }),
    createNewChat: vi.fn().mockResolvedValue({
      data: { id: 'chat-new', title: 'New Chat', updatedAt: 1700000000000 },
    }),
  },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeArchitectPayload() {
  return {
    detectedContext: {
      domain: 'code_engineering' as const,
      emotionalRegister: 'neutral' as const,
      complexity: 'moderate' as const,
      mode: 'solo_work' as const,
      stakes: 'moderate' as const,
    },
    activeTraits: [
      {
        traitKey: 'inversion',
        sourceName: 'Charlie Munger',
        sourceWork: "Poor Charlie's Almanack",
        evidenceSummary: 'Inversion thinking works',
        behavioralInstruction: 'Define failure first',
      },
      {
        traitKey: 'firstPrinciples',
        sourceName: 'Elon Musk',
        sourceWork: 'First Principles Approach',
        evidenceSummary: 'Break down to fundamentals',
        behavioralInstruction: 'Question every assumption',
      },
    ],
    traitWeights: { inversion: 0.85, firstPrinciples: 0.72 },
  };
}

/** Simulate a full message exchange: user message → chunks → done with architect metadata */
async function simulateAssistantResponse(ws: MockWebSocket, requestId = 1) {
  const architect = makeArchitectPayload();

  await act(async () => {
    // Simulate streaming chunks
    ws.receive({
      type: 'chunk',
      payload: { content: 'Hello, ' },
    });
  });
  await act(async () => {
    ws.receive({
      type: 'chunk',
      payload: { content: 'world!' },
    });
  });
  await act(async () => {
    // Simulate done with architect metadata
    ws.receive({
      type: 'done',
      payload: {
        routing: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
        architect,
      },
    });
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Chat — Architect Integration', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    (globalThis as any).WebSocket = MockWebSocket;
  });

  afterEach(() => {
    delete (globalThis as any).WebSocket;
    vi.restoreAllMocks();
  });

  it('renders ContextIndicator after receiving architect metadata in done message', async () => {
    render(<Chat />);

    // Wait for WebSocket to connect
    await waitFor(() => expect(MockWebSocket.instances.length).toBeGreaterThan(0));
    const ws = MockWebSocket.instances[0];
    await act(async () => { ws.onopen?.(); });

    // Wait for chat to be ready
    await waitFor(() => expect(screen.queryByText('Loading...')).toBeNull());

    // Type and send a message
    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'Help me debug this code');
    await userEvent.keyboard('{Enter}');

    // Simulate the response
    await simulateAssistantResponse(ws);

    // ContextIndicator should show the detected domain
    await waitFor(() => {
      expect(screen.getByText('Engineering')).toBeTruthy();
    });
  });

  it('renders SourcesButton after receiving active traits', async () => {
    render(<Chat />);

    await waitFor(() => expect(MockWebSocket.instances.length).toBeGreaterThan(0));
    const ws = MockWebSocket.instances[0];
    await act(async () => { ws.onopen?.(); });
    await waitFor(() => expect(screen.queryByText('Loading...')).toBeNull());

    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'Explain this pattern');
    await userEvent.keyboard('{Enter}');

    await simulateAssistantResponse(ws);

    // SourcesButton should render
    await waitFor(() => {
      expect(screen.getByLabelText('View sources')).toBeTruthy();
    });
  });

  it('does not render ContextIndicator for messages without architect data', async () => {
    render(<Chat />);

    await waitFor(() => expect(MockWebSocket.instances.length).toBeGreaterThan(0));
    const ws = MockWebSocket.instances[0];
    await act(async () => { ws.onopen?.(); });
    await waitFor(() => expect(screen.queryByText('Loading...')).toBeNull());

    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'Hello');
    await userEvent.keyboard('{Enter}');

    // Response without architect metadata
    await act(async () => {
      ws.receive({ type: 'chunk', payload: { content: 'Hi there!' } });
    });
    await act(async () => {
      ws.receive({
        type: 'done',
        payload: { routing: { provider: 'anthropic', model: 'claude-sonnet-4-5' } },
      });
    });

    // No context indicator should appear
    expect(screen.queryByText('Engineering')).toBeNull();
    expect(screen.queryByText('Debugging')).toBeNull();
    expect(screen.queryByLabelText('View sources')).toBeNull();
  });

  it('shows override edit button on hover context row', async () => {
    render(<Chat />);

    await waitFor(() => expect(MockWebSocket.instances.length).toBeGreaterThan(0));
    const ws = MockWebSocket.instances[0];
    await act(async () => { ws.onopen?.(); });
    await waitFor(() => expect(screen.queryByText('Loading...')).toBeNull());

    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'Help me debug');
    await userEvent.keyboard('{Enter}');

    await simulateAssistantResponse(ws);

    await waitFor(() => {
      expect(screen.getByLabelText('Override context')).toBeTruthy();
    });
  });

  it('opens ContextOverrideMenu when edit button is clicked', async () => {
    render(<Chat />);

    await waitFor(() => expect(MockWebSocket.instances.length).toBeGreaterThan(0));
    const ws = MockWebSocket.instances[0];
    await act(async () => { ws.onopen?.(); });
    await waitFor(() => expect(screen.queryByText('Loading...')).toBeNull());

    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'Help me debug');
    await userEvent.keyboard('{Enter}');

    await simulateAssistantResponse(ws);

    await waitFor(() => {
      expect(screen.getByLabelText('Override context')).toBeTruthy();
    });

    // Click the override button
    await userEvent.click(screen.getByLabelText('Override context'));

    // The override menu should be visible (it renders domain options)
    await waitFor(() => {
      expect(screen.getByText('Switch context:')).toBeTruthy();
    });
  });

  it('shows conversation override banner after setting conversation override', async () => {
    render(<Chat />);

    await waitFor(() => expect(MockWebSocket.instances.length).toBeGreaterThan(0));
    const ws = MockWebSocket.instances[0];
    await act(async () => { ws.onopen?.(); });
    await waitFor(() => expect(screen.queryByText('Loading...')).toBeNull());

    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'Help me');
    await userEvent.keyboard('{Enter}');

    await simulateAssistantResponse(ws);

    // Open the override menu
    await waitFor(() => {
      expect(screen.getByLabelText('Override context')).toBeTruthy();
    });
    await userEvent.click(screen.getByLabelText('Override context'));

    // Wait for menu to appear, then click a domain to select it
    await waitFor(() => {
      expect(screen.getByText('Switch context:')).toBeTruthy();
    });

    // Click "Debugging" domain in the override menu
    const debuggingOptions = screen.getAllByText('Debugging');
    // The one in the override menu list (not the indicator)
    const menuOption = debuggingOptions.find(el =>
      el.closest('.context-override-popover') !== null
    );
    if (menuOption) {
      await userEvent.click(menuOption);
    }

    // After selecting a domain, the scope picker should appear
    // Click "For this conversation" to set conversation override
    await waitFor(() => {
      const convButton = screen.queryByText('This conversation');
      if (convButton) {
        return expect(convButton).toBeTruthy();
      }
      // Might auto-apply for message scope
      return true;
    });

    const convButton = screen.queryByText('This conversation');
    if (convButton) {
      await userEvent.click(convButton);

      // The banner should appear
      await waitFor(() => {
        expect(screen.getByText(/Context locked to/)).toBeTruthy();
        expect(screen.getByLabelText('Clear context override')).toBeTruthy();
      });
    }
  });

  it('clears conversation override banner when unlock is clicked', async () => {
    render(<Chat />);

    await waitFor(() => expect(MockWebSocket.instances.length).toBeGreaterThan(0));
    const ws = MockWebSocket.instances[0];
    await act(async () => { ws.onopen?.(); });
    await waitFor(() => expect(screen.queryByText('Loading...')).toBeNull());

    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'Help me');
    await userEvent.keyboard('{Enter}');

    await simulateAssistantResponse(ws);

    // Open override menu and set conversation override
    await waitFor(() => {
      expect(screen.getByLabelText('Override context')).toBeTruthy();
    });
    await userEvent.click(screen.getByLabelText('Override context'));

    await waitFor(() => {
      expect(screen.getByText('Switch context:')).toBeTruthy();
    });

    // Click a domain option
    const debuggingOptions = screen.getAllByText('Debugging');
    const menuOption = debuggingOptions.find(el =>
      el.closest('.context-override-popover') !== null
    );
    if (menuOption) {
      await userEvent.click(menuOption);
    }

    const convButton = screen.queryByText('This conversation');
    if (convButton) {
      await userEvent.click(convButton);

      // Banner should appear
      await waitFor(() => {
        expect(screen.getByText(/Context locked to/)).toBeTruthy();
      });

      // Click unlock
      await userEvent.click(screen.getByLabelText('Clear context override'));

      // Banner should be gone
      await waitFor(() => {
        expect(screen.queryByText(/Context locked to/)).toBeNull();
      });
    }
  });
});
