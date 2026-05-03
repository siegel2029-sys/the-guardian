import { useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Shield,
  LayoutDashboard,
  FileText,
  BarChart3,
  MessageSquare,
  Settings,
  BookOpen,
  LogOut,
  AlertTriangle,
  User,
  Bell,
  CheckCircle2,
  AlertOctagon,
  Reply,
  MessageCircleWarning,
  Pin,
  Users,
  PanelRightOpen,
  X,
  ChevronDown,
} from 'lucide-react';
import { PortalDropdown } from '../ui/PortalDropdown';
import RedFlagEmailNotificationModal from './RedFlagEmailNotificationModal';
import { useAuth } from '../../context/AuthContext';
import { usePatient } from '../../context/PatientContext';
import type { NavSection } from '../../types';
import SidebarNewPatient from './SidebarNewPatient';
import { getPatientDisplayName } from '../../utils/patientDisplayName';

const navItems: { id: NavSection; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'overview', label: 'סקירה קלינית', icon: LayoutDashboard },
  { id: 'clinical', label: 'דוחות קליניים', icon: FileText },
  { id: 'analytics', label: 'היסטוריה ואנליטיקה', icon: BarChart3 },
  { id: 'knowledge', label: 'בסיס ידע', icon: BookOpen },
  { id: 'messages', label: 'הודעות וצ׳אט', icon: MessageSquare },
  { id: 'settings', label: 'הגדרות', icon: Settings },
];

const statusColors: Record<string, string> = {
  active: '#059669',
  pending: '#d97706',
  paused: '#475569',
};

const statusLabels: Record<string, string> = {
  active: 'פעיל',
  pending: 'ממתין',
  paused: 'מושהה',
};

type Props = {
  /** When true the sidebar always renders expanded and adds a close button (mobile drawer mode). */
  mobileMode?: boolean;
  /** Called when the user taps the close button or a nav item in mobile mode. */
  onClose?: () => void;
};

