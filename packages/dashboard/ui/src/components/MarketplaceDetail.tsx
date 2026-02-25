export interface DetailItem {
  name: string;
  version: string;
  description: string;
  author: string;
  downloads: number;
  rating: number;
  license?: string;
  permissions?: string[];
  keywords?: string[];
  createdAt?: string;
  updatedAt?: string;
  homepage?: string;
  repository?: string;
  preview?: string;
  tone?: { warmth: number; humor: number; formality: number };
}

interface MarketplaceDetailProps {
  item: DetailItem;
  onClose: () => void;
  onInstall: (item: DetailItem) => void;
}

export function MarketplaceDetail({ item, onClose, onInstall }: MarketplaceDetailProps) {
  return (
    <div className="marketplace-detail glass-mid">
      <div className="marketplace-detail-header">
        <div>
          <span className="marketplace-detail-name">{item.name}</span>
          <span className="marketplace-detail-version">v{item.version}</span>
        </div>
        <span className="marketplace-detail-author">by {item.author}</span>
      </div>

      <div className="marketplace-detail-stats">
        <span>{'★'.repeat(Math.floor(item.rating))}{'☆'.repeat(5 - Math.floor(item.rating))} ({item.rating.toFixed(1)})</span>
        <span>↓ {item.downloads.toLocaleString()} downloads</span>
      </div>

      <p className="marketplace-detail-desc">{item.description}</p>

      {item.preview && <p className="marketplace-detail-preview">{item.preview}</p>}

      {item.tone && (
        <div className="marketplace-detail-tone">
          <span>Warmth: {item.tone.warmth}</span>
          <span>Humor: {item.tone.humor}</span>
          <span>Formality: {item.tone.formality}</span>
        </div>
      )}

      <div className="marketplace-detail-meta">
        {item.permissions && item.permissions.length > 0 && (
          <div><strong>Permissions:</strong> {item.permissions.join(', ')}</div>
        )}
        {item.keywords && item.keywords.length > 0 && (
          <div><strong>Keywords:</strong> {item.keywords.join(', ')}</div>
        )}
        {item.license && <div><strong>License:</strong> {item.license}</div>}
      </div>

      <div className="marketplace-detail-actions">
        <button className="btn-primary" onClick={() => onInstall(item)}>Install</button>
        <button className="btn-secondary" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
