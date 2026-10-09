import { JEV_MESSAGES } from './messages.ts';
import type { IdeaClassifierPort } from '../core/ports.ts';
import type { ClassifierInput, ClassifierRawResult, IdeaTypeId } from '../core/types.ts';

/** Only a Workers AI binding is accepted. No direct provider HTTP fallback. */
export interface WorkersAiBinding { run(model: string, input: unknown): Promise<unknown> }

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_jev_response');
  return value as Record<string, unknown>;
}
function probability(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) throw new Error('invalid_jev_probability');
  return value;
}

export class JevClassifier implements IdeaClassifierPort {
  private binding: WorkersAiBinding | undefined;
  private enabled: boolean;
  constructor(binding?: WorkersAiBinding, enabled = false) { this.binding = binding; this.enabled = enabled; }

  async classify(input: ClassifierInput): Promise<ClassifierRawResult> {
    if (!this.binding || !this.enabled) throw new Error('classification_unavailable');
    const criteria = Object.fromEntries(input.choices.map(choice => [choice.id, choice.label]));
    let value: unknown;
    try {
      value = await this.binding.run('typesafe/jev', {
        state: { memo: input.memo, industry: input.industry },
        questions: {
          idea_type: { type: 'choice', instructions: JEV_MESSAGES.choice, criteria },
          caution: { type: 'noul', instructions: `${JEV_MESSAGES.caution}${input.cautions.join(JEV_MESSAGES.separator)}`, criteria: { true: JEV_MESSAGES.yes, false: JEV_MESSAGES.no } },
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      if (code === '3036' || /3036|quota|neuron|daily.*limit|free.*limit|10000/i.test(message)) throw Object.assign(new Error('quota_exceeded'), { code: 'quota_exceeded' });
      throw new Error('classification_failed');
    }
    const raw = record(value);
    // The documented Cloudflare route is an alias. Reject drift rather than silently changing models.
    if (raw.model !== 'jev-1.13.0') throw new Error('jev_version_mismatch');
    const answers = record(raw.answers), choice = record(answers.idea_type), caution = record(answers.caution);
    if (choice.type !== 'choice' || caution.type !== 'noul' || !input.choices.some(item => item.id === choice.choice)) throw new Error('invalid_jev_response');
    const probabilities = record(choice.probabilities);
    const candidates = input.choices.map(item => ({ ideaType: item.id, probability: probability(probabilities[item.id]) }));
    const sum = candidates.reduce((total, candidate) => total + candidate.probability, 0);
    if (Math.abs(sum - 1) > 0.02) throw new Error('invalid_jev_distribution');
    return { selectedIdeaType: choice.choice as IdeaTypeId, confidence: probability(choice.confidence), candidates, cautionProbability: probability(caution.noul), model: raw.model };
  }
}