export default function Sidebar({ mobileMode = false, onClose }: Props) {
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
  const [redFlagEmailOpen, setRedFlagEmailOpen] = useState(false);
  const [hoverOpen, setHoverOpen] = useState(false);
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [patientOpen, setPatientOpen] = useState(false);
  const patientTriggerRef = useRef<HTMLButtonElement>(null);

  // In mobile mode the panel is always fully expanded
  const expanded = mobileMode || hoverOpen || pinnedOpen;

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
      className={`flex flex-col shrink-0 border-l-2 border-slate-900/15 bg-white shadow-[inset_1px_0_0_rgba(15,23,42,0.06)] z-30 ${
        mobileMode
          ? 'w-full h-full overflow-y-auto'
          : `h-screen transition-[width] duration-200 ease-out ${expanded ? 'w-64' : 'w-14'}`
      }`}
      style={{ minWidth: mobileMode ? undefined : expanded ? undefined : '3.5rem' }}
      dir="rtl"
      onMouseEnter={mobileMode ? undefined : () => setHoverOpen(true)}
      onMouseLeave={mobileMode ? undefined : () => setHoverOpen(false)}
    >
      {/* Brand */}
      <div className="px-2 py-3 border-b-2 border-slate-200 bg-slate-50 shrink-0">
        <div className={`flex items-center gap-2 ${expanded ? 'justify-between' : 'flex-col gap-2'}`}>
          {!expanded && (
            <button
              type="button"
              onClick={() => setPinnedOpen(true)}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-900 bg-white border-2 border-slate-300 shadow-sm hover:bg-slate-100"
              title="פתיחת סרגל ניווט"
              aria-label="פתיחת סרגל ניווט"
            >
              <PanelRightOpen className="w-5 h-5" />
            </button>
          )}
          <div
            className={`flex items-center gap-2 min-w-0 ${expanded ? 'flex-1' : 'justify-center'}`}
          >
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shadow-md shrink-0 bg-slate-900 text-white"
            >
              <Shield className="w-5 h-5" />
            </div>
            {expanded && (
              <div className="flex-1 min-w-0">
                <h1 className="text-sm font-black text-slate-950 leading-tight truncate">PHYSIOSHIELD</h1>
                <p className="text-[11px] font-semibold text-slate-700">פורטל מטפלים</p>
              </div>
            )}
          </div>
          {expanded && (
            <div className="flex items-center gap-1 shrink-0">
              {pendingApprovals > 0 && (
                <div className="relative" title="אישורי AI ממתינים">
                  <CheckCircle2 className="w-5 h-5 text-emerald-700" strokeWidth={2.5} />
                  <span className="absolute -top-1 -left-1 min-w-[16px] h-4 px-0.5 rounded-full bg-emerald-700 text-white text-[9px] font-black flex items-center justify-center border border-white">
                    {pendingApprovals}
                  </span>
                </div>
              )}
              {totalRedFlags > 0 && (
                <div className="relative">
                  <Bell className="w-5 h-5 text-red-600" strokeWidth={2.5} />
                  <span className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-red-600 text-white text-[9px] font-black flex items-center justify-center border border-white">
                    {totalRedFlags}
                  </span>
                </div>
              )}
              {/* Mobile close button — shown instead of pin */}
              {mobileMode ? (
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 rounded-xl border-2 border-slate-300 bg-white text-slate-800 hover:border-red-300 hover:bg-red-50 hover:text-red-700 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                  title="סגור תפריט"
                  aria-label="סגור תפריט"
                >
                  <X className="w-4 h-4" strokeWidth={2.5} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setPinnedOpen((p) => !p)}
                  className={`p-2 rounded-xl border-2 transition-colors ${
                    pinnedOpen
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-300 bg-white text-slate-800 hover:border-slate-500'
                  }`}
                  title={pinnedOpen ? 'שחרר — הסרגל ייסגר כשתעזבו אותו' : 'הצמד — הסרגל יישאר פתוח'}
                  aria-pressed={pinnedOpen}
                >
                  <Pin className={`w-4 h-4 ${pinnedOpen ? 'fill-current' : ''}`} strokeWidth={2.5} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <SidebarNewPatient compact={!expanded} />

      {/* מטופלים — portal dropdown switcher */}
      {expanded ? (
        <div className="px-3 py-2 border-b-2 border-slate-100 shrink-0">
          <p className="text-[10px] font-black text-slate-950 uppercase tracking-wider mb-1.5 px-1">
            מטופלים
          </p>

          {/* Trigger button — shows active patient */}
          <button
            ref={patientTriggerRef}
            type="button"
            onClick={() => setPatientOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-2 px-2 py-2 rounded-xl border-2 transition-colors min-h-[44px]"
            style={patientOpen
              ? { borderColor: '#0d9488', background: '#f0fffe', color: '#0d9488' }
              : { borderColor: '#e2e8f0', background: 'white', color: '#1e293b' }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-full bg-slate-900 text-white text-xs font-black flex items-center justify-center shrink-0">
                {selectedPatient ? getPatientDisplayName(selectedPatient).charAt(0) : <User className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0 text-start">
                <p className="text-sm font-black text-slate-950 truncate">
                  {selectedPatient ? getPatientDisplayName(selectedPatient) : 'בחר מטופל'}
                </p>
                {selectedPatient && (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: statusColors[selectedPatient.status] }}
                    />
                    <span className="text-[10px] font-bold text-slate-600">
                      {statusLabels[selectedPatient.status]}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {patients.length > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  {patients.length}
                </span>
              )}
              <ChevronDown
                className={`w-4 h-4 text-slate-500 transition-transform ${patientOpen ? 'rotate-180' : ''}`}
                strokeWidth={2.5}
              />
            </div>
          </button>

          {/* Portal: patient list */}
          <PortalDropdown
            open={patientOpen}
            onClose={() => setPatientOpen(false)}
            triggerRef={patientTriggerRef as RefObject<HTMLElement | null>}
            panelMaxHeight={320}
          >
            <div dir="rtl">
              {patients.length === 0 ? (
                <p className="text-xs text-slate-500 px-3 py-4 text-center">אין מטופלים ברשימה</p>
              ) : (
                patients.map((patient) => {
                  const isSelected = patient.id === selectedPatient?.id;
                  const label = getPatientDisplayName(patient);
                  const unreadCount = getPatientMessages(patient.id).filter(
                    (m) => !m.isRead && m.fromPatient
                  ).length;
                  return (
                    <button
                      key={patient.id}
                      type="button"
                      onClick={() => {
                        selectPatient(patient.id);
                        setActiveSection('overview');
                        setPatientOpen(false);
                        if (mobileMode) onClose?.();
                      }}
                      className={`w-full flex items-center gap-2 px-3 py-2.5 text-right transition-colors min-h-[44px] ${
                        isSelected ? 'bg-slate-100' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="w-8 h-8 rounded-full bg-slate-900 text-white text-xs font-black flex items-center justify-center shrink-0">
                        {label.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0 text-start">
                        <div className="flex items-center gap-1">
                          <p className="text-sm font-black text-slate-950 truncate">{label}</p>
                          {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" strokeWidth={2.5} />}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ background: statusColors[patient.status] }}
                          />
                          <span className="text-[10px] font-bold text-slate-600">
                            {statusLabels[patient.status]}
                          </span>
                        </div>
                      </div>
                      {patient.hasRedFlag && (
                        <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" strokeWidth={2.5} />
                      )}
                      {awaitingForPatient(patient.id) > 0 && (
                        <span className="min-w-[18px] h-4 px-0.5 rounded-full bg-amber-500 text-white text-[8px] font-black flex items-center justify-center border border-white shrink-0">
                          {awaitingForPatient(patient.id)}
                        </span>
                      )}
                      {unreadCount > 0 && (
                        <span className="min-w-[18px] h-4 px-0.5 rounded-full bg-slate-900 text-white text-[8px] font-black flex items-center justify-center shrink-0">
                          {unreadCount > 9 ? '!' : unreadCount}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </PortalDropdown>
        </div>
      ) : (
        <div className="px-2 py-2 border-b-2 border-slate-100 shrink-0 flex justify-center">
          <button
            type="button"
            onClick={() => setPinnedOpen(true)}
            title={`מטופלים (${patients.length})`}
            className="relative w-10 h-10 rounded-xl flex items-center justify-center border-2 border-slate-300 bg-white text-slate-900 hover:bg-slate-100"
          >
            <Users className="w-5 h-5" strokeWidth={2.5} />
            {patients.length > 0 && (
              <span className="absolute -top-1 -left-1 min-w-[18px] h-[18px] px-0.5 rounded-full bg-slate-900 text-white text-[9px] font-black flex items-center justify-center">
                {patients.length > 99 ? '99+' : patients.length}
              </span>
            )}
          </button>
        </div>
      )}

      {safetyAlerts.length > 0 && expanded && (
        <div className="px-3 py-2 border-b-2 border-red-300 shrink-0 max-h-40 overflow-y-auto bg-red-50">
          <p className="text-[10px] font-black text-red-950 uppercase tracking-wider mb-2 px-1 flex items-center gap-1.5">
            <AlertOctagon className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} />
            התראות בטיחות
          </p>
          <ul className="space-y-2">
            {[...safetyAlerts]
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .map((alert) => {
                const pRow = patients.find((x) => x.id === alert.patientId);
                const pname = pRow ? getPatientDisplayName(pRow) : alert.patientId;
                return (
                  <li
                    key={alert.id}
                    className="rounded-xl border-2 border-red-700 bg-red-50 shadow-sm overflow-hidden"
                  >
                    <button
                      type="button"
                      className="w-full text-right px-2.5 py-2 hover:bg-red-100/90 transition-colors"
                      onClick={() => {
                        selectPatient(alert.patientId);
                        setActiveSection('overview');
                      }}
                    >
                      <p className="text-xs font-black text-red-950 leading-tight">{pname}</p>
                      <p className="text-[11px] text-red-900 font-bold mt-0.5 leading-snug">
                        {alert.reasonHebrew}
                      </p>
                    </button>
                    <div className="flex justify-end px-2 pb-1.5">
                      <button
                        type="button"
                        onClick={() => dismissSafetyAlert(alert.id)}
                        className="text-[10px] font-bold text-red-800 hover:underline"
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

      {safetyAlerts.length > 0 && !expanded && (
        <div className="px-2 py-2 border-b-2 border-red-200 shrink-0 flex justify-center bg-red-50/80">
          <button
            type="button"
            onClick={() => setPinnedOpen(true)}
            title={`התראות בטיחות (${safetyAlerts.length})`}
            className="relative w-10 h-10 rounded-xl flex items-center justify-center border-2 border-red-700 bg-white text-red-800 hover:bg-red-100"
          >
            <AlertOctagon className="w-5 h-5" strokeWidth={2.5} />
            <span className="absolute -top-1 -left-1 min-w-[18px] h-[18px] px-0.5 rounded-full bg-red-700 text-white text-[9px] font-black flex items-center justify-center">
              {safetyAlerts.length}
            </span>
          </button>
        </div>
      )}

      {selectedPatient && expanded && (
        <div className="px-3 pb-2 shrink-0">
          <button
            type="button"
            onClick={() => setRedFlagEmailOpen(true)}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-right border-2 border-red-700 bg-red-50 text-red-950 font-black text-xs hover:bg-red-100"
          >
            <MessageCircleWarning className="w-4 h-4 shrink-0" strokeWidth={2.5} />
            <span className="flex-1">דגל אדום — דוא״ל</span>
          </button>
        </div>
      )}

      {selectedPatient && !expanded && (
        <div className="px-2 py-2 shrink-0 flex justify-center">
          <button
            type="button"
            onClick={() => {
              setPinnedOpen(true);
              setRedFlagEmailOpen(true);
            }}
            title="דגל אדום — דוא״ל"
            className="w-10 h-10 rounded-xl flex items-center justify-center border-2 border-red-700 bg-red-50 text-red-900 hover:bg-red-100"
          >
            <MessageCircleWarning className="w-5 h-5" strokeWidth={2.5} />
          </button>
        </div>
      )}

      {/* ניווט — ניגודיות גבוהה */}
      <nav className="flex-1 px-2 py-3 space-y-1 overflow-y-auto min-h-0">
        {expanded && (
          <p className="text-[10px] font-black text-slate-950 uppercase tracking-wider mb-2 px-1">
            ניווט
          </p>
        )}
        {navItems.map(({ id, label, icon: Icon }) => {
          const isActive = activeSection === id;
          const showBadge = id === 'messages' && totalUnreadMessages > 0;

          if (!expanded) {
            return (
              <button
                key={id}
                type="button"
                title={label}
                onClick={() => {
                  setActiveSection(id);
                  setPinnedOpen(true);
                }}
                className={`relative w-full flex items-center justify-center py-3 rounded-xl border-2 transition-colors ${
                  isActive
                    ? 'bg-slate-900 text-white border-slate-900 shadow-md'
                    : 'border-transparent text-slate-900 hover:bg-slate-200 hover:border-slate-400'
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {showBadge && (
                  <span className="absolute -top-0.5 -left-0.5 min-w-[18px] h-[18px] px-0.5 rounded-full bg-emerald-600 text-white text-[9px] font-black flex items-center justify-center border-2 border-white">
                    {totalUnreadMessages > 9 ? '9+' : totalUnreadMessages}
                  </span>
                )}
              </button>
            );
          }

          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                setActiveSection(id);
                if (mobileMode) onClose?.();
              }}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-right border-2 transition-colors min-h-[44px] ${
                isActive
                  ? 'bg-slate-900 text-white border-slate-900 shadow-md'
                  : 'border-transparent text-slate-950 bg-white hover:bg-slate-100 hover:border-slate-400'
              }`}
            >
              <Icon
                className={`w-5 h-5 shrink-0 ${isActive ? 'text-white' : 'text-slate-900'}`}
              
              />
              <span className={`text-[15px] font-bold flex-1 leading-snug ${isActive ? 'text-white' : 'text-slate-950'}`}>
                {label}
              </span>
              {showBadge && (
                <span className="min-w-[22px] h-[22px] px-1 rounded-full bg-emerald-600 text-white text-[11px] font-black flex items-center justify-center border-2 border-white">
                  {totalUnreadMessages}
                </span>
              )}
              {isActive && (
                <span className="w-1.5 h-6 rounded-full bg-white shrink-0" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Therapist footer */}
      <div className="px-2 py-3 border-t-2 border-slate-200 bg-slate-50 shrink-0">
        {expanded ? (
          <>
            <div className="flex items-center gap-2.5 p-2.5 rounded-xl border-2 border-slate-300 bg-white">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-black shrink-0 bg-slate-900">
                {therapist?.avatarInitials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-slate-950 truncate">{therapist?.name}</p>
                <p className="text-xs font-bold text-slate-700 truncate">{therapist?.title}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  void logout().then(() => navigate('/login', { replace: true }));
                }}
                title="התנתק"
                className="p-2 rounded-lg text-slate-800 hover:text-red-700 hover:bg-red-50 border-2 border-transparent hover:border-red-200 transition-colors"
              >
                <LogOut className="w-4 h-4" strokeWidth={2.5} />
              </button>
            </div>
            <button
              type="button"
              onClick={() => setActiveSection('settings')}
              className="w-full mt-2 flex items-center justify-center gap-1.5 py-2 text-xs font-bold text-slate-800 hover:text-slate-950 transition-colors rounded-xl hover:bg-slate-200 border-2 border-transparent hover:border-slate-400"
            >
              <User className="w-4 h-4" strokeWidth={2.5} />
              <span>ניהול פרופיל</span>
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-black bg-slate-900"
              title={therapist?.name}
            >
              {therapist?.avatarInitials}
            </div>
            <button
              type="button"
              onClick={() => {
                void logout().then(() => navigate('/login', { replace: true }));
              }}
              title="התנתק"
              className="p-2 rounded-xl text-slate-900 hover:bg-red-50 hover:text-red-700 border-2 border-slate-300"
            >
              <LogOut className="w-4 h-4" strokeWidth={2.5} />
            </button>
          </div>
        )}
      </div>

      {selectedPatient && (
        <RedFlagEmailNotificationModal
          open={redFlagEmailOpen}
          onClose={() => setRedFlagEmailOpen(false)}
          patientId={selectedPatient.id}
          patientName={getPatientDisplayName(selectedPatient)}
          therapistId={selectedPatient.therapistId}
        />
      )}
    </aside>
  );
}
