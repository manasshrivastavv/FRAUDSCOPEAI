import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Settings,
  Sliders,
  Cpu,
  Shield,
  Save,
  CheckCircle,
  AlertTriangle,
  Info,
  Globe,
  Bell,
  EyeOff,
  Camera,
  Trash2,
  KeyRound,
  User as UserIcon,
  Mail,
  ShieldCheck,
  LogOut,
  Loader2,
  Edit3,
  Check,
  X
} from 'lucide-react';
import { api, authApi } from '../services/api';
import { SystemSettings, User } from '../types';
import { useAuth } from '../context/AuthContext';

export const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, updateUser, logout } = useAuth();

  const [settingsData, setSettingsData] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);

  // Form states for System Settings
  const [lowCutoff, setLowCutoff] = useState(35);
  const [highCutoff, setHighCutoff] = useState(70);
  const [similarityCutoff, setSimilarityCutoff] = useState(0.78);
  const [demoMode, setDemoMode] = useState(true);

  const [supportedLanguages, setSupportedLanguages] = useState({
    english: true,
    hindi: true,
    hinglish: true,
  });

  const [privacySettings, setPrivacySettings] = useState({
    maskPhoneNumbers: true,
    maskUpiHandles: true,
    redactSensitiveOcr: true,
  });

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Profile & Account Management States
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarSuccess, setAvatarSuccess] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const [editingProfile, setEditingProfile] = useState(false);
  const [fullNameInput, setFullNameInput] = useState(user?.full_name || '');
  const [roleInput, setRoleInput] = useState(user?.role || 'Investigator');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);

  const [changingPassword, setChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setFullNameInput(user.full_name);
      setRoleInput(user.role);
    }
  }, [user]);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const data = await api.getSettings();
      setSettingsData(data);
      setLowCutoff(data.risk_threshold_low || 35);
      setHighCutoff(data.risk_threshold_high || 70);
      setSimilarityCutoff(data.similarity_threshold || 0.78);
      setDemoMode(data.demo_mode ?? true);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load system settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  // Avatar Upload Handler
  const handleAvatarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setAvatarError(null);
    setAvatarSuccess(null);
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate MIME type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      setAvatarError('Invalid format. Please select a JPEG, PNG, WebP, or GIF image.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // Validate file size (2 MB limit)
    if (file.size > 2 * 1024 * 1024) {
      setAvatarError('File size exceeds the 2 MB limit. Please select a smaller photo.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // Set local preview immediately
    const previewUrl = URL.createObjectURL(file);
    setAvatarPreview(previewUrl);
    setAvatarUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const updatedUser = await authApi.uploadAvatar(formData);
      updateUser(updatedUser);
      setAvatarSuccess('Profile photo uploaded and saved successfully.');
      setTimeout(() => setAvatarSuccess(null), 4000);
    } catch (err: any) {
      setAvatarError(err.message || 'Failed to upload profile photo.');
      setAvatarPreview(null);
    } finally {
      setAvatarUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Avatar Removal Handler
  const handleRemoveAvatar = async () => {
    setAvatarError(null);
    setAvatarSuccess(null);
    setAvatarUploading(true);
    try {
      const updatedUser = await authApi.removeAvatar();
      updateUser(updatedUser);
      setAvatarPreview(null);
      setAvatarSuccess('Profile photo removed. Default initials avatar restored.');
      setTimeout(() => setAvatarSuccess(null), 4000);
    } catch (err: any) {
      setAvatarError(err.message || 'Failed to remove profile photo.');
    } finally {
      setAvatarUploading(false);
    }
  };

  // Update Profile Name and Role
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    setProfileSuccess(null);

    if (!fullNameInput.trim() || fullNameInput.trim().length < 2) {
      setProfileError('Full name must be at least 2 characters.');
      return;
    }

    setProfileSaving(true);
    try {
      const updatedUser = await authApi.updateProfile({
        full_name: fullNameInput.trim(),
        role: roleInput
      });
      updateUser(updatedUser);
      setProfileSuccess('Profile details updated successfully.');
      setEditingProfile(false);
      setTimeout(() => setProfileSuccess(null), 4000);
    } catch (err: any) {
      setProfileError(err.message || 'Failed to update profile.');
    } finally {
      setProfileSaving(false);
    }
  };

  // Change Password
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!currentPassword) {
      setPasswordError('Please enter your current password.');
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters long.');
      return;
    }

    if (!anyCharIsDigitOrSymbol(newPassword)) {
      setPasswordError('New password must include at least one number or special symbol.');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setPasswordError('New password confirmation does not match.');
      return;
    }

    setPasswordSaving(true);
    try {
      await authApi.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_new_password: confirmNewPassword
      });
      setPasswordSuccess('Password changed successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setChangingPassword(false);
      setTimeout(() => setPasswordSuccess(null), 4000);
    } catch (err: any) {
      setPasswordError(err.message || 'Failed to change password. Please verify current password.');
    } finally {
      setPasswordSaving(false);
    }
  };

  const anyCharIsDigitOrSymbol = (str: string) => {
    return /[0-9]/.test(str) || /[^a-zA-Z0-9]/.test(str);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lowCutoff >= highCutoff) {
      setErrorMsg('Low risk threshold must be strictly less than high risk threshold.');
      return;
    }
    setSaving(true);
    setSaveSuccess(false);
    setErrorMsg(null);

    try {
      await api.updateSettings({
        risk_threshold_low: lowCutoff,
        risk_threshold_high: highCutoff,
        similarity_threshold: similarityCutoff,
        demo_mode: demoMode,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
      await fetchSettings();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to persist settings.');
    } finally {
      setSaving(false);
    }
  };

  const initials = user?.full_name
    ? user.full_name.split(' ').map(p => p[0]).join('').substring(0, 2).toUpperCase()
    : 'FS';

  const avatarDisplayUrl = avatarPreview || user?.avatar_url;

  if (loading) {
    return (
      <div className="py-24 text-center text-xs font-mono text-[var(--muted)] space-y-2">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--primary)] mx-auto mb-2" />
        <p>Loading application configuration & account profile...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12 font-sans">
      {/* Page Header */}
      <div className="border-b border-[var(--border)] pb-3">
        <h1 className="text-2xl sm:text-3xl font-serif font-bold text-[var(--text)] tracking-tight">
          Account Profile & System Calibration
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Manage your investigator credentials, profile photo, security settings, and AI engine thresholds.
        </p>
      </div>

      {/* =========================================================================
          1. USER ACCOUNT & PROFILE SECTION (Requirements #4 & #7)
         ========================================================================= */}
      <div className="rounded-[var(--radius)] bg-[var(--card)] border border-[var(--border)] p-6 shadow-xs space-y-6">
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
          <div className="flex items-center gap-2">
            <UserIcon className="w-5 h-5 text-[var(--primary)]" />
            <h2 className="text-sm sm:text-base font-bold text-[var(--text)]">User Account & Profile Details</h2>
          </div>
          <span className="text-xs font-mono px-2.5 py-0.5 rounded bg-[var(--bg)] border border-[var(--border)] text-[var(--muted)]">
            ID: #{user?.id ?? '—'}
          </span>
        </div>

        {/* Avatar Status Messages */}
        {avatarSuccess && (
          <div className="p-3 rounded-[var(--radius)] bg-[#E6F7F0] border border-[#A3E3CB] text-xs text-[#1D6B4F] flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{avatarSuccess}</span>
          </div>
        )}
        {avatarError && (
          <div className="p-3 rounded-[var(--radius)] bg-[#FDE8E8] border border-[#F8B4B6] text-xs text-[#A8341C] flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{avatarError}</span>
          </div>
        )}

        {/* Profile Card & Avatar Row */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-6">
          {/* Avatar with Upload Action */}
          <div className="relative group shrink-0">
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-[var(--accent)] text-white text-xl sm:text-2xl font-mono font-bold flex items-center justify-center shadow-md ring-2 ring-[var(--border)] overflow-hidden">
              {avatarDisplayUrl ? (
                <img
                  src={avatarDisplayUrl}
                  alt={user?.full_name || 'User Avatar'}
                  className="w-full h-full object-cover"
                />
              ) : (
                initials
              )}
            </div>

            {avatarUploading && (
              <div className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-white" />
              </div>
            )}

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={avatarUploading}
              className="absolute bottom-0 right-0 p-2 rounded-full bg-[var(--primary)] text-white shadow-md hover:opacity-90 transition-opacity ring-2 ring-[var(--card)]"
              title="Upload new profile photo"
              aria-label="Upload profile photo"
            >
              <Camera className="w-3.5 h-3.5" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleAvatarSelect}
              className="hidden"
            />
          </div>

          {/* User Details */}
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h3 className="text-lg font-bold text-[var(--text)] tracking-tight truncate">
                {user?.full_name || 'Investigator'}
              </h3>
              <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-[var(--primary)] text-white">
                {user?.role || 'Investigator'}
              </span>
            </div>

            <p className="text-xs text-[var(--muted)] flex items-center gap-1.5 font-mono">
              <Mail className="w-3.5 h-3.5 text-[var(--muted)]" />
              <span>{user?.email || '—'}</span>
            </p>

            <p className="text-[11px] text-[var(--muted)] font-mono">
              Username: <strong className="text-[var(--text)]">@{user?.username}</strong>
            </p>

            {/* Avatar Actions */}
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarUploading}
                className="text-xs px-2.5 py-1 rounded-[var(--radius)] border border-[var(--border)] hover:bg-[var(--table-hover)] text-[var(--text)] font-medium flex items-center gap-1.5 transition-colors"
              >
                <Camera className="w-3 h-3 text-[var(--primary)]" />
                <span>Change Photo</span>
              </button>

              {user?.avatar_url && (
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  disabled={avatarUploading}
                  className="text-xs px-2.5 py-1 rounded-[var(--radius)] border border-red-200 text-[#A8341C] hover:bg-[#FDE8E8] font-medium flex items-center gap-1.5 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Remove Photo</span>
                </button>
              )}
            </div>
          </div>

          {/* Edit Profile CTA & Logout Button */}
          <div className="flex flex-row sm:flex-col items-center gap-2 sm:self-center shrink-0">
            <button
              type="button"
              onClick={() => {
                setEditingProfile(!editingProfile);
                setChangingPassword(false);
              }}
              className="btn-secondary text-xs py-2 px-3.5 flex items-center gap-1.5"
            >
              <Edit3 className="w-3.5 h-3.5 text-[var(--primary)]" />
              <span>{editingProfile ? 'Cancel Edit' : 'Edit Profile'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setChangingPassword(!changingPassword);
                setEditingProfile(false);
              }}
              className="btn-secondary text-xs py-2 px-3.5 flex items-center gap-1.5"
            >
              <KeyRound className="w-3.5 h-3.5 text-[var(--primary)]" />
              <span>{changingPassword ? 'Cancel' : 'Change Password'}</span>
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="text-xs py-2 px-3.5 rounded-[var(--radius)] border border-red-300 text-[#A8341C] hover:bg-[#FDE8E8] font-semibold flex items-center gap-1.5 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Log out</span>
            </button>
          </div>
        </div>

        {/* Inline Edit Profile Form */}
        {editingProfile && (
          <form onSubmit={handleUpdateProfile} className="p-4 rounded-[var(--radius)] bg-[var(--bg)] border border-[var(--border)] space-y-4 animate-in fade-in">
            <h4 className="text-xs font-bold font-mono uppercase tracking-wider text-[var(--text)]">
              Update Personal Details
            </h4>

            {profileError && (
              <div className="p-2.5 rounded-[var(--radius)] bg-[#FDE8E8] border border-[#F8B4B6] text-xs text-[#A8341C] flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{profileError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="block text-xs font-bold text-[var(--text)] uppercase font-mono">
                  Full Name:
                </label>
                <input
                  type="text"
                  value={fullNameInput}
                  onChange={(e) => setFullNameInput(e.target.value)}
                  className="input-surface w-full p-2 text-xs sm:text-sm text-[var(--text)]"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-[var(--text)] uppercase font-mono">
                  Role:
                </label>
                <select
                  value={roleInput}
                  onChange={(e) => setRoleInput(e.target.value)}
                  className="input-surface w-full p-2 text-xs sm:text-sm text-[var(--text)] font-mono"
                >
                  <option value="Investigator">Investigator</option>
                  <option value="Fraud Analyst">Fraud Analyst</option>
                  <option value="Developer">Developer</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={() => setEditingProfile(false)}
                className="btn-secondary text-xs py-1.5 px-3"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={profileSaving}
                className="btn-primary text-xs py-1.5 px-4 flex items-center gap-1.5"
              >
                {profileSaving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Save Changes</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Inline Change Password Form */}
        {changingPassword && (
          <form onSubmit={handleChangePassword} className="p-4 rounded-[var(--radius)] bg-[var(--bg)] border border-[var(--border)] space-y-4 animate-in fade-in">
            <h4 className="text-xs font-bold font-mono uppercase tracking-wider text-[var(--text)]">
              Change Account Password
            </h4>

            {passwordError && (
              <div className="p-2.5 rounded-[var(--radius)] bg-[#FDE8E8] border border-[#F8B4B6] text-xs text-[#A8341C] flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{passwordError}</span>
              </div>
            )}
            {passwordSuccess && (
              <div className="p-2.5 rounded-[var(--radius)] bg-[#E6F7F0] border border-[#A3E3CB] text-xs text-[#1D6B4F] flex items-center gap-2">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>{passwordSuccess}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="block text-xs font-bold text-[var(--text)] uppercase font-mono">
                  Current Password:
                </label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="input-surface w-full p-2 text-xs font-mono text-[var(--text)]"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-[var(--text)] uppercase font-mono">
                  New Password:
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  className="input-surface w-full p-2 text-xs font-mono text-[var(--text)]"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-[var(--text)] uppercase font-mono">
                  Confirm New Password:
                </label>
                <input
                  type="password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder="Repeat new password"
                  className="input-surface w-full p-2 text-xs font-mono text-[var(--text)]"
                  required
                />
              </div>
            </div>

            <div className="flex items-center gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={() => setChangingPassword(false)}
                className="btn-secondary text-xs py-1.5 px-3"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={passwordSaving}
                className="btn-primary text-xs py-1.5 px-4 flex items-center gap-1.5"
              >
                {passwordSaving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Updating Password...</span>
                  </>
                ) : (
                  <>
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>Update Password</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* =========================================================================
          2. ENGINE CALIBRATION & THRESHOLDS SECTION
         ========================================================================= */}
      <form onSubmit={handleSaveSettings} className="space-y-6">
        {/* Risk Thresholds Calibration Box */}
        <div className="rounded-[var(--radius)] bg-[var(--card)] border border-[var(--border)] p-6 shadow-xs space-y-6">
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
            <div>
              <h2 className="text-sm font-bold text-[var(--text)]">Risk Scoring Calibration</h2>
              <p className="text-xs text-[var(--muted)]">Configure score boundary bands (0–34 Low, 35–69 Medium, 70–100 High)</p>
            </div>
            <Sliders className="w-4 h-4 text-[var(--primary)]" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="block text-xs text-[var(--muted)] font-medium">
                Low Risk Ceiling (Currently: {lowCutoff}/100)
              </label>
              <input
                type="range"
                min={10}
                max={49}
                value={lowCutoff}
                onChange={(e) => setLowCutoff(parseInt(e.target.value, 10))}
                className="w-full accent-[#2FA97C]"
              />
              <span className="text-[11px] font-mono text-[var(--muted)] block">
                Scores &lt; {lowCutoff} classified as LOW RISK
              </span>
            </div>

            <div className="space-y-2">
              <label className="block text-xs text-[var(--muted)] font-medium">
                High Risk Floor (Currently: {highCutoff}/100)
              </label>
              <input
                type="range"
                min={50}
                max={90}
                value={highCutoff}
                onChange={(e) => setHighCutoff(parseInt(e.target.value, 10))}
                className="w-full accent-[#E5484D]"
              />
              <span className="text-[11px] font-mono text-[var(--muted)] block">
                Scores &ge; {highCutoff} classified as HIGH RISK
              </span>
            </div>
          </div>
        </div>

        {/* Multilingual Support Settings */}
        <div className="rounded-[var(--radius)] bg-[var(--card)] border border-[var(--border)] p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
            <div>
              <h2 className="text-sm font-bold text-[var(--text)]">Multilingual Detection Vectors</h2>
              <p className="text-xs text-[var(--muted)]">Enable or disable language lexicons and transliteration handlers</p>
            </div>
            <Globe className="w-4 h-4 text-[var(--primary)]" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <label className="p-3 rounded-[var(--radius)] bg-[var(--bg)] border border-[var(--border)] flex items-center justify-between cursor-pointer">
              <span>English Lexicon</span>
              <input
                type="checkbox"
                checked={supportedLanguages.english}
                onChange={(e) => setSupportedLanguages({ ...supportedLanguages, english: e.target.checked })}
                className="accent-[var(--primary)]"
              />
            </label>
            <label className="p-3 rounded-[var(--radius)] bg-[var(--bg)] border border-[var(--border)] flex items-center justify-between cursor-pointer">
              <span>Hindi Devanagari</span>
              <input
                type="checkbox"
                checked={supportedLanguages.hindi}
                onChange={(e) => setSupportedLanguages({ ...supportedLanguages, hindi: e.target.checked })}
                className="accent-[var(--primary)]"
              />
            </label>
            <label className="p-3 rounded-[var(--radius)] bg-[var(--bg)] border border-[var(--border)] flex items-center justify-between cursor-pointer">
              <span>Hinglish Romanized</span>
              <input
                type="checkbox"
                checked={supportedLanguages.hinglish}
                onChange={(e) => setSupportedLanguages({ ...supportedLanguages, hinglish: e.target.checked })}
                className="accent-[var(--primary)]"
              />
            </label>
          </div>
        </div>

        {/* Privacy & Redaction Settings */}
        <div className="rounded-[var(--radius)] bg-[var(--card)] border border-[var(--border)] p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
            <div>
              <h2 className="text-sm font-bold text-[var(--text)]">Privacy & Credential Masking</h2>
              <p className="text-xs text-[var(--muted)]">Automatic redacting of sensitive phone numbers, cards, and personal identifiers</p>
            </div>
            <EyeOff className="w-4 h-4 text-[var(--primary)]" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <label className="p-3 rounded-[var(--radius)] bg-[var(--bg)] border border-[var(--border)] flex items-center justify-between cursor-pointer">
              <span>Mask Phone Numbers (+91 ***)</span>
              <input
                type="checkbox"
                checked={privacySettings.maskPhoneNumbers}
                onChange={(e) => setPrivacySettings({ ...privacySettings, maskPhoneNumbers: e.target.checked })}
                className="accent-[var(--primary)]"
              />
            </label>
            <label className="p-3 rounded-[var(--radius)] bg-[var(--bg)] border border-[var(--border)] flex items-center justify-between cursor-pointer">
              <span>Redact Card Numbers & PINs</span>
              <input
                type="checkbox"
                checked={privacySettings.maskUpiHandles}
                onChange={(e) => setPrivacySettings({ ...privacySettings, maskUpiHandles: e.target.checked })}
                className="accent-[var(--primary)]"
              />
            </label>
            <label className="p-3 rounded-[var(--radius)] bg-[var(--bg)] border border-[var(--border)] flex items-center justify-between cursor-pointer">
              <span>Sanitize OCR Data</span>
              <input
                type="checkbox"
                checked={privacySettings.redactSensitiveOcr}
                onChange={(e) => setPrivacySettings({ ...privacySettings, redactSensitiveOcr: e.target.checked })}
                className="accent-[var(--primary)]"
              />
            </label>
          </div>
        </div>

        {/* Error / Success Notifications */}
        {errorMsg && (
          <div className="p-3.5 rounded-[var(--radius)] bg-[#FDE8E8] border border-[#F8B4B6] text-xs text-[#A8341C] flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {saveSuccess && (
          <div className="p-3.5 rounded-[var(--radius)] bg-[#E6F7F0] border border-[#A3E3CB] text-xs font-mono text-[#1D6B4F] flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>Settings successfully saved and persisted to backend database.</span>
          </div>
        )}

        {/* Save Button */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="btn-primary text-xs py-2.5 px-6 shadow-xs flex items-center gap-2"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? 'Saving...' : 'Save Configuration'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
