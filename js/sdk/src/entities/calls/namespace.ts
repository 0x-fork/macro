import type { MacroClient } from '../../utils/client';
import { CallRecord } from './call-record';

export class CallRecordNamespace {
  constructor(private readonly client: MacroClient) {}

  byId(id: string): CallRecord {
    return CallRecord.byId(this.client, id);
  }

  search(query: string): AsyncGenerator<CallRecord> {
    return CallRecord.search(this.client, query);
  }
}
