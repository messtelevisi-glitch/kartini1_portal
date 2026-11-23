import React, { useState } from 'react';
import { Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { PortalLayout } from '../../layouts/PortalLayout';
import { useToast } from '../../components/ui/ToastProvider';
import { apiRequest } from '../../services/api';

export function ChangePasswordPage() {
  const { showToast } = useToast();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const hasMinLen = newPassword.length >= 8;
  const hasMixed = /[A-Z]/.test(newPassword) && /[0-9]/.test(newPassword);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      showToast('error', 'Passwords do not match');
      return;
    }
    if (!hasMinLen) {
      showToast('warning', 'Password must be at least 8 characters');
      return;
    }

    setSaving(true);
    try {
      await apiRequest('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      showToast('success', 'Password updated successfully');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      showToast('error', 'Failed to change password', err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <PortalLayout
      pageTitle="Ganti Password"
      pageSubtitle="Update your staff portal password with server-side scrypt encryption"
    >
      <div className="max-w-lg bg-white border border-slate-200 rounded-xl p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Current Password (if previously set)
            </label>
            <div className="relative">
              <input
                type={showOld ? 'text' : 'password'}
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                className="w-full pl-3 pr-10 py-2 text-sm border border-slate-200 rounded-lg"
              />
              <button
                type="button"
                onClick={() => setShowOld((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
              >
                {showOld ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">New Password</label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full pl-3 pr-10 py-2 text-sm border border-slate-200 rounded-lg"
              />
              <button
                type="button"
                onClick={() => setShowNew((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Security check: {hasMinLen ? '✓ 8+ characters' : '• Minimum 8 characters'} ·{' '}
              {hasMixed ? '✓ Includes uppercase & number' : '• Recommended: uppercase + number'}
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Confirm New Password
            </label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#243B64] hover:bg-[#1a2c4b] rounded-lg"
          >
            <LockKeyhole className="w-4 h-4" />
            <span>{saving ? 'Updating...' : 'Update Password'}</span>
          </button>
        </form>
      </div>
    </PortalLayout>
  );
}
