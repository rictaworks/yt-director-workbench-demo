import type { ClassifierInput, ClassifierRawResult } from './types.ts';

/** Calendar date in the product's JST calendar, supplied by an adapter. */
export interface Clock { today(): string }
/** Session must be supplied on every read and write. */
export interface ProjectRepository<Entity extends { id: string; sessionId: string }> {
  listProjects(sessionId: string): Promise<Entity[]>;
  getProject(sessionId: string, id: string): Promise<Entity | null>;
  createProject(sessionId: string, alias: string): Promise<Entity>;
}
/** Provider wire schemas remain in the adapter. */
export interface IdeaClassifierPort<Input = ClassifierInput, Result = ClassifierRawResult> {
  classify(input: Input): Promise<Result>;
}
