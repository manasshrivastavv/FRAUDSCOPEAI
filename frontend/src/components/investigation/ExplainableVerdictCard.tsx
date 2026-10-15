import React, { useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Cpu,
  Layers,
  Search,
  ExternalLink,
  CheckCircle,
  XCircle,
  HelpCircle,
  FileText,
  ArrowRight,
  Info
} from 'lucide-react';
import { RiskBadge } from '../ui/RiskBadge';

export interface ExplainableVerdictProps {
  riskScore: number | null;
  riskLevel: 'HIGH' | 'MEDIUM' | 'LOW' | 'INCONCLUSIVE' | 'BLOCKED' | string;
  verdictSummary: string;
  sourceTarget: string;
  provisionalScore?: number | null;
  reasonIncomplete?: string | null;
  checks?: Array<{
    name: string;
    status: 'Passed' | 'Failed' | 'Not Evaluated' | 'Unavailable' | string;
    details: string;
  }>;
  observedEvidence?: Array<{
    type: string;
    value: string;
    context?: string;
  }>;
  modelAnalysis?: {
    modelAvailable?: boolean;
    modelProbability?: number;
    modelClass?: string;
    modelVersion?: string;
    modelTokens?: number;
  } | null;
  ruleIndicators?: Array<{
    category: string;
    severity: string;
    sourceQuote: string;
    explanation: string;
    context?: string;
  }>;
  reputationFindings?: {
    provider: string;
    status: string;
    detail?: string;
  } | null;
  checksCompleted?: Array<{
    check: string;
    status: string;
    result: string;
  }>;
  checksUnavailable?: Array<{
    check: string;
    status: string;
    reason: string;
  }>;
  recommendedSteps?: string[];
  calculationBreakdown?: {
    staticUrlScore?: number;
    contentSignalsScore?: number;
    mlClassifierScore?: number;
  };
  onSaveCase?: () => void;
  onExportReport?: () => void;
  savedCaseRef?: string;
}

