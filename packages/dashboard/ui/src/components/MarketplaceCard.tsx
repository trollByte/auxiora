export interface MarketplaceItem {
  name: string;
  version: string;
  description: string;
  author: string;
  downloads: number;
  rating: number;
  keywords?: string[];
}

export type { MarketplaceItem as MarketplaceItemType };

interface MarketplaceCardProps {
  item: MarketplaceItem;
  onSelect: (item: MarketplaceItem) => void;
  onInstall: (item: MarketplaceItem) => void;
}

function StarRating({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  const empty = 5 - full - (half ? 1 : 0);
  return (
    <span className="marketplace-card-rating" title={`${rating.toFixed(1)} / 5`}>
      {'\u2605'.repeat(full)}{half ? '\u00BD' : ''}{'\u2606'.repeat(empty)}
    </span>
  );
}

export function MarketplaceCard({ item, onSelect, onInstall }: MarketplaceCardProps) {
  return (
    <div className="marketplace-card glass-mid" onClick={() => onSelect(item)}>
      <div className="marketplace-card-header">
        <span className="marketplace-card-name">{item.name}</span>
        <span className="marketplace-card-version">v{item.version}</span>
      </div>
      <p className="marketplace-card-author">{item.author}</p>
      <p className="marketplace-card-desc">{item.description}</p>
      <div className="marketplace-card-footer">
        <span className="marketplace-card-stats">
          <StarRating rating={item.rating} />
          <span className="marketplace-card-downloads">{'\u2193'} {item.downloads.toLocaleString()}</span>
        </span>
        <button
          className="marketplace-card-install"
          onClick={(e) => { e.stopPropagation(); onInstall(item); }}
        >
          Install
        </button>
      </div>
    </div>
  );
}
