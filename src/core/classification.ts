import { CATALOG } from './templates/catalog.ts';
import { MESSAGES } from './templates/messages.ts';
import { validateIdeaType, validateIndustry, validateMemo } from './validation.ts';
import type { IdeaClassifierPort } from './ports.ts';
import type { Classification, ClassifierRawResult, IndustryId } from './types.ts';
const probability = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1;
function validResult(raw: ClassifierRawResult): boolean {
  if (!raw || !probability(raw.confidence) || !probability(raw.cautionProbability) || typeof raw.model !== 'string' || raw.model.trim() === '' || !Array.isArray(raw.candidates) || raw.candidates.length < 2 || raw.candidates.length > 8) return false;
  validateIdeaType(raw.selectedIdeaType);
  const seen = new Set<string>();
  for (const candidate of raw.candidates) {
    if (!candidate || !probability(candidate.probability) || seen.has(candidate.ideaType)) return false;
    validateIdeaType(candidate.ideaType); seen.add(candidate.ideaType);
  }
  return seen.has(raw.selectedIdeaType);
}
/** Validation precedes the port call; provider failures never trigger a substitute classifier. */
export async function classifyIdea(memo: string, port: IdeaClassifierPort, industry: IndustryId = 'btob'): Promise<Classification> {
  const normalizedMemo = validateMemo(memo); validateIndustry(industry);
  const cautions = [...CATALOG.cautions.find(x => x.industry === industry)!.items];
  try {
    const raw = await port.classify({ memo: normalizedMemo, industry, choices: CATALOG.ideaTypes.map(x => ({ ...x })), cautions });
    if (!validResult(raw)) throw new Error('invalid_classifier_result');
    const automatic = raw.confidence >= .8;
    const candidates = raw.candidates.map(x => ({ ...x })).sort((a, b) => b.probability - a.probability || CATALOG.ideaTypes.findIndex(x => x.id === a.ideaType) - CATALOG.ideaTypes.findIndex(x => x.id === b.ideaType)).slice(0, 2);
    return { mode: automatic ? 'automatic' : 'selection', selectedIdeaType: automatic ? raw.selectedIdeaType : null, confidence: raw.confidence,
      candidates, otherAvailable: !automatic, cautionProbability: raw.cautionProbability, cautions: raw.cautionProbability >= .5 ? cautions : [], model: raw.model, error: null };
  } catch (error) {
    const quota = typeof error === 'object' && error !== null && 'code' in error && error.code === 'quota_exceeded';
    return { mode: 'manual', selectedIdeaType: null, confidence: null, candidates: [], otherAvailable: true, cautionProbability: null, cautions: [], model: null,
      error: { code: quota ? 'quota_exceeded' : 'classification_failed', message: quota ? MESSAGES.quota : MESSAGES.classificationFailed } };
  }
}
