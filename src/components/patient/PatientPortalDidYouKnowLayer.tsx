import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { usePatient } from '../../context/PatientContext';
import { useLocalCalendarDayKey } from '../../utils/dailyKnowledgeFact';
import KnowledgeCloud from './KnowledgeCloud';

/**
 * Patient portal: floating «הידעת?» trigger persists across tabs/training routes (mounted once under the router).
 */
export default function PatientPortalDidYouKnowLayer() {
  const location = useLocation();
  const { sessionRole, patientMustChangePassword } = useAuth();
  const {
    selectedPatient,
    knowledgeFacts,
    markArticleAsRead,
    hasReadArticle,
    getDidYouKnowTipOpenedLocalYmd,
    recordDidYouKnowTipOpened,
  } = usePatient();

  const dykLocalCalendarDayKey = useLocalCalendarDayKey();

  const approvedFacts = useMemo(
    () => knowledgeFacts.filter((f) => f.isApproved),
    [knowledgeFacts]
  );

  const tipAlreadyOpenedToday = Boolean(
    selectedPatient &&
      getDidYouKnowTipOpenedLocalYmd(selectedPatient.id) === dykLocalCalendarDayKey
  );

  const show =
    sessionRole === 'patient' &&
    location.pathname.startsWith('/patient-portal') &&
    !!selectedPatient &&
    !patientMustChangePassword &&
    approvedFacts.length > 0;

  if (!show || !selectedPatient) return null;

  return (
    <KnowledgeCloud
      patient={selectedPatient}
      approvedFacts={approvedFacts}
      tipAlreadyOpenedToday={tipAlreadyOpenedToday}
      onDidYouKnowTriggerOpen={() =>
        recordDidYouKnowTipOpened(selectedPatient.id, dykLocalCalendarDayKey)
      }
      onCollectReward={(articleId, opts) =>
        markArticleAsRead(selectedPatient.id, articleId, {
          ...opts,
          didYouKnowLocalCalendarYmd: dykLocalCalendarDayKey,
        })
      }
      hasReadArticle={hasReadArticle}
    />
  );
}
