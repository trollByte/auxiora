// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryManager } from '../../src/pages/MemoryManager.js';

const mockGetMemories = vi.fn().mockResolvedValue({
  data: [
    { id: 'mem-001', content: 'User prefers TypeScript', category: 'preference', importance: 0.8, tags: ['coding'], source: 'explicit', createdAt: Date.now(), updatedAt: Date.now(), accessCount: 5, confidence: 0.9 },
    { id: 'mem-002', content: 'Works on Auxiora project', category: 'fact', importance: 0.6, tags: ['project'], source: 'extracted', createdAt: Date.now(), updatedAt: Date.now(), accessCount: 2, confidence: 0.7 },
  ],
});

vi.mock('../../src/api.js', () => ({
  api: {
    getMemories: (...args: any[]) => mockGetMemories(...args),
    searchMemories: vi.fn().mockResolvedValue({ data: [] }),
    deleteMemory: vi.fn().mockResolvedValue({ success: true }),
    updateMemory: vi.fn().mockResolvedValue({ data: {} }),
    forgetTopic: vi.fn().mockResolvedValue({ removed: { memories: 2, decisions: 1 } }),
    exportPersonalization: vi.fn().mockResolvedValue({ version: 1, exportedAt: Date.now() }),
  },
}));

describe('MemoryManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetMemories.mockResolvedValue({
      data: [
        { id: 'mem-001', content: 'User prefers TypeScript', category: 'preference', importance: 0.8, tags: ['coding'], source: 'explicit', createdAt: Date.now(), updatedAt: Date.now(), accessCount: 5, confidence: 0.9 },
        { id: 'mem-002', content: 'Works on Auxiora project', category: 'fact', importance: 0.6, tags: ['project'], source: 'extracted', createdAt: Date.now(), updatedAt: Date.now(), accessCount: 2, confidence: 0.7 },
      ],
    });
  });

  it('renders memory cards after loading', async () => {
    render(<MemoryManager />);
    expect(await screen.findByText(/TypeScript/)).toBeDefined();
    expect(screen.getByText(/Auxiora/)).toBeDefined();
  });

  it('filters by category', async () => {
    render(<MemoryManager />);
    await screen.findByText(/TypeScript/);
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'preference' } });
    await waitFor(() => {
      expect(mockGetMemories).toHaveBeenCalledWith('preference');
    });
  });

  it('deletes a memory', async () => {
    const { api } = await import('../../src/api.js');
    render(<MemoryManager />);
    await screen.findByText(/TypeScript/);
    const deleteButtons = screen.getAllByText('Delete');
    fireEvent.click(deleteButtons[0]);
    // Confirm deletion
    const yesButton = screen.getByText('Yes');
    fireEvent.click(yesButton);
    await waitFor(() => {
      expect(api.deleteMemory).toHaveBeenCalledWith('mem-001');
    });
  });

  it('forgets a topic', async () => {
    const { api } = await import('../../src/api.js');
    render(<MemoryManager />);
    await screen.findByText(/TypeScript/);
    const forgetInput = screen.getByPlaceholderText('Topic to forget...');
    fireEvent.change(forgetInput, { target: { value: 'TypeScript' } });
    const forgetButton = screen.getByText('Forget');
    fireEvent.click(forgetButton);
    await waitFor(() => {
      expect(api.forgetTopic).toHaveBeenCalledWith('TypeScript');
    });
    expect(await screen.findByText(/Removed 2 memories/)).toBeDefined();
  });

  it('renders empty state when no memories', async () => {
    mockGetMemories.mockResolvedValue({ data: [] });
    render(<MemoryManager />);
    expect(await screen.findByText('No memories yet')).toBeDefined();
  });
});
