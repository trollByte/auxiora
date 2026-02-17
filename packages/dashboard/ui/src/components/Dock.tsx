import { useRef, useCallback } from 'react';

export interface DockItem {
  id: string;
  label: string;
  icon: string;
}

export interface DockProps {
  items: DockItem[];
  openWindows: Set<string>;
  onOpen: (id: string) => void;
}

export function Dock({ items, openWindows, onOpen }: DockProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const container = containerRef.current;
    if (!container) return;
    const wrappers = container.querySelectorAll('.dock-icon-wrapper');
    const mouseX = e.clientX;

    wrappers.forEach(wrapper => {
      const rect = (wrapper as HTMLElement).getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const dist = Math.abs(mouseX - centerX);

      wrapper.classList.remove('mag-center', 'mag-near', 'mag-far');
      if (dist < 25) wrapper.classList.add('mag-center');
      else if (dist < 60) wrapper.classList.add('mag-near');
      else if (dist < 100) wrapper.classList.add('mag-far');
    });
  }, []);

  const handleMouseLeave = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    container.querySelectorAll('.dock-icon-wrapper').forEach(w => {
      w.classList.remove('mag-center', 'mag-near', 'mag-far');
    });
  }, []);

  return (
    <div
      className="dock-container"
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {items.map(item => (
        <div key={item.id} className="dock-icon-wrapper">
          <div className="dock-tooltip">{item.label}</div>
          <button
            type="button"
            className="dock-icon"
            aria-label={`Open ${item.label}`}
            onClick={() => onOpen(item.id)}
          >
            {item.icon}
          </button>
          <div className={`dock-icon-dot${openWindows.has(item.id) ? ' active' : ''}`} />
        </div>
      ))}
    </div>
  );
}
