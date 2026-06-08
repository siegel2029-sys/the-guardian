import { useCallback, useRef } from 'react';
import type { Patient } from '../../../types';
import { usePatient } from '../../../context/PatientContext';
import { useComparativeIntakeAnalysis } from '../../../hooks/useComparativeIntakeAnalysis';
import ClinicalIntakeProfilePanel from './ClinicalIntakeProfilePanel';

type Props = {
  patient: Patient;
};

export default function PatientClinicalIntakeSection({ patient }: Props) {
  const { updatePatient, savePersistedStateToCloud } = usePatient();
  const patientIdRef = useRef(patient.id);
  patientIdRef.current = patient.id;

  const saveToCloud = useCallback(async () => {
    return savePersistedStateToCloud({ immediate: true });
  }, [savePersistedStateToCloud]);

  const comparative = useComparativeIntakeAnalysis({
    patient,
    updatePatient,
    saveToCloud,
  });

  const handleSaveTimeline = useCallback(
    async (patch: Partial<Patient>) => {
      updatePatient(patientIdRef.current, patch);
      await savePersistedStateToCloud({ immediate: true });
    },
    [updatePatient, savePersistedStateToCloud]
  );

  return (
    <ClinicalIntakeProfilePanel
      patient={patient}
      tabbed
      onSaveTimeline={handleSaveTimeline}
      onRunComparativeAnalysis={(currentFields) => comparative.runComparative(currentFields)}
      comparativeBusy={comparative.busy}
      comparativeError={comparative.error}
      pendingVersion={comparative.pendingVersion}
      pendingFields={comparative.pendingFields}
      onPendingFieldsChange={comparative.updatePendingFields}
      onConfirmPending={comparative.handleConfirm}
      onUpdateIntakeVersion={(versionId, version, fields) =>
        comparative.handleUpdateVersion(versionId, version, fields)
      }
      onCreateSuccessiveVersion={(sourceVersion) =>
        comparative.createSuccessiveVersion(sourceVersion)
      }
      onDiscardPending={comparative.discardPending}
      confirmBusy={comparative.confirmBusy}
      cloneBusy={comparative.cloneBusy}
      updatePatient={updatePatient}
    />
  );
}
