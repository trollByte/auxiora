// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DesktopShell } from '../DesktopShell.js';

// Mock the api module — use the EXACT path the component imports
vi.mock('../../api.js', () => ({
  api: {
    getSetupStatus: vi.fn().mockResolvedValue({ vaultUnlocked: true, needsSetup: false, agentName: 'Luna' }),
    getStatus: vi.fn().mockResolvedValue({ data: {} }),
    getSessions: vi.fn().mockResolvedValue({ data: [] }),
    logout: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock page components to avoid pulling in their deps
vi.mock('../../pages/Overview.js', () => ({ Overview: () => <div>Overview Page</div> }));
vi.mock('../../pages/Chat.js', () => ({ Chat: () => <div>Chat Page</div> }));
vi.mock('../../pages/Behaviors.js', () => ({ Behaviors: () => <div>Behaviors Page</div> }));
vi.mock('../../pages/Webhooks.js', () => ({ Webhooks: () => <div>Webhooks Page</div> }));
vi.mock('../../pages/AuditLog.js', () => ({ AuditLog: () => <div>AuditLog Page</div> }));
vi.mock('../../pages/settings/PersonalityEditor.js', () => ({ PersonalityEditor: () => <div>Personality Page</div> }));
vi.mock('../../pages/settings/Provider.js', () => ({ SettingsProvider: () => <div>Provider Page</div> }));
vi.mock('../../pages/settings/Channels.js', () => ({ SettingsChannels: () => <div>Channels Page</div> }));
vi.mock('../../pages/settings/Security.js', () => ({ SettingsSecurity: () => <div>Security Page</div> }));
vi.mock('../../pages/settings/Appearance.js', () => ({ SettingsAppearance: () => <div>Appearance Page</div> }));
vi.mock('../../pages/SettingsConnections.js', () => ({ SettingsConnections: () => <div>Connections Page</div> }));
vi.mock('../../pages/SettingsAmbient.js', () => ({ SettingsAmbient: () => <div>Ambient Page</div> }));
vi.mock('../../pages/settings/Architect.js', () => ({ SettingsArchitect: () => <div>Architect Page</div> }));
vi.mock('../../pages/SettingsNotifications.js', () => ({ SettingsNotifications: () => <div>Notifications Page</div> }));

function renderShell() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <DesktopShell />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('DesktopShell', () => {
  it('renders the desktop shell container', async () => {
    const { container } = renderShell();
    await screen.findByText('Luna');
    expect(container.querySelector('.desktop-shell')).toBeTruthy();
  });

  it('renders the top bar with agent name', async () => {
    renderShell();
    expect(await screen.findByText('Luna')).toBeTruthy();
  });

  it('renders the dock with app icons', async () => {
    renderShell();
    await screen.findByText('Luna');
    expect(screen.getByLabelText('Open Chat')).toBeTruthy();
    expect(screen.getByLabelText('Open Mission Control')).toBeTruthy();
  });

  it('opens a window when dock icon is clicked', async () => {
    const { container } = renderShell();
    await screen.findByText('Luna');
    await userEvent.click(screen.getByLabelText('Open Chat'));
    expect(container.querySelector('.window')).toBeTruthy();
  });

  it('renders page component inside window', async () => {
    renderShell();
    await screen.findByText('Luna');
    await userEvent.click(screen.getByLabelText('Open Chat'));
    expect(screen.getByText('Chat Page')).toBeTruthy();
  });

  it('shows active dot on dock icon when window is open', async () => {
    const { container } = renderShell();
    await screen.findByText('Luna');
    await userEvent.click(screen.getByLabelText('Open Chat'));
    const dots = container.querySelectorAll('.dock-icon-dot.active');
    expect(dots.length).toBeGreaterThanOrEqual(1);
  });
});
