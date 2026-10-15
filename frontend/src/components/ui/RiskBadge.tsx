import React from 'react';
import { AlertTriangle, ShieldCheck, ShieldAlert } from 'lucide-react';

interface RiskBadgeProps {
  level?: 'LOW' | 'MEDIUM' | 'HIGH' | string | null;
  score?: number | null;
  showScore?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const RiskBadge: React.FC<RiskBadgeProps> = ({
  level = 'LOW',
  score,
  showScore = true,
  size = 'md',
  className = '',
}) => {
  const normLevel = (level || 'LOW').toUpperCase();

  const config = {
    HIGH: {
      bg: 'bg-[#FDE8E8]',
      border: 'border-[#F8B4B6]',
      text: 'text-[#A8341C]',
      dot: 'bg-[#E5484D]',
      icon: ShieldAlert,
      label: 'High risk',
    },
    MEDIUM: {
      bg: 'bg-[#FEF3D6]',
      border: 'border-[#FCD888]',
      text: 'text-[#8A5A00]',
      dot: 'bg-[#F5A524]',
      icon: AlertTriangle,
      label: 'Medium risk',
    },
    LOW: {
      bg: 'bg-[#E6F7F0]',
      border: 'border-[#A3E3CB]',
      text: 'text-[#1D6B4F]',
      dot: 'bg-[#2FA97C]',
      icon: ShieldCheck,
      label: 'Low risk',
    },
    INCONCLUSIVE: {
      bg: 'bg-[#F3F4F6]',
      border: 'border-[#D1D5DB]',
      text: 'text-[#4B5563]',
      dot: 'bg-[#9CA3AF]',
      icon: AlertTriangle,
      label: 'Inconclusive',
    },
    BLOCKED: {
      bg: 'bg-[#FDE8E8]',
      border: 'border-[#F8B4B6]',
      text: 'text-[#A8341C]',
      dot: 'bg-[#E5484D]',
      icon: ShieldAlert,
      label: 'Access Blocked',
    },
  }[normLevel] || {
    bg: 'bg-[#FBF7EE]',
    border: 'border-[#D9CFBA]',
    text: 'text-[#6F675B]',
    dot: 'bg-[#6F675B]',
    icon: AlertTriangle,
    label: 'Inconclusive',
  };

  const Icon = config.icon;

  const sizeClasses = {
    sm: 'text-[11px] px-2 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-1 gap-1.5',
    lg: 'text-sm px-3.5 py-1.5 gap-2 font-medium',
  }[size];

  return (
    <span
      className={`inline-flex items-center font-mono rounded-[var(--radius)] border font-medium ${config.bg} ${config.border} ${config.text} ${sizeClasses} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span>{config.label}</span>
      {showScore !== false && score !== undefined && score !== null && (
        <span className="font-bold border-l border-current/25 pl-1.5 ml-0.5">
          {Math.round(score)}/100
        </span>
      )}
    </span>
  );
};
