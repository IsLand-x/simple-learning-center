import type { LearningData, StateDomain, StateDomainData } from '../../../contracts/state';

// Legacy snapshots can omit fields until their existing migrations have run.
export interface PersistedStateEnvelope {
  state?: Partial<LearningData>;
  version?: number;
}

export interface StateDomainSnapshot<Domain extends StateDomain = StateDomain> {
  state: Partial<StateDomainData[Domain]>;
  version: number;
}

export type StateDomainResponse<Domain extends StateDomain = StateDomain> =
  | { status: 204; etag: string | null }
  | { status: 304; etag: string | null }
  | { status: 200; etag: string | null; snapshot: StateDomainSnapshot<Domain> };
