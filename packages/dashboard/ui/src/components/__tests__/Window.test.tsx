// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Window } from '../Window.js';

function makeProps(overrides: Partial<Parameters<typeof Window>[0]> = {}) {
  return {
    id: 'test-window',
    title: 'Test Window',
    x: 100,
    y: 50,
    width: 600,
    height: 400,
    zIndex: 1,
    minimized: false,
    maximized: false,
    focused: true,
    onClose: vi.fn(),
    onFocus: vi.fn(),
    onMinimize: vi.fn(),
    onMaximize: vi.fn(),
    onMove: vi.fn(),
    onResize: vi.fn(),
    children: 'content' as React.ReactNode,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Window', () => {
  it('renders the title', () => {
    render(<Window {...makeProps()} />);
    expect(screen.getByText('Test Window')).toBeTruthy();
  });

  it('renders children in the body', () => {
    render(<Window {...makeProps({ children: <p>Hello World</p> })} />);
    expect(screen.getByText('Hello World')).toBeTruthy();
  });

  it('has 3 traffic light buttons', () => {
    render(<Window {...makeProps()} />);
    expect(screen.getByLabelText('Close window')).toBeTruthy();
    expect(screen.getByLabelText('Minimize window')).toBeTruthy();
    expect(screen.getByLabelText('Maximize window')).toBeTruthy();
  });

  it('calls onClose when close traffic light clicked', async () => {
    const props = makeProps();
    render(<Window {...props} />);
    await userEvent.click(screen.getByLabelText('Close window'));
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it('calls onMinimize when minimize traffic light clicked', async () => {
    const props = makeProps();
    render(<Window {...props} />);
    await userEvent.click(screen.getByLabelText('Minimize window'));
    expect(props.onMinimize).toHaveBeenCalledOnce();
  });

  it('calls onMaximize when maximize traffic light clicked', async () => {
    const props = makeProps();
    render(<Window {...props} />);
    await userEvent.click(screen.getByLabelText('Maximize window'));
    expect(props.onMaximize).toHaveBeenCalledOnce();
  });

  it('does not render when minimized', () => {
    const { container } = render(<Window {...makeProps({ minimized: true })} />);
    expect(container.querySelector('.window')).toBeNull();
  });

  it('applies maximized class when maximized', () => {
    const { container } = render(<Window {...makeProps({ maximized: true })} />);
    expect(container.querySelector('.window.maximized')).toBeTruthy();
  });

  it('applies focused class when focused', () => {
    const { container } = render(<Window {...makeProps({ focused: true })} />);
    expect(container.querySelector('.window.focused')).toBeTruthy();
  });

  it('calls onFocus on mousedown', async () => {
    const props = makeProps({ focused: false });
    render(<Window {...props} />);
    await userEvent.click(screen.getByText('content'));
    expect(props.onFocus).toHaveBeenCalled();
  });

  it('positions window using inline styles', () => {
    const { container } = render(<Window {...makeProps()} />);
    const el = container.querySelector('.window') as HTMLElement;
    expect(el.style.left).toBe('100px');
    expect(el.style.top).toBe('50px');
    expect(el.style.width).toBe('600px');
    expect(el.style.height).toBe('400px');
  });

  it('has 8 resize handles', () => {
    const { container } = render(<Window {...makeProps()} />);
    const handles = container.querySelectorAll('.window-resize');
    expect(handles.length).toBe(8);
  });

  it('hides resize handles when maximized', () => {
    const { container } = render(<Window {...makeProps({ maximized: true })} />);
    const handles = container.querySelectorAll('.window-resize');
    expect(handles.length).toBe(0);
  });
});
