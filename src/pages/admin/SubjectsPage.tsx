import React, { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { PortalLayout } from '../../layouts/PortalLayout';
import { DataTable, type ColumnDef } from '../../components/ui/DataTable';
import { ConfirmModal, Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/ToastProvider';
import { apiRequest } from '../../services/api';
import type { SubjectItem } from '../../types/exam';

export function SubjectsPage() {
  const { showToast } = useToast();
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SubjectItem | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [gradeLevels, setGradeLevels] = useState<number[]>([7, 8, 9]);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<SubjectItem | null>(null);

  const loadSubjects = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest<SubjectItem[]>('/api/subjects');
      setSubjects(data);
    } catch (err: any) {
      showToast('error', 'Failed to load subjects', err.message);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadSubjects();
  }, [loadSubjects]);

  const openCreate = () => {
    setEditing(null);
    setCode('');
    setName('');
    setDescription('');
    setGradeLevels([7, 8, 9]);
    setModalOpen(true);
  };

  const openEdit = (s: SubjectItem) => {
    setEditing(s);
    setCode(s.code);
    setName(s.name);
    setDescription(s.description || '');
    setGradeLevels(s.gradeLevels || [7, 8, 9]);
    setModalOpen(true);
  };

  const toggleGrade = (g: number) => {
    setGradeLevels((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g].sort()));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await apiRequest(`/api/subjects/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ code, name, description, gradeLevels }),
        });
        showToast('success', 'Subject updated');
      } else {
        await apiRequest('/api/subjects', {
          method: 'POST',
          body: JSON.stringify({ code, name, description, gradeLevels }),
        });
        showToast('success', 'Subject created');
      }
      setModalOpen(false);
      await loadSubjects();
    } catch (err: any) {
      showToast('error', 'Save failed', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await apiRequest(`/api/subjects/${deleteTarget.id}`, { method: 'DELETE' });
      showToast('success', 'Subject deleted');
      setDeleteTarget(null);
      await loadSubjects();
    } catch (err: any) {
      showToast('error', 'Delete failed', err.message);
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnDef<SubjectItem>[] = [
    {
      key: 'code',
      header: 'Code',
      render: (s) => <span className="font-mono text-xs font-semibold text-[#243B64]">{s.code}</span>,
    },
    {
      key: 'name',
      header: 'Subject Name',
      render: (s) => (
        <div>
          <p className="font-medium text-slate-900">{s.name}</p>
          {s.description && <p className="text-xs text-slate-500">{s.description}</p>}
        </div>
      ),
    },
    {
      key: 'grades',
      header: 'Grade Levels',
      render: (s) => <span className="text-xs text-slate-600">Grades {(s.gradeLevels || []).join(', ')}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (s) => (
        <div className="inline-flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => openEdit(s)}
            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setDeleteTarget(s)}
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
      pageTitle="Manajemen Mata Pelajaran"
      pageSubtitle="Configure examination subjects used across question banks and teacher permissions"
      headerAction={
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#243B64] rounded-lg whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>Add Subject</span>
        </button>
      }
    >
      <DataTable
        data={subjects}
        columns={columns}
        keyField={(s) => s.id}
        loading={loading}
        searchPlaceholder="Search subjects..."
        searchFilter={(s, q) =>
          s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)
        }
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Subject' : 'Add Subject'}
      >
        <form id="subject-form" onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Subject Code</label>
              <input
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="BIG"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg uppercase font-mono"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Subject Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Bahasa Inggris"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-2">Grade Levels</label>
            <div className="flex items-center gap-4">
              {[7, 8, 9].map((g) => (
                <label key={g} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={gradeLevels.includes(g)}
                    onChange={() => toggleGrade(g)}
                  />
                  <span>Grade {g}</span>
                </label>
              ))}
            </div>
          </div>
        </form>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setModalOpen(false)}
            className="px-4 py-2 text-sm border border-slate-200 rounded-lg"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="subject-form"
            disabled={saving}
            className="px-4 py-2 text-sm font-semibold text-white bg-[#243B64] rounded-lg"
          >
            Save Subject
          </button>
        </div>
      </Modal>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Subject"
        description={`Delete ${deleteTarget?.name}? This is only allowed if no active exams depend on this subject.`}
        confirmLabel="Delete"
        danger
        loading={saving}
      />
    </PortalLayout>
  );
}
