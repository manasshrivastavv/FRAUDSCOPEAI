import React, { useEffect, useState } from 'react';
import {
  X,
  ShieldAlert,
  ExternalLink,
  Copy,
  Check,
  FileDown,
  Layers,
  Phone,
  CreditCard,
  Clock,
  AlertTriangle,
  FileText,
  Eye,
  CheckCircle2,
  Tag,
  Globe,
  ShieldCheck,
  AlertCircle,
  ThumbsDown,
  Brain
} from 'lucide-react';
import { RiskBadge } from '../ui/RiskBadge';
import { StatusBadge } from '../ui/StatusBadge';
import { AdvertisementDetail, AdvertisementSummary, InvestigationReport } from '../../types';
import { api } from '../../services/api';
import { generateCaseReportPdf } from '../../services/pdfReportGenerator';
import { AiInvestigationReportModal } from './AiInvestigationReportModal';

interface EvidenceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  ad: AdvertisementDetail | AdvertisementSummary | null;
  onStatusUpdate?: (adId: number | string, newStatus: string) => void;
}

export const EvidenceDrawer: React.FC<EvidenceDrawerProps> = ({
  isOpen,
  onClose,
  ad,
  onStatusUpdate,
}) => {
  const [detail, setDetail] = useState<AdvertisementDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [currentStatus, setCurrentStatus] = useState<string>('NEW');
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [pdfSuccess, setPdfSuccess] = useState(false);
  const [feedbackSaved, setFeedbackSaved] = useState(false);

  useEffect(() => {
    if (ad) {
      setCurrentStatus(ad.review_status || 'NEW');
      setLoadingDetail(true);
      api.getAdDetail(ad.id)
        .then((fullData) => {
          setDetail(fullData);
        })
        .catch((err) => {
          console.error('Failed to load ad detail', err);
          if ('evidence_items' in ad) {
            setDetail(ad as AdvertisementDetail);
          }
        })
        .finally(() => setLoadingDetail(false));
    } else {
      setDetail(null);
    }
  }, [ad]);

  // Keyboard Escape listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !ad) return null;

  const currentAd = detail || ad;
  const customId = currentAd.custom_id || `AD-${currentAd.id}`;
  const rawScore = ('analysis' in currentAd && currentAd.analysis?.risk_score !== undefined)
    ? currentAd.analysis.risk_score
    : (currentAd as any).risk_score;
  const riskScore = rawScore !== null && rawScore !== undefined ? Math.round(rawScore) : 0;
  const riskLevel = ('analysis' in currentAd && currentAd.analysis?.risk_level)
    ? currentAd.analysis.risk_level
    : (currentAd as any).risk_level || 'LOW';

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleStatusChange = (status: string) => {
    setCurrentStatus(status);
    api.updateAdStatus(ad.id, status)
      .then(() => {
        if (onStatusUpdate) {
          onStatusUpdate(ad.id, status);
        }
      })
      .catch((err) => {
        console.error('Failed to update status', err);
      });
  };

  const handleMarkFalsePositive = () => {
    handleStatusChange('FALSE_POSITIVE');
    setFeedbackSaved(true);
    setTimeout(() => setFeedbackSaved(false), 3000);
  };

  const handleExportPdf = () => {
    setPdfGenerating(true);
    setPdfSuccess(false);
    setTimeout(() => {
      const success = generateCaseReportPdf(currentAd, {
        analystNotes: `Investigated via FraudScope AI. Evaluated forensic risk: ${riskScore}/100 (${riskLevel}).`,
      });
      setPdfGenerating(false);
      if (success) {
        setPdfSuccess(true);
        setTimeout(() => setPdfSuccess(false), 4000);
      }
    }, 400);
  };

  const [aiReport, setAiReport] = useState<InvestigationReport | null>(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [loadingAiReport, setLoadingAiReport] = useState(false);

  const handleOpenAiReport = async () => {
    if (!ad) return;
    setLoadingAiReport(true);
    try {
      const rep = await api.generateInvestigationReport({ advertisement_id: ad.id });
      setAiReport(rep);
      setIsReportModalOpen(true);
    } catch (err: any) {
      alert('Failed to generate AI report: ' + (err.message || 'Unknown error'));
    } finally {
      setLoadingAiReport(false);
    }
  };

  // Multilingual suspicious phrases to highlight
  const suspiciousKeywords = [
    'account for rent',
    'bank account rent',
    'current account available',
    'fresh current',
    'ATM card',
    'card + PIN',
    'card aur PIN',
    'linked SIM',
    'linked SIM ke saath',
    'account kiraye pe',
    'rent par',
    'urgent buyers',
    'urgent buyers only',
    'guaranteed returns',
    'UPI access',
    'UPI ID for rent',
    'merchant UPI',
    'debit card and account',
    'mule account',
  ];

  // Helper to highlight suspicious keywords in text
  const renderHighlightedSnippet = (text: string) => {
    if (!text) return 'No text content available.';
    let parts: { text: string; highlight: boolean }[] = [{ text, highlight: false }];

    suspiciousKeywords.forEach((kw) => {
      const nextParts: { text: string; highlight: boolean }[] = [];
      parts.forEach((part) => {
        if (part.highlight) {
          nextParts.push(part);
          return;
        }
        const lowerPart = part.text.toLowerCase();
        const lowerKw = kw.toLowerCase();
        let startIdx = 0;
        let foundIdx = lowerPart.indexOf(lowerKw, startIdx);

        if (foundIdx === -1) {
          nextParts.push(part);
        } else {
          while (foundIdx !== -1) {
            if (foundIdx > startIdx) {
              nextParts.push({ text: part.text.slice(startIdx, foundIdx), highlight: false });
            }
            nextParts.push({ text: part.text.slice(foundIdx, foundIdx + kw.length), highlight: true });
            startIdx = foundIdx + kw.length;
            foundIdx = lowerPart.indexOf(lowerKw, startIdx);
          }
          if (startIdx < part.text.length) {
            nextParts.push({ text: part.text.slice(startIdx), highlight: false });
          }
        }
      });
      parts = nextParts;
    });

    return parts.map((chunk, idx) =>
      chunk.highlight ? (
        <mark
          key={idx}
          className="bg-[#FDE8E8] text-[#A8341C] border border-[#F8B4B6] px-1 py-0.2 rounded font-semibold"
        >
          {chunk.text}
        </mark>
      ) : (
        <span key={idx}>{chunk.text}</span>
      )
    );
  };

  // Extracted entities from database
  const entities = detail?.entities || ('entities' in ad ? (ad as any).entities : []) || [];
  const phones = entities.filter((e: any) => e.entity_type === 'PHONE');
  const upis = entities.filter((e: any) => e.entity_type === 'UPI');
  const urls = entities.filter((e: any) => e.entity_type === 'URL_DOMAIN');
  const tele = entities.filter((e: any) => e.entity_type === 'TELEGRAM');

  // Matched rules
  const matchedRules = detail?.analysis?.triggered_rules || ('analysis' in ad ? (ad.analysis as any)?.triggered_rules : []) || [];
  const relatedAds = detail?.related_ads || [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-in Drawer Container */}
      <div
        className="relative w-full max-w-2xl bg-[var(--card)] border-l border-[var(--border)] h-full flex flex-col z-10 shadow-2xl overflow-hidden animate-in slide-in-from-right duration-200 text-[var(--text)]"
        role="dialog"
        aria-modal="true"
        aria-label="Post Evidence Drawer"
      >
        {/* Drawer Header */}
        <div className="h-14 px-5 bg-[#FFFFFF] border-b border-[var(--border)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-[var(--radius)] bg-[#FDE8E8] border border-[#F8B4B6] flex items-center justify-center text-[#A8341C]">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-[var(--text)] tracking-wider">{customId}</span>
                <span className="text-[10px] font-mono px-2 py-0.2 rounded bg-[var(--bg)] border border-[var(--border)] text-[var(--muted)]">
                  {detail?.platform || (currentAd as any).platform || 'Unknown'}
                </span>
              </div>
              <p className="text-[11px] text-[var(--muted)] font-mono mt-0.5">
                Evidence Dossier & Forensic Investigation Report
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <RiskBadge level={riskLevel} score={riskScore} size="sm" />
            <button
              onClick={onClose}
              className="p-1.5 rounded-[var(--radius)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--table-hover)] transition-colors ml-1"
              aria-label="Close Evidence Drawer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-[var(--bg)]">
          {/* Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 rounded-[var(--radius)] bg-[#FFFFFF] border border-[var(--border)] shadow-2xs">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-[var(--muted)]">Status:</span>
              <select
                value={currentStatus}
                onChange={(e) => handleStatusChange(e.target.value)}
                className="input-surface text-xs font-mono text-[var(--text)] px-2 py-1"
              >
                <option value="NEW">New</option>
                <option value="NEEDS_REVIEW">Needs review</option>
                <option value="UNDER_INVESTIGATION">Needs review</option>
                <option value="ESCALATED">Escalated</option>
                <option value="CLOSED">Closed</option>
                <option value="FALSE_POSITIVE">Dismissed (False Positive)</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleMarkFalsePositive}
                className="btn-secondary text-xs py-1 px-2.5 flex items-center gap-1.5 text-[var(--muted)] hover:text-[#A8341C]"
                title="Mark this detection as a false positive"
              >
                <ThumbsDown className="w-3.5 h-3.5" />
                <span>False positive</span>
              </button>

              <button
                type="button"
                onClick={handleOpenAiReport}
                disabled={loadingAiReport}
                className="btn-secondary text-xs flex items-center gap-1.5 py-1 px-3 text-cyan-600 border-cyan-500/40 hover:bg-cyan-50 dark:hover:bg-cyan-950/30"
                title="Inspect full 11-section structured AI Investigation Report"
              >
                <Brain className={`w-3.5 h-3.5 ${loadingAiReport ? 'animate-spin' : ''}`} />
                <span>{loadingAiReport ? 'Generating...' : 'AI Report'}</span>
              </button>

              <button
                onClick={handleExportPdf}
                disabled={pdfGenerating}
                className="btn-primary text-xs flex items-center gap-1.5 py-1 px-3"
              >
                <FileDown className="w-3.5 h-3.5" />
                <span>{pdfGenerating ? 'Generating...' : 'Generate case report'}</span>
              </button>
            </div>
          </div>

          {feedbackSaved && (
            <div className="p-2.5 rounded-[var(--radius)] bg-[#E6F7F0] border border-[#A3E3CB] text-xs font-mono text-[#1D6B4F] flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Feedback recorded. Marked as false positive.</span>
            </div>
          )}

          {pdfSuccess && (
            <div className="p-2.5 rounded-[var(--radius)] bg-[#E6F7F0] border border-[#A3E3CB] text-xs font-mono text-[#1D6B4F] flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Official 2–4 page forensic case dossier generated with SHA-256 evidence hash!</span>
            </div>
          )}

          {/* Section A: Original Post Details */}
          <div className="rounded-[var(--radius)] bg-[#FFFFFF] border border-[var(--border)] p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--muted)] font-mono flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span>Original Advertisement Snippet</span>
              </h3>
              <span className="text-[11px] font-mono text-[var(--muted)]">
                {currentAd.created_at ? new Date(currentAd.created_at).toLocaleString() : 'Recent'}
              </span>
            </div>

            <div className="p-3 rounded-[var(--radius)] bg-[var(--bg)] border border-[var(--border)] text-xs text-[var(--text)] leading-relaxed font-sans select-text">
              {renderHighlightedSnippet(currentAd.original_text)}
            </div>

            {/* Explanation box */}
            {detail?.analysis?.explanation && (
              <div className="p-2.5 rounded-[var(--radius)] bg-[var(--card)] border border-[var(--border)] text-xs text-[var(--muted)] leading-relaxed">
                <span className="font-mono font-bold text-[var(--text)] block mb-0.5">Model Reasoning:</span>
                {detail.analysis.explanation}
              </div>
            )}

            {/* Dataset Replay Provenance & Ground Truth */}
            {(currentAd.data_source === 'DATASET_REPLAY' || (detail?.evidence_items && detail.evidence_items.some((ev: any) => ev.evidence_type === 'DATASET_GROUND_TRUTH'))) && (
              <div className="p-3 rounded-[var(--radius)] bg-[#FFF7ED] border border-[#FED7AA] text-xs space-y-1.5 font-sans">
                <div className="flex items-center justify-between font-mono">
                  <span className="font-bold text-[#C2410C] flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#EA580C] animate-pulse" />
                    DATASET PROVENANCE & GROUND TRUTH
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-white text-[#C2410C] border border-[#FED7AA] font-bold">
                    REPLAY FEED
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-[#9A3412] pt-1">
                  <div>
                    <span className="text-[#C2410C]/70">Event ID: </span>
                    <span className="font-bold">{currentAd.external_id || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-[#C2410C]/70">Provenance: </span>
                    <span className="font-bold">JSONL / CSV Dataset</span>
                  </div>
                </div>
                {detail?.evidence_items && detail.evidence_items.filter((ev: any) => ev.evidence_type === 'DATASET_GROUND_TRUTH').map((ev: any, idx: number) => (
                  <div key={idx} className="p-2 rounded bg-white/80 border border-[#FED7AA] text-[11px] text-[#7C2D12] space-y-0.5">
                    <div className="font-bold font-mono">{ev.matched_text}</div>
                    <div className="text-[10px] text-[#9A3412] leading-tight">{ev.description}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section B: Extracted Identifiers */}
          <div className="rounded-[var(--radius)] bg-[#FFFFFF] border border-[var(--border)] p-3.5 space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--muted)] font-mono">
              Extracted Identifiers ({entities.length})
            </h3>

            {entities.length === 0 ? (
              <div className="p-3 rounded-[var(--radius)] bg-[var(--bg)] border border-[var(--border)] text-center text-xs font-mono text-[var(--muted)]">
                No phone numbers, UPI VPAs or URLs extracted from this text snippet.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {phones.map((p: any, i: number) => (
                  <div key={i} className="p-2 rounded-[var(--radius)] bg-[var(--bg)] border border-[var(--border)] flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center gap-1.5 truncate">
                      <Phone className="w-3 h-3 text-[#0F6E7A]" />
                      <span className="font-bold text-[var(--text)] truncate">{p.entity_value}</span>
                    </div>
                    <button onClick={() => copyToClipboard(p.entity_value, `p-${i}`)} className="text-[var(--muted)] hover:text-[var(--text)]">
                      {copiedKey === `p-${i}` ? <Check className="w-3 h-3 text-[#1D6B4F]" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                ))}

                {upis.map((u: any, i: number) => (
                  <div key={i} className="p-2 rounded-[var(--radius)] bg-[var(--bg)] border border-[var(--border)] flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center gap-1.5 truncate">
                      <CreditCard className="w-3 h-3 text-[#8A5A00]" />
                      <span className="font-bold text-[var(--text)] truncate">{u.entity_value}</span>
                    </div>
                    <button onClick={() => copyToClipboard(u.entity_value, `u-${i}`)} className="text-[var(--muted)] hover:text-[var(--text)]">
                      {copiedKey === `u-${i}` ? <Check className="w-3 h-3 text-[#1D6B4F]" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                ))}

                {urls.map((ur: any, i: number) => (
                  <div key={i} className="p-2 rounded-[var(--radius)] bg-[var(--bg)] border border-[var(--border)] flex items-center justify-between text-xs font-mono sm:col-span-2">
                    <div className="flex items-center gap-1.5 truncate">
                      <Globe className="w-3 h-3 text-[var(--accent)]" />
                      <span className="font-bold text-[var(--text)] truncate">{ur.entity_value}</span>
                    </div>
                    <button onClick={() => copyToClipboard(ur.entity_value, `ur-${i}`)} className="text-[var(--muted)] hover:text-[var(--text)]">
                      {copiedKey === `ur-${i}` ? <Check className="w-3 h-3 text-[#1D6B4F]" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section C: Matched Fraud Rules */}
          <div className="rounded-[var(--radius)] bg-[#FFFFFF] border border-[var(--border)] p-3.5 space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--muted)] font-mono">
              Triggered Detection Rules ({matchedRules.length})
            </h3>

            {matchedRules.length === 0 ? (
              <div className="p-3 rounded-[var(--radius)] bg-[var(--bg)] border border-[var(--border)] text-center text-xs font-mono text-[var(--muted)]">
                No financial fraud patterns or illicit account solicitation rules triggered.
              </div>
            ) : (
              <div className="space-y-1.5">
                {matchedRules.map((rule: any, idx: number) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-[var(--radius)] bg-[var(--bg)] border border-[var(--border)] space-y-0.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-bold text-[#A8341C]">
                        {rule.rule_id} ({rule.rule_name})
                      </span>
                      <span className="text-[10px] font-mono text-[#8A5A00] font-semibold">
                        Weight: {rule.weight}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text)] leading-snug">
                      {rule.explanation}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section D: Linked Advertisements */}
          <div className="rounded-[var(--radius)] bg-[#FFFFFF] border border-[var(--border)] p-3.5 space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--muted)] font-mono flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>Linked Advertisements ({relatedAds.length})</span>
            </h3>

            {relatedAds.length === 0 ? (
              <div className="p-3 rounded-[var(--radius)] bg-[var(--bg)] border border-[var(--border)] text-center text-xs font-mono text-[var(--muted)]">
                No linked advertisements sharing this text fingerprint or entity found in database.
              </div>
            ) : (
              <div className="space-y-1.5">
                {relatedAds.map((ra: any, idx: number) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-[var(--radius)] bg-[var(--bg)] border border-[var(--border)] flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-[var(--text)]">{ra.custom_id || `AD-${ra.id}`}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[var(--card)] text-[var(--muted)] border border-[var(--border)]">
                          {ra.relation_type}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--muted)] truncate max-w-sm mt-0.5">{ra.preview}</p>
                    </div>
                    <StatusBadge status={ra.review_status} size="sm" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Drawer Footer */}
        <div className="h-12 px-5 bg-[#FFFFFF] border-t border-[var(--border)] flex items-center justify-between shrink-0 text-xs">
          <span className="font-mono text-[11px] text-[var(--muted)]">
            Evidence Record #{currentAd.id}
          </span>
          <button
            onClick={onClose}
            className="btn-secondary text-xs py-1 px-3"
          >
            Close Dossier
          </button>
        </div>

        {/* Full AI Investigation Report Modal (11 sections) */}
        <AiInvestigationReportModal
          report={aiReport}
          isOpen={isReportModalOpen}
          onClose={() => setIsReportModalOpen(false)}
        />
      </div>
    </div>
  );
};
