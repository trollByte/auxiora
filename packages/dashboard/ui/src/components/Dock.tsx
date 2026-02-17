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
  return (
    <div className="dock-container">
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
