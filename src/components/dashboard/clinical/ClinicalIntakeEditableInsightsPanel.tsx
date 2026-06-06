import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  FlaskConical,
  Lightbulb,
  Stethoscope,
  FileText,
  ShieldAlert,
  Save,
  Loader2,
} from 'lucide-react';
import type { Patient } from '../../../types';
import {
  loadClinicalIntakeEditableFields,
  buildPatientPatchFromEditableIntakeFields,
  type ClinicalIntakeEditableFields,
} from '../../../utils/clinicalIntakeEditableFields';

type Props = {
  patient: Patient;
  compact?: boolean;
  onSave: (patch: ReturnType<typeof buildPatientPatchFromEditableIntakeFields>) => void | Promise<void>;
  showSaveButton?: boolean;
  className?: string;
};

function EditableListSection({
  title,
  icon: Icon,
  items,
  onChange,
  placeholder,
  sectionClass,
  titleClass,
  inputClass,
  multiline = false,
  addLabel,
}: {
  title: string;
  icon: typeof Stethoscope;
  items: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  sectionClass: string;
  titleClass: string;
  inputClass: string;
  multiline?: boolean;
  addLabel: string;
}) {
  const list = items.length ? items : [''];

  const updateItem = (index: number, value: string) => {
    const next = [...list];
    next[index] = value;
    onChange(next.filter((s, idx) => s.trim() || idx < next.length - 1 || next.length === 1));
  };

  return (
    <section className={sectionClass} aria-label={title}>
      <h4 className={`text-xs font-black flex items-center gap-1.5 mb-2 ${titleClass}`}>
        <Icon className="w-4 h-4 shrink-0" aria-hidden />
        {title}
      </h4>
      <ul className="space-y-1.5">
        {list.map((item, i) => (
          <li key={i}>
            {multiline ? (
              <textarea
                value={item}
                onChange={(e) => updateItem(i, e.target.value)}
                rows={2}
                className={`w-full rounded-lg px-2.5 py-2 text-sm leading-relaxed resize-y min-h-[2.5rem] ${inputClass}`}
                placeholder={placeholder}
              />
            ) : (
              <input
                type="text"
                value={item}
                onChange={(e) => updateItem(i, e.target.value)}
                className={`w-full rounded-lg px-2.5 py-2 text-sm ${inputClass}`}
                placeholder={placeholder}
              />
            )}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => onChange([...list, ''])}
        className="mt-2 text-[10px] font-semibold opacity-80 hover:underline"
      >
        {addLabel}
      </button>
    </section>
  );
}

export default function ClinicalIntakeEditableInsightsPanel({
  patient,
  compact = false,
  onSave,
  showSaveButton = true,
  className = '',
}: Props) {
  const [fields, setFields] = useState<ClinicalIntakeEditableFields>(() =>
    loadClinicalIntakeEditableFields(patient)
  );
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    setFields(loadClinicalIntakeEditableFields(patient));
  }, [patient.id]);

  const pad = compact ? 'p-3' : 'p-4';

  const patchFields = useCallback(
    (partial: Partial<ClinicalIntakeEditableFields>) => {
      setFields((prev) => ({ ...prev, ...partial }));
    },
    []
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      const patch = buildPatientPatchFromEditableIntakeFields(fields);
      await onSave(patch);
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 2200);
    } finally {
      setSaving(false);
    }
  };

  const vasDisplay = fields.vasScore != null ? `${fields.vasScore}/10` : '';

  return (
    <div className={`space-y-3 ${className}`} dir="rtl">
      <section className="rounded-xl border-2 border-teal-200 bg-gradient-to-br from-teal-50/80 to-white p-3.5 shadow-sm">
        <h4 className="text-xs font-black text-teal-950 flex items-center gap-1.5 mb-2">
          <FileText className="w-4 h-4 text-teal-700 shrink-0" aria-hidden />
          תיאור מקרה / סיפור קליני
        </h4>
        <textarea
          value={fields.caseStory}
          onChange={(e) => patchFields({ caseStory: e.target.value })}
          rows={compact ? 4 : 6}
          className="w-full rounded-xl border border-teal-200/90 bg-white px-3 py-2.5 text-sm text-slate-800 leading-relaxed resize-y min-h-[6rem] focus:outline-none focus:ring-2 focus:ring-teal-400/30"
          placeholder="מה קרה, איך זה התפתח, ומה מצב המטופל היום…"
        />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
              אבחון / רושם קליני
            </p>
            <input
              type="text"
              value={fields.diagnosis}
              onChange={(e) => patchFields({ diagnosis: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-400/25"
              placeholder="רושם קליני / אבחנה עיקרית"
            />
          </div>
          <div className="shrink-0 w-full sm:w-auto">
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
              מדד כאב VAS
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={10}
                step={1}
                value={fields.vasScore ?? 0}
                onChange={(e) =>
                  patchFields({ vasScore: Number.parseInt(e.target.value, 10) })
                }
                className="w-28 accent-teal-600"
                aria-label="מדד כאב VAS"
              />
              <input
                type="number"
                min={0}
                max={10}
                step={1}
                value={fields.vasScore ?? ''}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === '') {
                    patchFields({ vasScore: null });
                    return;
                  }
                  const n = Number.parseInt(raw, 10);
                  if (Number.isFinite(n)) {
                    patchFields({ vasScore: Math.min(10, Math.max(0, n)) });
                  }
                }}
                className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-center text-sm font-black text-slate-900 tabular-nums"
                aria-label="ציון VAS מספרי"
              />
              <span className="text-xs font-semibold text-slate-500 tabular-nums">{vasDisplay}</span>
            </div>
          </div>
        </div>
      </section>

      <EditableListSection
        title="מסקנות קליניות"
        icon={Lightbulb}
        items={fields.clinicalConclusionsHe}
        onChange={(clinicalConclusionsHe) => patchFields({ clinicalConclusionsHe })}
        placeholder="מסקנה קלינית"
        sectionClass={`rounded-xl border border-teal-200/90 bg-gradient-to-br from-teal-50/70 to-white ${pad}`}
        titleClass="text-teal-950"
        inputClass="border border-teal-200/80 bg-white/90 text-teal-950"
        multiline
        addLabel="+ מסקנה"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <EditableListSection
          title="אבחנה מבדלת"
          icon={Stethoscope}
          items={fields.differentialDiagnosis}
          onChange={(differentialDiagnosis) => patchFields({ differentialDiagnosis })}
          placeholder="חלופה אבחנתית"
          sectionClass={`rounded-xl border border-indigo-200 bg-indigo-50/60 ${pad}`}
          titleClass="text-indigo-950"
          inputClass="border border-indigo-200/80 bg-white/90 text-indigo-950"
          addLabel="+ חלופה"
        />

        <EditableListSection
          title="בדיקות / המלצות להמשך"
          icon={FlaskConical}
          items={fields.recommendedTestsHe}
          onChange={(recommendedTestsHe) => patchFields({ recommendedTestsHe })}
          placeholder="בדיקה או המלצה"
          sectionClass={`rounded-xl border border-slate-200 bg-slate-50/90 ${pad}`}
          titleClass="text-slate-800"
          inputClass="border border-slate-200 bg-white text-slate-800"
          addLabel="+ המלצה"
        />
      </div>

      <EditableListSection
        title="ממה להיזהר / נקודות דגש"
        icon={AlertTriangle}
        items={fields.precautionsHe}
        onChange={(precautionsHe) => patchFields({ precautionsHe })}
        placeholder="דגש קליני או אזהרה"
        sectionClass={`rounded-xl border-2 border-amber-400 bg-gradient-to-br from-amber-50 via-orange-50/90 to-amber-50 shadow-sm ${pad}`}
        titleClass="text-amber-950"
        inputClass="border border-amber-300/90 bg-white/80 text-amber-950"
        multiline
        addLabel="+ דגש"
      />

      <EditableListSection
        title="דגלים אדומים / אזהרות"
        icon={ShieldAlert}
        items={fields.redFlags}
        onChange={(redFlags) => patchFields({ redFlags })}
        placeholder="דגל אדום"
        sectionClass={`rounded-xl border-2 border-red-300 bg-red-50/90 shadow-sm ${pad}`}
        titleClass="text-red-900"
        inputClass="border border-red-200 bg-white text-red-900"
        multiline
        addLabel="+ אזהרה"
      />

      {showSaveButton && (
        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 shadow-md"
            style={{ background: 'linear-gradient(135deg, #0d9488, #10b981)' }}
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden />
                שומר…
              </>
            ) : savedFlash ? (
              'נשמר ✓'
            ) : (
              <>
                <Save className="w-4 h-4 shrink-0" aria-hidden />
                שמירת עריכות
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
