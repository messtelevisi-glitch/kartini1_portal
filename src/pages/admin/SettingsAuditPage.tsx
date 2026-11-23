import React, { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { PortalLayout } from '../../layouts/PortalLayout';
import { DataTable, type ColumnDef } from '../../components/ui/DataTable';
import { useToast } from '../../components/ui/ToastProvider';
import { apiRequest } from '../../services/api';
import type { SystemSettingsConfig } from '../../types/exam';

interface AuditLogRow {
  id: number;
  actorName: string;
  actorRole: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  ipAddress: string | null;
  createdAt: string;
}

export function SettingsAuditPage() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<'settings' | 'audit'>('settings');
  const [settings, setSettings] = useState<SystemSettingsConfig | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiRequest<SystemSettingsConfig>('/api/settings')
      .then(setSettings)
      .catch((err: any) => showToast('error', 'Failed to load settings', err.message));
    apiRequest<AuditLogRow[]>('/api/audit-logs')
      .then(setAuditLogs)
      .catch(() => {});
  }, [showToast]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    try {
      const updated = await apiRequest<SystemSettingsConfig>('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      });
      setSettings(updated);
      showToast('success', 'System settings updated');
    } catch (err: any) {
      showToast('error', 'Failed to save settings', err.message);
    } finally {
      setSaving(false);
    }
  };

  const auditColumns: ColumnDef<AuditLogRow>[] = [
    {
      key: 'time',
      header: 'Timestamp',
      render: (l) => (
        <span className="font-mono text-xs text-slate-600 tabular-nums">
          {new Date(l.createdAt).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'actor',
      header: 'Actor',
      render: (l) => (
        <div>
          <p className="text-xs font-semibold text-[#243B64]">{l.actorName}</p>
          <p className="text-[11px] text-slate-500 uppercase">{l.actorRole}</p>
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      render: (l) => <span className="font-mono text-xs font-medium text-[#376FA6]">{l.action}</span>,
    },
    {
      key: 'resource',
      header: 'Resource',
      render: (l) => (
        <span className="text-xs text-slate-700">
          {l.resourceType} {l.resourceId ? `#${l.resourceId}` : ''}
        </span>
      ),
    },
  ];

  return (
    <PortalLayout
      pageTitle="Pengaturan Sistem & Audit Logs"
      pageSubtitle="Configure institutional identity, anti-cheating thresholds, upload limits, and review security audit logs"
    >
      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit mb-6">
        <button
          type="button"
          onClick={() => setTab('settings')}
          className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors ${
            tab === 'settings' ? 'bg-white text-[#243B64] shadow-sm' : 'text-slate-600'
          }`}
        >
          System Settings
        </button>
        <button
          type="button"
          onClick={() => setTab('audit')}
          className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors ${
            tab === 'audit' ? 'bg-white text-[#243B64] shadow-sm' : 'text-slate-600'
          }`}
        >
          Security Audit Logs
        </button>
      </div>

      {tab === 'settings' ? (
        !settings ? (
          <div className="h-64 bg-white border border-slate-200 rounded-xl animate-pulse" />
        ) : (
          <form
            onSubmit={handleSave}
            className="bg-white border border-slate-200 rounded-xl p-6 space-y-5 max-w-4xl"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">School Name</label>
                <input
                  type="text"
                  value={settings.schoolName}
                  onChange={(e) => setSettings({ ...settings, schoolName: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Portal Title</label>
                <input
                  type="text"
                  value={settings.portalTitle}
                  onChange={(e) => setSettings({ ...settings, portalTitle: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Principal Name</label>
                <input
                  type="text"
                  value={settings.principalName}
                  onChange={(e) => setSettings({ ...settings, principalName: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Academic Year & Semester</label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={settings.academicYear}
                    onChange={(e) => setSettings({ ...settings, academicYear: e.target.value })}
                    className="px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                  <select
                    value={settings.semester}
                    onChange={(e) => setSettings({ ...settings, semester: e.target.value })}
                    className="px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  >
                    <option value="Ganjil">Ganjil</option>
                    <option value="Genap">Genap</option>
                  </select>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">School Address</label>
              <input
                type="text"
                value={settings.schoolAddress}
                onChange={(e) => setSettings({ ...settings, schoolAddress: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Default Duration (min)</label>
                <input
                  type="number"
                  value={settings.defaultDurationMinutes}
                  onChange={(e) =>
                    setSettings({ ...settings, defaultDurationMinutes: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Max Upload (MB)</label>
                <input
                  type="number"
                  max={10}
                  min={1}
                  value={settings.maxUploadMb}
                  onChange={(e) => setSettings({ ...settings, maxUploadMb: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Warnings Before Disqualification
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={settings.maxViolationsBeforeDisqualification}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      maxViolationsBeforeDisqualification: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Token Expiry (min)
                </label>
                <input
                  type="number"
                  value={settings.tokenExpiryMinutes}
                  onChange={(e) =>
                    setSettings({ ...settings, tokenExpiryMinutes: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-6 pt-2 border-t border-slate-100">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.maintenanceMode}
                  onChange={(e) => setSettings({ ...settings, maintenanceMode: e.target.checked })}
                />
                <span>Enable Maintenance Mode (Blocks Student Exam Access)</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.enableRealtimeNotifications}
                  onChange={(e) =>
                    setSettings({ ...settings, enableRealtimeNotifications: e.target.checked })
                  }
                />
                <span>Enable Realtime Proctor Notifications</span>
              </label>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#243B64] hover:bg-[#1a2c4b] rounded-lg"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? 'Saving...' : 'Save Settings'}</span>
              </button>
            </div>
          </form>
        )
      ) : (
        <DataTable
          data={auditLogs}
          columns={auditColumns}
          keyField={(l) => l.id}
          searchPlaceholder="Search audit action or actor..."
          searchFilter={(l, q) =>
            l.action.toLowerCase().includes(q) || l.actorName.toLowerCase().includes(q)
          }
        />
      )}
    </PortalLayout>
  );
}
