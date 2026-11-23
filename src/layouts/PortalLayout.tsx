import React, { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  Award,
  BookOpen,
  CalendarClock,
  CreditCard,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Menu,
  Settings,
  ShieldAlert,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../features/auth/AuthContext';

interface NavItem {
  label: string;
  to: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

export function PortalLayout({
  children,
  pageTitle,
  pageSubtitle,
  headerAction,
}: {
  children: React.ReactNode;
  pageTitle: string;
  pageSubtitle?: string;
  headerAction?: React.ReactNode;
}) {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const isAdmin = user?.role === 'admin';
  const basePath = isAdmin ? '/admin' : '/teacher';

  const navItems: NavItem[] = [
    { label: 'Dashboard', to: `${basePath}/dashboard`, icon: <LayoutDashboard className="w-4 h-4" /> },
    { label: 'Manajemen Guru', to: '/admin/teachers', icon: <Users className="w-4 h-4" />, adminOnly: true },
    { label: 'Manajemen Siswa', to: '/admin/students', icon: <GraduationCap className="w-4 h-4" />, adminOnly: true },
    { label: 'Mata Pelajaran', to: '/admin/subjects', icon: <BookOpen className="w-4 h-4" />, adminOnly: true },
    { label: 'Bank Soal', to: `${basePath}/question-bank`, icon: <FileText className="w-4 h-4" /> },
    { label: 'Impor Soal Word', to: `${basePath}/import-word`, icon: <Upload className="w-4 h-4" /> },
    { label: 'Manajemen Ujian', to: `${basePath}/exams`, icon: <BookOpen className="w-4 h-4" /> },
    { label: 'Jadwal & Token', to: `${basePath}/schedules`, icon: <CalendarClock className="w-4 h-4" /> },
    { label: 'Kartu Peserta', to: '/admin/admission-cards', icon: <CreditCard className="w-4 h-4" />, adminOnly: true },
    { label: 'Monitoring Live', to: `${basePath}/monitoring`, icon: <Activity className="w-4 h-4" /> },
    { label: 'Hasil & Nilai', to: `${basePath}/results`, icon: <Award className="w-4 h-4" /> },
    { label: 'Impor Nilai & Pelanggaran', to: `${basePath}/imports`, icon: <FileSpreadsheet className="w-4 h-4" /> },
    { label: 'Data Pelanggaran', to: `${basePath}/violations`, icon: <ShieldAlert className="w-4 h-4" /> },
    { label: 'Pengaturan Sistem', to: '/admin/settings', icon: <Settings className="w-4 h-4" />, adminOnly: true },
    { label: 'Ganti Password', to: `${basePath}/change-password`, icon: <LockKeyhole className="w-4 h-4" /> },
  ];

  const visibleItems = navItems.filter((item) => !item.adminOnly || isAdmin);

  const handleLogout = async () => {
    await logout();
    navigate(isAdmin ? '/admin/login' : '/teacher/login');
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#243B64] text-white">
      <div className="px-5 py-4 border-b border-white/10 flex items-center gap-3">
        <img
          src="/assets/aistudio/logoku_6b323412.png"
          alt="SMP Kartini 1 Batam Logo"
          className="w-10 h-10 object-contain rounded-full bg-white p-0.5 shrink-0"
          referrerPolicy="no-referrer"
        />
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wider text-[#D7B56D] truncate">
            KARTINI EXAM PORTAL
          </p>
          <p className="text-xs text-slate-200 truncate">SMP Kartini 1 Batam</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {visibleItems.map((item) => {
          const active = location.pathname === item.to;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-[#376FA6] text-white'
                  : 'text-slate-200 hover:bg-white/10 hover:text-white'
              }`}
            >
              <span className="shrink-0 opacity-90">{item.icon}</span>
              <span className="truncate">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="p-3 border-t border-white/10">
        <div className="px-3 py-2 mb-2 rounded-lg bg-white/5">
          <p className="text-xs font-semibold text-white truncate">{user?.fullName}</p>
          <p className="text-xs text-slate-300 truncate">
            {isAdmin ? 'Administrator' : `Guru · ${user?.subjectNames.join(', ') || 'No Subject'}`}
          </p>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium text-slate-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-[#FAFBFD] text-slate-900">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-[260px] shrink-0 border-r border-slate-200 no-print">
        <div className="sticky top-0 h-screen">{sidebarContent}</div>
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex no-print">
          <div
            className="fixed inset-0 bg-slate-900/50"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative w-72 max-w-[85vw] h-full z-10 shadow-xl">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation menu"
              className="absolute top-3 right-3 p-1.5 text-white/80 hover:text-white rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
              aria-label="Open navigation menu"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>{isAdmin ? 'Admin Portal' : 'Teacher Portal'}</span>
                <span aria-hidden="true">/</span>
                <span className="text-[#376FA6] font-medium truncate">{pageTitle}</span>
              </div>
              <h1 className="text-lg sm:text-xl font-semibold text-[#243B64] truncate">
                {pageTitle}
              </h1>
              {pageSubtitle && (
                <p className="text-xs text-slate-500 truncate hidden sm:block">{pageSubtitle}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {headerAction}
            <NavLink
              to="/student/access"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#243B64] bg-[#EAF3FA] hover:bg-[#dcebf7] rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Student Access</span>
            </NavLink>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
