import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, Pencil, Plus, Trash2 } from 'lucide-react';
import { PortalLayout } from '../../layouts/PortalLayout';
import { DataTable, type ColumnDef } from '../../components/ui/DataTable';
import { ConfirmModal, Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/ToastProvider';
import { apiRequest } from '../../services/api';
import type { SubjectItem, TeacherItem } from '../../types/exam';

export function TeachersPage() {
  const { showToast } = useToast();
  const [teachers, setTeachers] = useState<TeacherItem[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TeacherItem | null>(null);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [nip, setNip] = useState('');
  const [phone, setPhone] = useState('');
  const [initialPassword, setInitialPassword] = useState('');
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<number[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const [resetTarget, setResetTarget] = useState<TeacherItem | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<TeacherItem | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [tData, sData] = await Promise.all([
        apiRequest<TeacherItem[]>('/api/teachers'),
        apiRequest<SubjectItem[]>('/api/subjects'),
      ]);
      setTeachers(tData);
      setSubjects(sData);
    } catch (err: any) {
      showToast('error', 'Failed to load teachers', err.message);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openCreate = () => {
    setEditing(null);
    setFullName('');
    setEmail('');
    setUsername('');
    setNip('');
    setPhone('');
    setInitialPassword('');
    setSelectedSubjectIds([]);
    setIsActive(true);
    setModalOpen(true);
  };

  const openEdit = (t: TeacherItem) => {
    setEditing(t);
    setFullName(t.fullName);
    setEmail(t.email);
    setUsername(t.username);
    setNip(t.nip || '');
    setPhone(t.phone || '');
    setInitialPassword('');
    setSelectedSubjectIds(t.subjectIds);
    setIsActive(t.isActive);
    setModalOpen(true);
  };

  const toggleSubject = (sid: number) => {
    setSelectedSubjectIds((prev) =>
      prev.includes(sid) ? prev.filter((id) => id !== sid) : [...prev, sid]
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedSubjectIds.length === 0) {
      showToast('warning', 'Subject assignment required', 'Select at least one subject for this teacher.');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await apiRequest(`/api/teachers/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            fullName,
            email,
            username,
            nip: nip || null,
            phone: phone || null,
            isActive,
            subjectIds: selectedSubjectIds,
          }),
        });
        showToast('success', 'Teacher updated', `${fullName} has been updated.`);
      } else {
        await apiRequest('/api/teachers', {
          method: 'POST',
          body: JSON.stringify({
            fullName,
            email,
            username,
            nip: nip || undefined,
            phone: phone || undefined,
            initialPassword,
            subjectIds: selectedSubjectIds,
          }),
        });
        showToast('success', 'Teacher created', `${fullName} can now sign in with their assigned subjects.`);
      }
      setModalOpen(false);
      await loadData();
    } catch (err: any) {
      showToast('error', 'Save failed', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    setSaving(true);
    try {
      await apiRequest(`/api/teachers/${resetTarget.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ newPassword }),
      });
      showToast('success', 'Password reset', `Password updated for ${resetTarget.fullName}`);
      setResetTarget(null);
      setNewPassword('');
    } catch (err: any) {
      showToast('error', 'Reset failed', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await apiRequest(`/api/teachers/${deleteTarget.id}`, { method: 'DELETE' });
      showToast('success', 'Teacher removed', `${deleteTarget.fullName} has been deleted.`);
      setDeleteTarget(null);
      await loadData();
    } catch (err: any) {
      showToast('error', 'Delete failed', err.message);
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnDef<TeacherItem>[] = [
    {
      key: 'name',
      header: 'Teacher Name',
      render: (t) => (
        <div>
          <p className="font-semibold text-[#243B64]">{t.fullName}</p>
          <p className="text-xs text-slate-500">
            @{t.username} · {t.email}
          </p>
        </div>
      ),
    },
    {
      key: 'subjects',
      header: 'Assigned Subjects',
      render: (t) => (
        <span className="text-xs text-slate-700">
          {t.subjects.map((s) => `${s.code} — ${s.name}`).join(' · ') || 'None'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Account Status',
      render: (t) => (
        <span className={`text-xs font-medium ${t.isActive ? 'text-emerald-700' : 'text-red-700'}`}>
          {t.isActive ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      key: 'lastLogin',
      header: 'Last Activity',
      render: (t) => (
        <span className="text-xs text-slate-500 tabular-nums">
          {t.lastLoginAt ? new Date(t.lastLoginAt).toLocaleString() : 'Never signed in'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (t) => (
        <div className="inline-flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => openEdit(t)}
            title="Edit teacher"
            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setResetTarget(t);
              setNewPassword('');
            }}
            title="Reset password"
            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            <KeyRound className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setDeleteTarget(t)}
            title="Delete teacher"
            className="p-1.5 rounded-lg border border-slate-200 text-red-600 hover:bg-red-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <PortalLayout
      pageTitle="Manajemen Guru"
      pageSubtitle="Create subject teacher accounts and enforce per-subject access boundaries"
      headerAction={
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#243B64] hover:bg-[#1a2c4b] rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add Teacher</span>
        </button>
      }
    >
      <DataTable
        data={teachers}
        columns={columns}
        keyField={(r) => r.id}
        loading={loading}
        searchPlaceholder="Search teacher by name, username, or subject..."
        searchFilter={(r, q) =>
          r.fullName.toLowerCase().includes(q) ||
          r.username.toLowerCase().includes(q) ||
          r.email.toLowerCase().includes(q) ||
          r.subjects.some((s) => s.name.toLowerCase().includes(q))
        }
        emptyTitle="No teacher accounts yet"
        emptyDescription="Add Guru Mapel accounts and assign the subjects they are authorized to manage."
        emptyAction={
          <button
            type="button"
            onClick={openCreate}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#243B64] rounded-lg"
          >
            Add First Teacher
          </button>
        }
      />

      {/* Create/Edit Teacher Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Teacher Account' : 'Add Subject Teacher'}
        subtitle="Teachers can only access questions, exams, monitoring, and results for assigned subjects."
      >
        <form id="teacher-form" onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Full Name</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">NIP (Optional)</label>
              <input
                type="text"
                value={nip}
                onChange={(e) => setNip(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Username</label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
            </div>
          </div>

          {!editing && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Initial Password (min. 8 characters)
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={initialPassword}
                onChange={(e) => setInitialPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-2">
              Assigned Subjects (Multiple allowed)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto p-3 border border-slate-200 rounded-lg bg-[#FAFBFD]">
              {subjects.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedSubjectIds.includes(s.id)}
                    onChange={() => toggleSubject(s.id)}
                    className="rounded border-slate-300 text-[#243B64]"
                  />
                  <span className="truncate">
                    {s.code} — {s.name}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {editing && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              <span>Account Active</span>
            </label>
          )}
        </form>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setModalOpen(false)}
            className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="teacher-form"
            disabled={saving}
            className="px-4 py-2 text-sm font-semibold text-white bg-[#243B64] rounded-lg disabled:opacity-50"
          >
            {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Teacher'}
          </button>
        </div>
      </Modal>

      {/* Reset Password Modal */}
      <Modal
        open={Boolean(resetTarget)}
        onClose={() => setResetTarget(null)}
        title={`Reset Password — ${resetTarget?.fullName || ''}`}
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleResetPassword} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              New Password (min. 8 characters)
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setResetTarget(null)}
              className="px-4 py-2 text-sm border border-slate-200 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-semibold text-white bg-[#243B64] rounded-lg"
            >
              Update Password
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Teacher Account"
        description={`Are you sure you want to permanently remove ${deleteTarget?.fullName}? This revokes portal access immediately.`}
        confirmLabel="Delete Teacher"
        danger
        loading={saving}
      />
    </PortalLayout>
  );
}
