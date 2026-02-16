import { useState, useEffect, useRef, useCallback } from 'react';
import type { ContextDomain } from '@auxiora/personality/architect';
import { DOMAIN_META, ALL_DOMAINS } from './context-meta.js';

// ── Component ────────────────────────────────────────────────────────────────

export interface ContextOverrideMenuProps {
  currentDomain: ContextDomain;
  onSelect: (domain: ContextDomain, scope: 'message' | 'conversation') => void;
  onClose: () => void;
  isOpen: boolean;
}

export function ContextOverrideMenu({
  currentDomain,
  onSelect,
  onClose,
  isOpen,
}: ContextOverrideMenuProps) {
  const [pendingDomain, setPendingDomain] = useState<ContextDomain | null>(null);
  const [focusIndex, setFocusIndex] = useState(-1);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Reset state when menu opens/closes
  useEffect(() => {
    if (isOpen) {
      setPendingDomain(null);
      setFocusIndex(-1);
    }
  }, [isOpen]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (pendingDomain) {
      // Scope picker mode: arrow left/right, enter, escape
      if (e.key === 'Escape') {
        setPendingDomain(null);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'Escape':
        onClose();
        e.preventDefault();
        break;
      case 'ArrowDown': {
        const next = focusIndex < ALL_DOMAINS.length - 1 ? focusIndex + 1 : 0;
        setFocusIndex(next);
        itemRefs.current[next]?.focus();
        e.preventDefault();
        break;
      }
      case 'ArrowUp': {
        const prev = focusIndex > 0 ? focusIndex - 1 : ALL_DOMAINS.length - 1;
        setFocusIndex(prev);
        itemRefs.current[prev]?.focus();
        e.preventDefault();
        break;
      }
      case 'Enter':
        if (focusIndex >= 0) {
          handleDomainClick(ALL_DOMAINS[focusIndex]);
          e.preventDefault();
        }
        break;
    }
  }, [focusIndex, onClose, pendingDomain]);

  function handleDomainClick(domain: ContextDomain) {
    setPendingDomain(domain);
  }

  function handleScopeSelect(scope: 'message' | 'conversation') {
    if (pendingDomain) {
      onSelect(pendingDomain, scope);
      setPendingDomain(null);
    }
  }

  if (!isOpen) return null;

  const currentMeta = DOMAIN_META[currentDomain];

  return (
    <div
      ref={menuRef}
      className="context-override-popover"
      role="dialog"
      aria-label="Override context"
      onKeyDown={handleKeyDown}
    >
      {/* Header */}
      <div className="context-override-header">
        <span className="context-override-detected">
          Detected: <span aria-hidden="true">{currentMeta.icon}</span> {currentMeta.label}
        </span>
      </div>

      {pendingDomain ? (
        // ── Scope picker ──────────────────────────────────────────────────
        <div className="context-override-scope" role="group" aria-label="Apply scope">
          <div className="context-override-scope-label">
            Apply <strong>{DOMAIN_META[pendingDomain].label}</strong> to:
          </div>
          <button
            type="button"
            className="context-override-scope-btn"
            onClick={() => handleScopeSelect('message')}
          >
            This message
            <span className="context-override-scope-hint">Auto-detection resumes after</span>
          </button>
          <button
            type="button"
            className="context-override-scope-btn"
            onClick={() => handleScopeSelect('conversation')}
          >
            This conversation
            <span className="context-override-scope-hint">Stays until you change it</span>
          </button>
          <button
            type="button"
            className="context-override-scope-back"
            onClick={() => setPendingDomain(null)}
          >
            Back
          </button>
        </div>
      ) : (
        // ── Domain list ───────────────────────────────────────────────────
        <>
          <div className="context-override-subheader">Switch context:</div>
          <ul className="context-override-list" role="listbox" aria-label="Available contexts">
            {ALL_DOMAINS.map((domain, i) => {
              const meta = DOMAIN_META[domain];
              const isCurrent = domain === currentDomain;
              return (
                <li key={domain} role="none">
                  <button
                    ref={el => { itemRefs.current[i] = el; }}
                    type="button"
                    role="option"
                    aria-selected={isCurrent}
                    className={`context-override-domain-item ${isCurrent ? 'detected' : ''}`}
                    onClick={() => handleDomainClick(domain)}
                    tabIndex={focusIndex === i ? 0 : -1}
                  >
                    <span className="context-override-domain-icon" aria-hidden="true">
                      {meta.icon}
                    </span>
                    <span className="context-override-domain-text">
                      <span className="context-override-domain-label">
                        {meta.label}
                        {isCurrent && <span className="context-override-detected-badge">detected</span>}
                      </span>
                      <span className="context-override-domain-desc">{meta.description}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