export const ExplainableVerdictCard: React.FC<ExplainableVerdictProps> = ({
  riskScore,
  riskLevel,
  verdictSummary,
  sourceTarget,
  provisionalScore,
  reasonIncomplete,
  checks = [],
  observedEvidence = [],
  modelAnalysis,
  ruleIndicators = [],
  reputationFindings,
  checksCompleted = [],
  checksUnavailable = [],
  recommendedSteps = [],
  calculationBreakdown,
  onSaveCase,
  onExportReport,
  savedCaseRef
}) => {
  const [activeTab, setActiveTab] = useState<'evidence' | 'model' | 'rules' | 'audit'>('evidence');

  const normalizedLevel = (riskLevel || 'INCONCLUSIVE').toUpperCase();
  const isInconclusive = normalizedLevel === 'INCONCLUSIVE' || riskScore === null || riskScore === undefined;

  const riskColor =
    normalizedLevel === 'HIGH' || normalizedLevel === 'BLOCKED'
      ? '#E5484D'
      : normalizedLevel === 'MEDIUM'
      ? '#F5A524'
      : normalizedLevel === 'LOW'
      ? '#2FA97C'
      : '#6B7280'; // Slate grey for Inconclusive / Unknown

  return (
    <div className="rounded-[var(--radius)] bg-[var(--card)] border border-[var(--border)] shadow-sm overflow-hidden text-[var(--text)] transition-all">
      {/* Top Banner: Score, Level, and Verdict */}
      <div className="p-5 sm:p-6 border-b border-[var(--border)] bg-[#FFFDF7]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          {/* Left: Overall Risk Level + Gauge */}
          <div className="flex items-center gap-4">
            <div
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-full flex flex-col items-center justify-center shrink-0 border-4 shadow-xs"
              style={{
                borderColor: riskColor,
                backgroundColor: `${riskColor}10`,
              }}
            >
              <span className="text-xl sm:text-2xl font-bold font-mono tracking-tight" style={{ color: riskColor }}>
                {!isInconclusive && riskScore !== null ? Math.round(riskScore) : '—'}
              </span>
              <span className="text-[9px] font-mono uppercase text-[var(--muted)] font-semibold -mt-0.5">
                {!isInconclusive && riskScore !== null ? '/ 100' : 'Inconclusive'}
              </span>
            </div>

            <div>
              <div className="flex items-center gap-2.5 mb-1">
                <RiskBadge level={normalizedLevel} score={riskScore} size="md" />
                {provisionalScore !== undefined && provisionalScore !== null && isInconclusive && (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#FEF3D6] text-[#8A5A00] border border-[#FCD888]">
                    Provisional: {Math.round(provisionalScore)}/100
                  </span>
                )}
                <span className="text-xs font-mono text-[var(--muted)] truncate max-w-xs sm:max-w-md">
                  Target: <strong className="text-[var(--text)]">{sourceTarget}</strong>
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-[var(--text)] tracking-tight">
                Explainable Forensic Verdict
              </h2>
              <p className="text-xs text-[var(--muted)] mt-0.5 max-w-2xl leading-relaxed">
                {verdictSummary}
              </p>
              {reasonIncomplete && (
                <div className="mt-2 text-xs font-mono px-3 py-1.5 rounded bg-[#FEF3C7] border border-[#FDE68A] text-[#92400E] flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span><strong>Scan Incomplete:</strong> {reasonIncomplete} (Missing content is never treated as proof of safety)</span>
                </div>
              )}
            </div>
          </div>

          {/* Right: Actions (Save Case / Export Report) */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {savedCaseRef ? (
              <div className="px-3 py-1.5 rounded-[var(--radius)] bg-[#E6F7F0] border border-[#A3E3CB] text-[#1D6B4F] text-xs font-mono font-bold flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4" />
                <span>Saved: {savedCaseRef}</span>
              </div>
            ) : onSaveCase ? (
              <button
                type="button"
                onClick={onSaveCase}
                className="btn-secondary text-xs py-2 px-3.5 flex items-center gap-1.5 font-semibold shadow-xs"
              >
                <FileText className="w-4 h-4 text-[var(--accent)]" />
                <span>Save to Case Dossier</span>
              </button>
            ) : null}

            {onExportReport && (
              <button
                type="button"
                onClick={onExportReport}
                className="btn-primary text-xs py-2 px-3.5 flex items-center gap-1.5 font-semibold shadow-xs"
              >
                <ArrowRight className="w-4 h-4" />
                <span>Export Report PDF</span>
              </button>
            )}
          </div>
        </div>

        {/* Calculation Weights Breakdown */}
        {calculationBreakdown && (
          <div className="mt-4 pt-3.5 border-t border-[var(--border)] grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs font-mono">
            <div className="px-3 py-1.5 rounded bg-[var(--bg)] border border-[var(--border)] flex items-center justify-between">
              <span className="text-[var(--muted)]">Infrastructure & URL (25%):</span>
              <strong className="text-[var(--text)]">{calculationBreakdown.staticUrlScore ?? 0} pts</strong>
            </div>
            <div className="px-3 py-1.5 rounded bg-[var(--bg)] border border-[var(--border)] flex items-center justify-between">
              <span className="text-[var(--muted)]">Content Signals (45%):</span>
              <strong className="text-[var(--text)]">{calculationBreakdown.contentSignalsScore ?? 0} pts</strong>
            </div>
            <div className="px-3 py-1.5 rounded bg-[var(--bg)] border border-[var(--border)] flex items-center justify-between">
              <span className="text-[var(--muted)]">ML Model Score (30%):</span>
              <strong className="text-[var(--text)]">{calculationBreakdown.mlClassifierScore ?? 0} pts</strong>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Segmented Tabs */}
      <div className="px-5 pt-2 border-b border-[var(--border)] bg-[var(--bg)] flex items-center gap-1 text-xs font-mono overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('evidence')}
          className={`px-3.5 py-2.5 font-semibold transition-all border-b-2 flex items-center gap-1.5 ${
            activeTab === 'evidence'
              ? 'border-[var(--primary)] text-[var(--text)]'
              : 'border-transparent text-[var(--muted)] hover:text-[var(--text)]'
          }`}
        >
          <Search className="w-3.5 h-3.5" />
          <span>Observed Evidence ({observedEvidence.length || ruleIndicators.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('model')}
          className={`px-3.5 py-2.5 font-semibold transition-all border-b-2 flex items-center gap-1.5 ${
            activeTab === 'model'
              ? 'border-[var(--primary)] text-[var(--text)]'
              : 'border-transparent text-[var(--muted)] hover:text-[var(--text)]'
          }`}
        >
          <Cpu className="w-3.5 h-3.5" />
          <span>Model Analysis</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('rules')}
          className={`px-3.5 py-2.5 font-semibold transition-all border-b-2 flex items-center gap-1.5 ${
            activeTab === 'rules'
              ? 'border-[var(--primary)] text-[var(--text)]'
              : 'border-transparent text-[var(--muted)] hover:text-[var(--text)]'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Detection Rules ({ruleIndicators.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('audit')}
          className={`px-3.5 py-2.5 font-semibold transition-all border-b-2 flex items-center gap-1.5 ${
            activeTab === 'audit'
              ? 'border-[var(--primary)] text-[var(--text)]'
              : 'border-transparent text-[var(--muted)] hover:text-[var(--text)]'
          }`}
        >
          <HelpCircle className="w-3.5 h-3.5" />
          <span>Checks & Limitations ({checksCompleted.length + checksUnavailable.length})</span>
        </button>
      </div>

      {/* Tab Panels */}
      <div className="p-5 sm:p-6 text-xs leading-relaxed space-y-4">
        {/* TAB 1: OBSERVED EVIDENCE */}
        {activeTab === 'evidence' && (
          <div className="space-y-3">
            {ruleIndicators.length === 0 && observedEvidence.length === 0 ? (
              <div className="p-4 rounded-[var(--radius)] bg-[var(--bg)] border border-[var(--border)] text-[var(--muted)] text-center">
                No explicit deceptive financial evidence detected in target content.
              </div>
            ) : (
              ruleIndicators.map((rule, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-[var(--radius)] bg-[#FFFFFF] border border-[var(--border)] shadow-2xs space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[var(--text)] font-mono uppercase text-[11px] px-2 py-0.5 rounded bg-[var(--bg)] border border-[var(--border)]">
                      {rule.category}
                    </span>
                    <span
                      className="text-[10px] font-bold font-mono px-2 py-0.5 rounded uppercase"
                      style={{
                        backgroundColor: rule.severity === 'CRITICAL' || rule.severity === 'HIGH' ? '#FDE8E8' : '#FEF3C7',
                        color: rule.severity === 'CRITICAL' || rule.severity === 'HIGH' ? '#A8341C' : '#92400E',
                      }}
                    >
                      {rule.severity} Severity
                    </span>
                  </div>

                  <p className="text-[var(--text)] font-medium">
                    {rule.explanation}
                  </p>

                  <div className="p-2 rounded bg-[var(--bg)] font-mono text-[11px] text-[var(--text)] border-l-2 border-[var(--primary)]">
                    Source quote: <strong>"{rule.sourceQuote}"</strong>
                    {rule.context && (
                      <span className="text-[var(--muted)] block text-[10px] mt-0.5">{rule.context}</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB 2: MODEL ANALYSIS */}
        {activeTab === 'model' && (
          <div className="space-y-4">
            <div className="p-4 rounded-[var(--radius)] bg-[#FFFFFF] border border-[var(--border)] shadow-2xs space-y-3">
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-2.5">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-[var(--accent)]" />
                  <span className="font-bold text-sm text-[var(--text)]">
                    TF-IDF & Balanced Logistic Regression Classifier
                  </span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#E6F7F0] text-[#1D6B4F] font-bold border border-[#A3E3CB]">
                  ONLINE
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
                <div className="p-2.5 rounded bg-[var(--bg)] border border-[var(--border)]">
                  <span className="text-[var(--muted)] block text-[10px] uppercase">Model Version:</span>
                  <strong className="text-[var(--text)]">{modelAnalysis?.modelVersion || 'fraudscope-context-lr-v2.0'}</strong>
                </div>

                <div className="p-2.5 rounded bg-[var(--bg)] border border-[var(--border)]">
                  <span className="text-[var(--muted)] block text-[10px] uppercase">Suspicious Probability:</span>
                  <strong className="text-[var(--text)]">
                    {modelAnalysis?.modelProbability !== undefined
                      ? `${(modelAnalysis.modelProbability * 100).toFixed(1)}%`
                      : 'N/A'}
                  </strong>
                </div>

                <div className="p-2.5 rounded bg-[var(--bg)] border border-[var(--border)]">
                  <span className="text-[var(--muted)] block text-[10px] uppercase">Classification Class:</span>
                  <strong className={modelAnalysis?.modelClass === 'suspicious' ? 'text-[#E5484D]' : 'text-[#2FA97C]'}>
                    {modelAnalysis?.modelClass?.toUpperCase() || 'SAFE'}
                  </strong>
                </div>
              </div>

              <p className="text-[11px] text-[var(--muted)] leading-relaxed">
                Evaluated using disjoint group-split cross validation against simulated and benchmark financial campaign templates.
                Model probability represents diagnostic feature weight correlation, not a calibrated legal probability.
              </p>
            </div>
          </div>
        )}

        {/* TAB 3: DETECTION RULES */}
        {activeTab === 'rules' && (
          <div className="space-y-3">
            {ruleIndicators.length === 0 ? (
              <div className="p-4 rounded-[var(--radius)] bg-[var(--bg)] border border-[var(--border)] text-[var(--muted)] text-center">
                No active fraud heuristic rules were triggered by this target.
              </div>
            ) : (
              ruleIndicators.map((ind, i) => (
                <div key={i} className="p-3 rounded-[var(--radius)] bg-[#FFFFFF] border border-[var(--border)] flex items-start justify-between gap-3">
                  <div>
                    <span className="font-bold text-[var(--text)]">{ind.category.replace(/_/g, ' ')}</span>
                    <p className="text-[var(--muted)] text-[11px] mt-0.5">{ind.explanation}</p>
                  </div>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[var(--bg)] text-[var(--text)] shrink-0">
                    {ind.severity}
                  </span>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB 4: AUDIT CHECKS & LIMITATIONS */}
        {activeTab === 'audit' && (
          <div className="space-y-4">
            {checks && checks.length > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold text-[var(--text)] font-mono uppercase text-[11px]">
                    Technical Inspection & Defense Verification:
                  </h3>
                  <span className="text-[11px] font-mono text-[var(--muted)]">
                    {checks.filter((c) => c.status === 'Passed').length} Passed · {checks.filter((c) => c.status === 'Failed').length} Failed · {checks.filter((c) => c.status === 'Not Evaluated').length} Not Evaluated
                  </span>
                </div>
                <div className="space-y-2">
                  {checks.map((c, i) => {
                    const statusConfig = {
                      Passed: {
                        icon: CheckCircle,
                        iconColor: 'text-[#2FA97C]',
                        badgeBg: 'bg-[#E6F7F0]',
                        badgeText: 'text-[#1D6B4F]',
                        badgeBorder: 'border-[#A3E3CB]',
                      },
                      Failed: {
                        icon: XCircle,
                        iconColor: 'text-[#E5484D]',
                        badgeBg: 'bg-[#FDE8E8]',
                        badgeText: 'text-[#A8341C]',
                        badgeBorder: 'border-[#F8B4B6]',
                      },
                      Unavailable: {
                        icon: AlertTriangle,
                        iconColor: 'text-[#F5A524]',
                        badgeBg: 'bg-[#FEF3D6]',
                        badgeText: 'text-[#8A5A00]',
                        badgeBorder: 'border-[#FCD888]',
                      },
                    }[c.status] || {
                      icon: HelpCircle,
                      iconColor: 'text-[#6B7280]',
                      badgeBg: 'bg-[#F3F4F6]',
                      badgeText: 'text-[#4B5563]',
                      badgeBorder: 'border-[#D1D5DB]',
                    };

                    const IconComp = statusConfig.icon;

                    return (
                      <div
                        key={i}
                        className="p-3 rounded bg-[#FFFFFF] border border-[var(--border)] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono"
                      >
                        <div className="flex items-start sm:items-center gap-2">
                          <IconComp className={`w-4 h-4 shrink-0 mt-0.5 sm:mt-0 ${statusConfig.iconColor}`} />
                          <div>
                            <span className="font-bold text-[var(--text)]">{c.name}</span>
                            <p className="text-[11px] text-[var(--muted)] font-normal mt-0.5">{c.details}</p>
                          </div>
                        </div>
                        <span
                          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase self-start sm:self-center shrink-0 ${statusConfig.badgeBg} ${statusConfig.badgeText} ${statusConfig.badgeBorder}`}
                        >
                          {c.status}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <>
                <div>
                  <h3 className="font-bold text-[var(--text)] font-mono uppercase text-[11px] mb-2">
                    Completed Technical Checks:
                  </h3>
                  <div className="space-y-2">
                    {checksCompleted.map((c, i) => (
                      <div key={i} className="p-2.5 rounded bg-[#FFFFFF] border border-[var(--border)] flex items-center justify-between text-xs font-mono">
                        <span className="flex items-center gap-2 text-[var(--text)]">
                          <CheckCircle className="w-3.5 h-3.5 text-[#2FA97C] shrink-0" />
                          <span>{c.check}</span>
                        </span>
                        <span className="text-[var(--muted)] truncate max-w-xs">{c.result}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {checksUnavailable.length > 0 && (
                  <div>
                    <h3 className="font-bold text-[var(--muted)] font-mono uppercase text-[11px] mb-2">
                      Unavailable Checks & Limitations:
                    </h3>
                    <div className="space-y-2">
                      {checksUnavailable.map((u, i) => (
                        <div key={i} className="p-2.5 rounded bg-[var(--bg)] border border-[var(--border)] flex items-center justify-between text-xs font-mono text-[var(--muted)]">
                          <span className="flex items-center gap-2">
                            <HelpCircle className="w-3.5 h-3.5 text-[#F5A524] shrink-0" />
                            <span>{u.check}</span>
                          </span>
                          <span className="text-[11px] italic">{u.reason}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Recommended Next Actions Box */}
        {recommendedSteps.length > 0 && (
          <div className="p-4 rounded-[var(--radius)] bg-[#FFFDF7] border border-[var(--border)] space-y-2">
            <span className="font-bold text-[var(--text)] font-mono uppercase text-[11px] flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-[var(--accent)]" />
              Recommended Next Steps for Investigator:
            </span>
            <ul className="list-disc list-inside space-y-1 text-[var(--text)] text-xs">
              {recommendedSteps.map((step, idx) => (
                <li key={idx}>{step}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Disclaimer footer */}
        <p className="text-[11px] text-[var(--muted)] font-mono italic pt-2 border-t border-[var(--border)]">
          NOTICE: FraudScope AI findings are investigative aids generated through multi-signal heuristic evaluation and statistical models. They do not constitute certified legal proof of criminal intent.
        </p>
      </div>
    </div>
  );
};
