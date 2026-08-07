export type ProgramReviewChangeLike = {
  exerciseId: string;
  exerciseName?: string;
  action: string;
  fromSets?: number;
  toSets: number;
  fromReps?: number;
  toReps: number;
  swapToExerciseId?: string;
  swapToExerciseName?: string;
  noteHebrew?: string;
};

/** Stable key for one actionable program-review change (sent by client; validated server-side). */
export function programReviewChangeKey(change: {
  exerciseId: string;
  action: string;
  swapToExerciseId?: string | null;
}): string {
  const swap = (change.swapToExerciseId ?? '').trim();
  return `${change.exerciseId.trim()}:${change.action.trim()}:${swap}`;
}

export function isActionableProgramReviewChange(change: {
  action: string;
}): boolean {
  return change.action !== 'keep' && change.action.trim().length > 0;
}

type ExerciseJson = Record<string, unknown>;

function exerciseIdOf(ex: ExerciseJson): string {
  return typeof ex.id === 'string' ? ex.id : String(ex.id ?? '');
}

/**
 * Merge accepted program-review changes onto the current live plan exercises.
 * Declined / omitted changes leave those exercises unchanged.
 * Prefer snapshot entries from proposedExercises (replacedExerciseId / id) when present.
 */
export function mergeAcceptedProgramReviewChanges(params: {
  currentExercises: unknown;
  proposedChanges: ProgramReviewChangeLike[];
  proposedExercises?: unknown;
  acceptedChangeKeys: string[];
}): { ok: true; exercises: ExerciseJson[] } | { ok: false; reason: string } {
  if (!Array.isArray(params.currentExercises)) {
    return { ok: false, reason: 'invalid_current_plan' };
  }
  const accepted = new Set(
    params.acceptedChangeKeys.map((k) => k.trim()).filter(Boolean)
  );
  if (accepted.size === 0) {
    return { ok: false, reason: 'no_accepted_keys' };
  }

  const actionable = params.proposedChanges.filter(isActionableProgramReviewChange);
  const byKey = new Map<string, ProgramReviewChangeLike>();
  for (const c of actionable) {
    byKey.set(programReviewChangeKey(c), c);
  }
  for (const key of accepted) {
    if (!byKey.has(key)) {
      return { ok: false, reason: 'unknown_change_key' };
    }
  }

  const snapshotByReplaced = new Map<string, ExerciseJson>();
  const snapshotById = new Map<string, ExerciseJson>();
  if (Array.isArray(params.proposedExercises)) {
    for (const raw of params.proposedExercises) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
      const ex = raw as ExerciseJson;
      const id = exerciseIdOf(ex);
      if (id) snapshotById.set(id, ex);
      const replaced =
        typeof ex.replacedExerciseId === 'string' ? ex.replacedExerciseId : '';
      if (replaced) snapshotByReplaced.set(replaced, ex);
    }
  }

  let next: ExerciseJson[] = params.currentExercises.map((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return { ...(raw as ExerciseJson) };
  });

  for (const key of accepted) {
    const change = byKey.get(key)!;
    const action = change.action;
    const idx = next.findIndex((ex) => exerciseIdOf(ex) === change.exerciseId);

    if (action === 'swap' || action === 'progress_swap') {
      if (idx < 0) return { ok: false, reason: 'exercise_missing' };
      const snap =
        snapshotByReplaced.get(change.exerciseId) ||
        (change.swapToExerciseId
          ? snapshotById.get(change.swapToExerciseId)
          : undefined);
      const prev = next[idx];
      const swapId = (change.swapToExerciseId ?? '').trim();
      if (!swapId) return { ok: false, reason: 'invalid_swap' };
      next[idx] = {
        ...prev,
        ...(snap ?? {}),
        id: swapId,
        name: change.swapToExerciseName ?? snap?.name ?? prev.name,
        sets: change.toSets,
        reps: change.toReps,
        patientSets: change.toSets,
        patientReps: change.toReps,
        replacedExerciseId: change.exerciseId,
      };
      continue;
    }

    if (
      action === 'reduce_reps' ||
      action === 'reduce_sets' ||
      action === 'progress_reps' ||
      action === 'progress_sets'
    ) {
      if (idx < 0) return { ok: false, reason: 'exercise_missing' };
      const prev = next[idx];
      next[idx] = {
        ...prev,
        sets: change.toSets,
        reps: change.toReps,
        patientSets: change.toSets,
        patientReps: change.toReps,
      };
      continue;
    }

    return { ok: false, reason: 'unsupported_action' };
  }

  next = next.filter((ex) => exerciseIdOf(ex).length > 0);
  if (next.length === 0) {
    return { ok: false, reason: 'empty_plan' };
  }

  return { ok: true, exercises: next };
}
