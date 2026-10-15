import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ScanSearch,
  X,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  CheckCircle2
} from 'lucide-react';
import { api } from '../../services/api';
import { AnalysisResult } from '../../types';

interface QuickScanModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const QuickScanModal: React.FC<QuickScanModalProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [platform, setPlatform] = useState('Telegram');
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;

    setScanning(true);
    setError(null);
    try {
      const res = await api.analyzeAd(text.trim(), 'text', undefined, platform);
      onClose();
      // Navigate to flagged posts filtered to this scan or open dossier
      if (res?.custom_id || res?.id) {
        navigate(`/flagged-posts?search=${encodeURIComponent(res.custom_id || String(res.id))}`);
      } else {
        navigate('/flagged-posts');
      }
    } catch (err: any) {
      setError(err.message || 'Scan failed. Please try again.');
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div
        className="w-full max-w-lg rounded-[var(--radius)] bg-[var(--card)] border border-[var(--border)] shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        aria-label="Scan advertisement"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[#FFFFFF]">
          <div className="flex items-center gap-2">
            <ScanSearch className="w-4 h-4 text-[var(--primary)]" />
            <h3 className="text-sm font-bold text-[var(--text)]">Scan Suspicious Advertisement</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[var(--muted)] hover:text-[var(--text)] transition-colors"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleScan} className="p-4 space-y-3.5">
          {error && (
            <div className="p-2.5 rounded-[var(--radius)] bg-[#FDE8E8] border border-[#F8B4B6] text-xs text-[#A8341C] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[var(--text)] mb-1">
              Platform Source
            </label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="w-full py-1.5 px-3 input-surface text-xs"
            >
              <option value="Telegram">Telegram Channel / Bot</option>
              <option value="Instagram">Instagram Sponsored Ad</option>
              <option value="Facebook">Facebook Marketplace</option>
              <option value="WhatsApp">WhatsApp Broadcast</option>
              <option value="YouTube">YouTube Promo</option>
              <option value="Web">Web Landing Page</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text)] mb-1">
              Advertisement Text or Offer Content
            </label>
            <textarea
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste suspicious financial ad, mule account recruitment offer, Telegram handle, UPI link, or WhatsApp hotline..."
              className="w-full p-2.5 input-surface text-xs leading-relaxed"
              required
            />
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
            <button
              type="button"
              onClick={() => {
                onClose();
                navigate('/scanner', { state: { text, platform } });
              }}
              className="text-xs text-[var(--muted)] hover:text-[var(--text)] underline cursor-pointer"
            >
              Open Full Studio Scanner
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="btn-secondary text-xs py-1.5 px-3"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={scanning || !text.trim()}
                className="btn-primary text-xs py-1.5 px-3.5"
              >
                {scanning ? 'Analyzing...' : 'Scan Now'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
