import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Command,
  LayoutDashboard,
  ShieldAlert,
  Network,
  FileBarChart2,
  Settings,
  ScanSearch,
  Languages,
  X,
  ArrowRight,
  Phone,
  CreditCard,
  Globe
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { api } from '../../services/api';
import { AdvertisementSummary } from '../../types';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenScanModal?: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onOpenScanModal,
}) => {
  const navigate = useNavigate();
  const { language, setLanguage, t } = useLanguage();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AdvertisementSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setResults([]);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Live search debounced
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await api.listAdvertisements({
          search: query.trim(),
          limit: 5,
        });
        setResults(data.items || []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  // Handle keyboard navigation & escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const quickNav = [
    { label: t('nav.dashboard', 'Overview'), icon: LayoutDashboard, path: '/console' },
    { label: t('nav.url_scanner', 'Smart URL Scanner'), icon: Globe, path: '/url-scanner' },
    { label: t('nav.website_xray', 'Website X-Ray'), icon: ScanSearch, path: '/website-xray' },
    { label: 'Full Studio Scanner (Text & OCR)', icon: ScanSearch, path: '/scanner' },
    { label: t('nav.clusters', 'Threat Network Detective'), icon: Network, path: '/network' },
    { label: t('nav.cases', 'Investigation Cases'), icon: CreditCard, path: '/cases' },
    { label: t('nav.reports', 'Forensic Reports'), icon: FileBarChart2, path: '/reports' },
    { label: t('nav.settings', 'Settings'), icon: Settings, path: '/settings' },
  ];

  const handleAction = (callback: () => void) => {
    callback();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/40 backdrop-blur-xs">
      <div
        className="w-full max-w-xl rounded-[var(--radius)] bg-[var(--card)] border border-[var(--border)] shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] bg-[#FFFFFF]">
          <Search className="w-4 h-4 text-[var(--muted)] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search posts, phone numbers, UPI IDs, URLs or type a command..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full text-sm bg-transparent border-none outline-none text-[var(--text)] placeholder-[var(--muted)]"
          />
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono text-[var(--muted)] bg-[var(--bg)] border border-[var(--border)] rounded">
            ESC
          </kbd>
          <button
            onClick={onClose}
            className="p-1 text-[var(--muted)] hover:text-[var(--text)] transition-colors"
            aria-label="Close command palette"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Area */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-3">
          {/* Live Search Results */}
          {query.trim() && (
            <div>
              <div className="px-2.5 py-1 text-[11px] font-mono uppercase text-[var(--muted)] tracking-wider">
                Matching Advertisements & Entities ({results.length})
              </div>
              {loading ? (
                <div className="p-4 text-center text-xs text-[var(--muted)] font-mono">
                  Searching database...
                </div>
              ) : results.length === 0 ? (
                <div className="p-4 text-center text-xs text-[var(--muted)]">
                  No records match "{query}"
                </div>
              ) : (
                <div className="space-y-1">
                  {results.map((ad) => (
                    <div
                      key={ad.id}
                      onClick={() => handleAction(() => navigate(`/flagged-posts?search=${encodeURIComponent(ad.custom_id || ad.id)}`))}
                      className="p-2 px-3 rounded-[var(--radius)] hover:bg-[var(--table-hover)] cursor-pointer flex items-center justify-between text-xs transition-colors"
                    >
                      <div className="flex items-center gap-2 truncate max-w-sm">
                        <span className="font-mono font-bold text-[var(--primary)] shrink-0">
                          {ad.custom_id || `AD-${ad.id}`}
                        </span>
                        <span className="text-[var(--text)] truncate">
                          {ad.original_text}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg)] text-[var(--muted)] border border-[var(--border)] shrink-0">
                        {ad.platform_detected || 'Telegram'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Quick Actions */}
          <div>
            <div className="px-2.5 py-1 text-[11px] font-mono uppercase text-[var(--muted)] tracking-wider">
              Quick Actions
            </div>
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => handleAction(() => {
                  if (onOpenScanModal) onOpenScanModal();
                  else navigate('/scanner');
                })}
                className="w-full p-2 px-3 rounded-[var(--radius)] hover:bg-[var(--table-hover)] text-left flex items-center justify-between text-xs transition-colors"
              >
                <div className="flex items-center gap-2.5 text-[var(--text)]">
                  <ScanSearch className="w-4 h-4 text-[var(--primary)]" />
                  <span className="font-medium">Scan new suspicious post</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-[var(--muted)]" />
              </button>

              <button
                type="button"
                onClick={() => handleAction(() => navigate('/network'))}
                className="w-full p-2 px-3 rounded-[var(--radius)] hover:bg-[var(--table-hover)] text-left flex items-center justify-between text-xs transition-colors"
              >
                <div className="flex items-center gap-2.5 text-[var(--text)]">
                  <Network className="w-4 h-4 text-[var(--accent)]" />
                  <span className="font-medium">Open threat clusters graph</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-[var(--muted)]" />
              </button>

              <button
                type="button"
                onClick={() => handleAction(() => navigate('/reports'))}
                className="w-full p-2 px-3 rounded-[var(--radius)] hover:bg-[var(--table-hover)] text-left flex items-center justify-between text-xs transition-colors"
              >
                <div className="flex items-center gap-2.5 text-[var(--text)]">
                  <FileBarChart2 className="w-4 h-4 text-[var(--muted)]" />
                  <span className="font-medium">Generate case report</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-[var(--muted)]" />
              </button>

              <button
                type="button"
                onClick={() => handleAction(() => setLanguage(language === 'en' ? 'hi' : 'en'))}
                className="w-full p-2 px-3 rounded-[var(--radius)] hover:bg-[var(--table-hover)] text-left flex items-center justify-between text-xs transition-colors"
              >
                <div className="flex items-center gap-2.5 text-[var(--text)]">
                  <Languages className="w-4 h-4 text-[#0F6E7A]" />
                  <span className="font-medium">
                    Switch language to {language === 'en' ? 'हिंदी (Hindi)' : 'English'}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-[var(--muted)] uppercase">
                  {language === 'en' ? 'HI' : 'EN'}
                </span>
              </button>
            </div>
          </div>

          {/* Navigation Shortcuts */}
          <div>
            <div className="px-2.5 py-1 text-[11px] font-mono uppercase text-[var(--muted)] tracking-wider">
              Navigation
            </div>
            <div className="grid grid-cols-2 gap-1">
              {quickNav.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => handleAction(() => navigate(item.path))}
                    className="p-2 px-3 rounded-[var(--radius)] hover:bg-[var(--table-hover)] text-left flex items-center gap-2 text-xs transition-colors text-[var(--text)]"
                  >
                    <Icon className="w-3.5 h-3.5 text-[var(--muted)] shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="px-4 py-2 border-t border-[var(--border)] bg-[var(--bg)] flex items-center justify-between text-[11px] font-mono text-[var(--muted)]">
          <span>Navigate with mouse or keyboard</span>
          <span>FRAUDSCOPE AI Command Suite</span>
        </div>
      </div>
    </div>
  );
};
