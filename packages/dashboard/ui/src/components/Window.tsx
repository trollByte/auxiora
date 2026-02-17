import { useRef, useCallback, type ReactNode, type MouseEvent } from 'react';

export interface WindowProps {
  id: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  minimized: boolean;
  maximized: boolean;
  focused: boolean;
  onClose: () => void;
  onFocus: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onMove: (x: number, y: number) => void;
  onResize: (width: number, height: number) => void;
  children: ReactNode;
}

const RESIZE_DIRS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const;

export function Window({
  id,
  title,
  x, y, width, height, zIndex,
  minimized, maximized, focused,
  onClose, onFocus, onMinimize, onMaximize,
  onMove, onResize,
  children,
}: WindowProps) {
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  const handleTitleBarMouseDown = useCallback((e: MouseEvent) => {
    if (maximized) return;
    e.preventDefault();
    onFocus();
    const startX = e.clientX;
    const startY = e.clientY;
    dragRef.current = { startX, startY, origX: x, origY: y };

    const handleMouseMove = (ev: globalThis.MouseEvent) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      onMove(dragRef.current.origX + dx, dragRef.current.origY + dy);
    };

    const handleMouseUp = () => {
      dragRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [maximized, x, y, onFocus, onMove]);

  const handleResizeMouseDown = useCallback((dir: string, e: MouseEvent) => {
    if (maximized) return;
    e.preventDefault();
    e.stopPropagation();
    onFocus();

    const startX = e.clientX;
    const startY = e.clientY;
    const origX = x, origY = y, origW = width, origH = height;

    const handleMouseMove = (ev: globalThis.MouseEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      let newX = origX, newY = origY, newW = origW, newH = origH;

      if (dir.includes('e')) newW = origW + dx;
      if (dir.includes('w')) { newW = origW - dx; newX = origX + dx; }
      if (dir.includes('s')) newH = origH + dy;
      if (dir.includes('n')) { newH = origH - dy; newY = origY + dy; }

      onResize(newW, newH);
      if (dir.includes('w') || dir.includes('n')) {
        onMove(newX, newY);
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [maximized, x, y, width, height, onFocus, onResize, onMove]);

  if (minimized) return null;

  const style = maximized
    ? { zIndex, inset: '0', width: '100%', height: '100%' } as const
    : { left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px`, zIndex } as const;

  const classes = ['window', 'glass-mid'];
  if (focused) classes.push('focused');
  if (maximized) classes.push('maximized');

  return (
    <div
      className={classes.join(' ')}
      style={style}
      onMouseDown={onFocus}
      data-window-id={id}
    >
      {/* Resize handles — hidden when maximized */}
      {!maximized && RESIZE_DIRS.map(dir => (
        <div
          key={dir}
          className={`window-resize window-resize-${dir}`}
          onMouseDown={(e) => handleResizeMouseDown(dir, e)}
        />
      ))}

      {/* Title bar */}
      <div className="window-titlebar" onMouseDown={handleTitleBarMouseDown}>
        <div className="window-traffic-lights">
          <button
            type="button"
            className="window-traffic-light close"
            aria-label="Close window"
            onClick={(e) => { e.stopPropagation(); onClose(); }}
          />
          <button
            type="button"
            className="window-traffic-light minimize"
            aria-label="Minimize window"
            onClick={(e) => { e.stopPropagation(); onMinimize(); }}
          />
          <button
            type="button"
            className="window-traffic-light maximize"
            aria-label="Maximize window"
            onClick={(e) => { e.stopPropagation(); onMaximize(); }}
          />
        </div>
        <span className="window-title">{title}</span>
      </div>

      {/* Body */}
      <div className="window-body">
        {children}
      </div>
    </div>
  );
}
