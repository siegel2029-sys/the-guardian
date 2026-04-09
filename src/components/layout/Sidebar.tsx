import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Shield,
  LayoutDashboard,
  FileText,
  BarChart3,
  MessageSquare,
  Settings,
  LogOut,
  ChevronDown,
  AlertTriangle,
  User,
  Bell,
  CheckCircle2,
  AlertOctagon,
  Reply,
  MessageCircleWarning,
} from 'lucide-react';
import RedFlagWhatsAppModal from './RedFlagWhatsAppModal';
import { useAuth } from '../../context/AuthContext';
import { usePatient } from '../../context/PatientContext';
import type { NavSection } from '../../types';
import SidebarNewPatient from './SidebarNewPatient';

const navItems: { id: NavSection; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'overview', label: 'סקירה קלינית', icon: LayoutDashboard },
  { id: 'clinical', label: 'דוחות קליניים', icon: FileText },
  { id: 'analytics', label: 'היסטוריה ואנליטיקה', icon: BarChart3 },
  { id: 'messages', label: 'הודעות וצ׳אט', icon: MessageSquare },
  { id: 'settings', label: 'הגדרות', icon: Settings },
];

const statusColors: Record<string, string> = {
  active: '#10b981',
  pending: '#f59e0b',
  paused: '#94a3b8',
};

const statusLabels: Record<string, string> = {
  active: 'פעיל',
  pending: 'ממתין',
  paused: 'מושהה',
};

