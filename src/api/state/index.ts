import type {
  PersistedStateEnvelope,
  StateDomain,
  StateDomainResponse,
  StateDomainSnapshot,
} from './type';
import { apiTransport } from '../http/transport';

export class StateApi {
  constructor(private readonly transport = apiTransport) {}

  async readDomain<Domain extends StateDomain>(
    domain: Domain,
    etag?: string,
  ): Promise<StateDomainResponse<Domain>> {
    const response = await this.transport.request(
      `/api/state/${domain}`,
      { ...(etag ? { headers: { 'If-None-Match': etag } } : {}) },
      [304],
    );
    const nextEtag = response.headers.get('ETag');
    if (response.status === 304 || response.status === 204) {
      return { status: response.status, etag: nextEtag };
    }
    const rawState = await response.text();
    try {
      const snapshot = JSON.parse(rawState) as StateDomainSnapshot<Domain>;
      if (
        !snapshot ||
        typeof snapshot !== 'object' ||
        !snapshot.state ||
        typeof snapshot.state !== 'object'
      ) {
        throw new Error();
      }
      return { status: 200, etag: nextEtag, snapshot };
    } catch {
      throw new Error('服务端学习数据格式不正确');
    }
  }

  async initialize(snapshot: PersistedStateEnvelope): Promise<void> {
    await this.transport.request('/api/state?initialize=1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot),
    });
  }

  async writeDomain<Domain extends StateDomain>(
    domain: Domain,
    snapshot: StateDomainSnapshot<Domain>,
  ): Promise<void> {
    await this.transport.request(`/api/state/${domain}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot),
    });
  }
}

export const stateApi = new StateApi();
