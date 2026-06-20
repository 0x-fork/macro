/**
 * Provider-agnostic coding-agent event (ACP-mapped). Mirrors
 * `coding_agent::CodingEvent` (serde tag = "type", snake_case).
 *
 * Hand-authored to accompany `AssistantMessagePartCodingAgentEvent` until the
 * OpenAPI/orval generation picks it up from the Rust `ToSchema`.
 */

export type CodingToolKind =
  | 'read'
  | 'edit'
  | 'delete'
  | 'move'
  | 'search'
  | 'execute'
  | 'think'
  | 'fetch'
  | 'other';

export type CodingToolCallStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed';

export type CodingPlanStatus = 'pending' | 'in_progress' | 'completed';

export type CodingStopReason =
  | 'end_turn'
  | 'max_tokens'
  | 'max_turn_requests'
  | 'refusal'
  | 'cancelled';

export interface CodingPlanEntry {
  content: string;
  status: CodingPlanStatus;
}

export interface CodingPermissionOption {
  id: string;
  label: string;
  allows: boolean;
}

export interface CodingPrResult {
  url: string;
  number: number;
  branch: string;
  title: string;
  changed_files?: number | null;
}

export type CodingEvent =
  | { type: 'session_started'; sandbox_id: string; repo: string; branch: string }
  | { type: 'message'; text: string }
  | { type: 'thought'; text: string }
  | {
      type: 'tool_call';
      id: string;
      title: string;
      kind: CodingToolKind;
      status: CodingToolCallStatus;
    }
  | {
      type: 'tool_update';
      id: string;
      status: CodingToolCallStatus;
      output?: string | null;
    }
  | { type: 'diff'; path: string; old_text?: string | null; new_text: string }
  | { type: 'plan'; entries: CodingPlanEntry[] }
  | {
      type: 'permission_request';
      id: string;
      title: string;
      options: CodingPermissionOption[];
    }
  | { type: 'permission_resolved'; id: string; option_id: string }
  | { type: 'log'; level: string; message: string }
  | {
      type: 'finished';
      stop_reason: CodingStopReason;
      pr?: CodingPrResult | null;
      summary: string;
    }
  | { type: 'error'; message: string };