export default function Sidebar() {
  const navigate = useNavigate();
  const { therapist, logout } = useAuth();
  const {
    patients,
    selectedPatient,
    selectPatient,
    activeSection,
    setActiveSection,
    getPatientMessages,
    getTotalAwaitingTherapistCount,
    aiSuggestions,
    safetyAlerts,
    dismissSafetyAlert,
  } = usePatient();
  const [patientSwitcherOpen, setPatientSwitcherOpen] = useState(false);
  const [redFlagWaOpen, setRedFlagWaOpen] = useState(false);

  const totalUnreadMessages = patients.reduce((sum, p) => {
    const unread = getPatientMessages(p.id).filter(
      (m) => !m.isRead && (m.fromPatient || m.aiClinicalAlert)
    ).length;
    return sum + unread;
  }, 0);

  const totalRedFlags = patients.filter((p) => p.hasRedFlag).length;
  const pendingApprovals = getTotalAwaitingTherapistCount();

  const awaitingForPatient = (patientId: string) =>
    aiSuggestions.filter((s) => s.patientId === patientId && s.status === 'awaiting_therapist').length;

  return (
    <aside
      className="flex flex-col h-screen w-64 shrink-0 border-l border-teal-100"
      style={{ background: 'linear-gradient(180deg, #ffffff 0%, #f8fffe 100%)' }}
      dir="rtl"
    >
      {/* Brand Header */}
      <div className="px-4 py-5 border-b border-teal-100">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shadow-sm"
            style={{ background: 'linear-gradient(135deg, #0d9488, #10b981)' }}
          >
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-800 leading-tight">The Guardian</h1>
            <p className="text-xs text-slate-500">פורטל מטפלים</p>
          </div>
          {/* Notification badges */}
          <div className="mr-auto flex items-center gap-1.5">
            {pendingApprovals > 0 && (
              <div className="relative" title="אישורי AI ממתינים">
                <CheckCircle2 className="w-5 h-5 text-teal-600" />
                <span className="absolute -top-1 -left-1 min-w-[16px] h-4 px-0.5 rounded-full bg-teal-600 text-white text-[9px] font-bold flex items-center justify-center">
                  {pendingApprovals}
                </span>
              </div>
            )}
            {totalRedFlags > 0 && (
              <div className="relative">
                <Bell className="w-5 h-5 text-red-500" />
                <span className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {totalRedFlags}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <SidebarNewPatient />

      {/* Patient Switcher */}
      <div className="px-3 py-3 border-b border-teal-50">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2 px-1">
          מטופל נבחר
        </p>
        <div className="relative">
          <button
            onClick={() => setPatientSwitcherOpen((v) => !v)}
            className="w-full flex items-center gap-2.5 p-2.5 rounded-xl transition-all duration-200 text-right border border-teal-100"
            style={{
              background: patientSwitcherOpen ? '#e0f7f9' : '#f0fffe',
            }}
          >
            {/* Avatar */}
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 shadow-sm"
              style={{ background: 'linear-gradient(135deg, #0d9488, #10b981)' }}
            >
              {selectedPatient?.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">
                {selectedPatient?.name}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    background: statusColors[selectedPatient?.status ?? 'active'],
                  }}
                />
                <span className="text-xs text-slate-500">
                  {statusLabels[selectedPatient?.status ?? 'active']}
                </span>
                {selectedPatient?.hasRedFlag && (
                  <span
                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold border"
                    style={{ background: '#fef2f2', color: '#b91c1c', borderColor: '#fecaca' }}
                  >
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    התראה
                  </span>
                )}
              </div>
            </div>
            <ChevronDown
              className="w-4 h-4 text-slate-400 transition-transform duration-200"
              style={{ transform: patientSwitcherOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
            />
          </button>

          {/* Dropdown */}
          {patientSwitcherOpen && (
            <div
              className="absolute top-full right-0 left-0 mt-1 rounded-xl border border-teal-100 shadow-xl overflow-hidden z-50"
              style={{ background: 'white' }}
            >
              {patients.map((patient) => {
                const unreadCount = getPatientMessages(patient.id).filter(
                  (m) => !m.isRead && m.fromPatient
                ).length;
                const isSelected = patient.id === selectedPatient?.id;

                return (
                  <div
                    key={patient.id}
                    className="w-full flex items-stretch border-b border-teal-50 last:border-0 transition-colors duration-150"
                    style={{
                      background: isSelected ? '#f0fffe' : 'transparent',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        selectPatient(patient.id);
                        setPatientSwitcherOpen(false);
                      }}
                      className="flex-1 flex items-center gap-2.5 px-3 py-2.5 text-right min-w-0"
                    >
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                        style={{
                          background: isSelected
                            ? 'linear-gradient(135deg, #0d9488, #10b981)'
                            : 'linear-gradient(135deg, #94a3b8, #cbd5e1)',
                        }}
                      >
                        {patient.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium text-slate-800 truncate">{patient.name}</p>
                          {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-teal-500" />}
                        </div>
                        <p className="text-xs text-slate-500 truncate">{patient.diagnosis}</p>
                      </div>
                    </button>
                    <div className="flex flex-col items-center justify-center gap-1 px-2 py-1 shrink-0 border-s border-teal-50/80">
                      {patient.hasRedFlag && (
                        <span
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-bold border"
                          style={{ background: '#fef2f2', color: '#b91c1c', borderColor: '#fecaca' }}
                          title="דגל אדום — נדרשת בדיקה"
                        >
                          <AlertTriangle className="w-3 h-3 shrink-0" />
                          התראה
                        </span>
                      )}
                      {awaitingForPatient(patient.id) > 0 && (
                        <span
                          className="min-w-[20px] h-5 px-1 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center"
                          title="אישור AI ממתין"
                        >
                          {awaitingForPatient(patient.id)}
                        </span>
                      )}
                      {unreadCount > 0 && (
                        <span className="w-5 h-5 rounded-full bg-teal-500 text-white text-[10px] font-bold flex items-center justify-center">
                          {unreadCount}
                        </span>
                      )}
                      {unreadCount > 0 && (
                        <button
                          type="button"
                          title="מענה — פתיחת צ׳אט"
                          onClick={() => {
                            selectPatient(patient.id, { openSection: 'messages' });
                            setPatientSwitcherOpen(false);
                          }}
                          className="p-1.5 rounded-lg text-teal-700 hover:bg-teal-100 border border-teal-200/80"
                        >
                          <Reply className="w-4 h-4" />
                        </button>
                      )}
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: statusColors[patient.status] }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {safetyAlerts.length > 0 && (
        <div className="px-3 py-2 border-b border-red-200 shrink-0 max-h-40 overflow-y-auto bg-red-50/40">
          <p className="text-[10px] font-black text-red-900 uppercase tracking-wider mb-2 px-1 flex items-center gap-1.5">
            <AlertOctagon className="w-3.5 h-3.5 shrink-0" />
            התראות בטיחות
          </p>
          <ul className="space-y-2">
            {[...safetyAlerts]
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .map((alert) => {
                const pname =
                  patients.find((x) => x.id === alert.patientId)?.name ?? alert.patientId;
                return (
                  <li
                    key={alert.id}
                    className="rounded-xl border-2 border-red-500 bg-red-50 shadow-sm overflow-hidden"
                  >
                    <button
                      type="button"
                      className="w-full text-right px-2.5 py-2 hover:bg-red-100/80 transition-colors"
                      onClick={() => {
                        selectPatient(alert.patientId);
                        setPatientSwitcherOpen(false);
                      }}
                    >
                      <p className="text-xs font-black text-red-950 leading-tight">{pname}</p>
                      <p className="text-[11px] text-red-900 font-semibold mt-0.5 leading-snug">
                        {alert.reasonHebrew}
                      </p>
                    </button>
                    <div className="flex justify-end px-2 pb-1.5">
                      <button
                        type="button"
                        onClick={() => dismissSafetyAlert(alert.id)}
                        className="text-[10px] font-medium text-red-700 hover:underline"
                      >
                        הסר מהרשימה
                      </button>
                    </div>
                  </li>
                );
              })}
          </ul>
        </div>
      )}

      {selectedPatient && (
        <div className="px-3 pb-2 shrink-0">
          <button
            type="button"
            onClick={() => setRedFlagWaOpen(true)}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-right border-2 transition-colors"
            style={{
              borderColor: '#fecaca',
              background: 'linear-gradient(135deg, #fef2f2, #fff)',
              color: '#991b1b',
            }}
          >
            <MessageCircleWarning className="w-4 h-4 shrink-0" />
            <span className="text-xs font-bold flex-1">דגל אדום — דוא״ל</span>
          </button>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto min-h-0">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2 px-1">
          ניווט
        </p>
        {navItems.map(({ id, label, icon: Icon }) => {
          const isActive = activeSection === id;
          const showBadge =
            id === 'messages' && totalUnreadMessages > 0;

          return (
            <button
              key={id}
              onClick={() => setActiveSection(id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-right transition-all duration-150 group"
              style={{
                background: isActive
                  ? 'linear-gradient(135deg, #ccfbf1, #d1fae5)'
                  : 'transparent',
                color: isActive ? '#0d9488' : '#64748b',
              }}
              onMouseEnter={(e) => {
                if (!isActive)
                  (e.currentTarget as HTMLButtonElement).style.background = '#f0fffe';
              }}
              onMouseLeave={(e) => {
                if (!isActive)
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              }}
            >
              <Icon
                className="w-4 h-4 shrink-0"
              />
              <span className="text-sm font-medium flex-1">{label}</span>
              {showBadge && (
                <span className="w-5 h-5 rounded-full bg-teal-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {totalUnreadMessages}
                </span>
              )}
              {isActive && (
                <span
                  className="w-1 h-5 rounded-full"
                  style={{ background: '#0d9488' }}
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Therapist Profile Footer */}
      <div className="px-3 py-3 border-t border-teal-100">
        <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-teal-50">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
            style={{ background: 'linear-gradient(135deg, #0d9488, #059669)' }}
          >
            {therapist?.avatarInitials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800 truncate">{therapist?.name}</p>
            <p className="text-xs text-teal-600 truncate">{therapist?.title}</p>
          </div>
          <button
            onClick={() => {
              logout();
              navigate('/login', { replace: true });
            }}
            title="התנתק"
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
        {/* Profile management hint */}
        <button
          type="button"
          onClick={() => setActiveSection('settings')}
          className="w-full mt-2 flex items-center justify-center gap-1.5 py-1.5 text-xs text-slate-400 hover:text-teal-600 transition-colors rounded-lg hover:bg-teal-50"
        >
          <User className="w-3.5 h-3.5" />
          <span>ניהול פרופיל</span>
        </button>
      </div>

      {selectedPatient && (
        <RedFlagWhatsAppModal
          open={redFlagWaOpen}
          onClose={() => setRedFlagWaOpen(false)}
          patientId={selectedPatient.id}
          patientName={selectedPatient.name}
          therapistId={selectedPatient.therapistId}
        />
      )}
    </aside>
  );
}
