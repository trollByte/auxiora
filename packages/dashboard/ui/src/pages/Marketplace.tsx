import { useState, useEffect, useCallback } from 'react';
import { api } from '../api.js';
import { MarketplaceCard } from '../components/MarketplaceCard.js';
import { MarketplaceDetail } from '../components/MarketplaceDetail.js';

type Tab = 'plugins' | 'personalities';
type SortOption = 'downloads' | 'rating' | 'name' | 'updated';

export function Marketplace() {
  const [tab, setTab] = useState<Tab>('plugins');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortOption>('downloads');
  const [plugins, setPlugins] = useState<unknown[]>([]);
  const [personalities, setPersonalities] = useState<unknown[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<unknown | null>(null);
  const [loading, setLoading] = useState(false);
  const limit = 18;

  const search = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'plugins') {
        const result = await api.searchPlugins({ q: query || undefined, sort, limit, offset });
        setPlugins(result.plugins);
        setTotal(result.total);
      } else {
        const result = await api.searchPersonalities({ q: query || undefined, sort, limit, offset });
        setPersonalities(result.personalities);
        setTotal(result.total);
      }
    } catch { /* error handled by fetchMarketplace */ }
    setLoading(false);
  }, [tab, query, sort, offset]);

  useEffect(() => { search(); }, [search]);

  const handleInstall = async (item: { name: string; version?: string }) => {
    try {
      if (tab === 'plugins') {
        await api.installPlugin(item.name, item.version);
      } else {
        await api.installPersonality(item.name, item.version);
      }
      search();
    } catch { /* error handled */ }
  };

  const items = tab === 'plugins' ? plugins : personalities;
  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div className="marketplace">
      <div className="marketplace-toolbar">
        <div className="marketplace-tabs">
          <button className={`marketplace-tab ${tab === 'plugins' ? 'active' : ''}`} onClick={() => { setTab('plugins'); setOffset(0); }}>Plugins</button>
          <button className={`marketplace-tab ${tab === 'personalities' ? 'active' : ''}`} onClick={() => { setTab('personalities'); setOffset(0); }}>Personalities</button>
        </div>
        <input
          className="marketplace-search"
          type="text"
          placeholder="Search..."
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOffset(0); }}
        />
      </div>

      {loading ? (
        <div className="marketplace-loading">Loading...</div>
      ) : (
        <div className="marketplace-grid">
          {(items as Array<{ name: string; version: string; description: string; author: string; downloads: number; rating: number; keywords?: string[] }>).map((item) => (
            <MarketplaceCard key={item.name} item={item} onSelect={setSelected} onInstall={handleInstall} />
          ))}
          {items.length === 0 && <div className="marketplace-empty">No results found.</div>}
        </div>
      )}

      <div className="marketplace-footer">
        <select className="marketplace-sort" value={sort} onChange={(e) => setSort(e.target.value as SortOption)}>
          <option value="downloads">Downloads</option>
          <option value="rating">Rating</option>
          <option value="name">Name</option>
          <option value="updated">Recently Updated</option>
        </select>
        {totalPages > 1 && (
          <div className="marketplace-pagination">
            <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>Prev</button>
            <span>Page {currentPage} of {totalPages}</span>
            <button disabled={currentPage >= totalPages} onClick={() => setOffset(offset + limit)}>Next</button>
          </div>
        )}
      </div>

      {selected && (
        <div className="marketplace-overlay" onClick={() => setSelected(null)}>
          <div onClick={(e) => e.stopPropagation()}>
            <MarketplaceDetail item={selected as never} onClose={() => setSelected(null)} onInstall={handleInstall} />
          </div>
        </div>
      )}
    </div>
  );
}
