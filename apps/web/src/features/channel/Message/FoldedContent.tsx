import { Tool } from '@core/component/AI/component/tool/Tool';
import { StaticMarkdown } from '@core/component/LexicalMarkdown/component/core/StaticMarkdown';
import { channelTheme } from '@core/component/LexicalMarkdown/theme';
import ArrowsLeftRight from '@phosphor/arrows-left-right.svg';
import Brain from '@phosphor/brain.svg';
import FileText from '@phosphor/file-text.svg';
import Globe from '@phosphor/globe.svg';
import MagnifyingGlass from '@phosphor/magnifying-glass.svg';
import PencilSimple from '@phosphor/pencil-simple.svg';
import ShieldCheck from '@phosphor/shield-check.svg';
import Terminal from '@phosphor/terminal.svg';
import TrashSimple from '@phosphor/trash-simple.svg';
import Wrench from '@phosphor/wrench.svg';
import type {
  FoldedMessage,
  FoldedMessagePart,
  ToolDetail,
} from '@service-agent-fold/generated/types';
import { createMemo, createSignal, For, type JSX, Show } from 'solid-js';
import { match } from 'ts-pattern';
import { FoldedDiff } from './FoldedDiff';
import { FoldedOutput } from './FoldedOutput';
import { FoldedPathList } from './FoldedPathList';
import { FoldedTerminal } from './FoldedTerminal';

/** Paths shown inline before a call's row grows a "+N more" and a full list. */
const INLINE_PATH_LIMIT = 3;

/** A short, truncated stand-in for a full path list. */
function pathSummary(paths: string[]): string | undefined {
  if (paths.length === 0) return undefined;
  if (paths.length <= INLINE_PATH_LIMIT) return paths.join(', ');
  return `${paths.slice(0, INLINE_PATH_LIMIT).join(', ')} +${
    paths.length - INLINE_PATH_LIMIT
  } more`;
}

/** What a tool call's row shows, and what (if anything) hides behind its toggle. */
interface ToolPresentation {
  icon: (props: JSX.SvgSVGAttributes<SVGSVGElement>) => JSX.Element;
  summary?: string;
  status?: string;
  body?: JSX.Element;
}

/**
 * Icon, inline summary, and expandable body for a tool call, keyed off what
 * the tool did.
 */
function toolPresentation(detail: ToolDetail): ToolPresentation {
  return match(detail)
    .with({ kind: 'terminal' }, (detail) => ({
      icon: Terminal,
      summary: detail.command ?? undefined,
      body: detail.output ? (
        <FoldedTerminal output={detail.output} exitCode={detail.exitCode} />
      ) : undefined,
    }))
    .with({ kind: 'edit' }, (detail) => ({
      icon: PencilSimple,
      summary:
        detail.diffs.length === 1
          ? detail.diffs[0].path
          : detail.diffs.map((diff) => diff.path).join(', ') || undefined,
      status:
        detail.diffs.length > 1 ? `${detail.diffs.length} files` : undefined,
      body:
        detail.diffs.length > 0 ? (
          <FoldedDiff diffs={detail.diffs} />
        ) : undefined,
    }))
    .with({ kind: 'read' }, { kind: 'delete' }, { kind: 'move' }, (detail) => ({
      icon:
        detail.kind === 'read'
          ? FileText
          : detail.kind === 'delete'
            ? TrashSimple
            : ArrowsLeftRight,
      summary: pathSummary(detail.paths),
      body:
        detail.paths.length > INLINE_PATH_LIMIT ? (
          <FoldedPathList paths={detail.paths} />
        ) : undefined,
    }))
    .with({ kind: 'search' }, (detail) => {
      const showList = detail.paths.length > INLINE_PATH_LIMIT;
      const hasOutput = !!detail.output;
      return {
        icon: MagnifyingGlass,
        summary: pathSummary(detail.paths),
        body:
          showList || hasOutput ? (
            <div class="flex flex-col gap-2">
              <Show when={showList}>
                <FoldedPathList paths={detail.paths} />
              </Show>
              <Show when={detail.output}>
                {(output) => <FoldedOutput text={output()} />}
              </Show>
            </div>
          ) : undefined,
      };
    })
    .with({ kind: 'fetch' }, { kind: 'think' }, (detail) => ({
      icon: detail.kind === 'fetch' ? Globe : Brain,
      body: detail.output ? <FoldedOutput text={detail.output} /> : undefined,
    }))
    .with({ kind: 'other' }, (detail) => ({
      icon: Wrench,
      body: detail.output ? (
        <FoldedOutput text={detail.output} />
      ) : detail.input !== undefined && detail.input !== null ? (
        <FoldedOutput text={JSON.stringify(detail.input, null, 2)} />
      ) : undefined,
    }))
    .exhaustive();
}

/** Whether a tool call reported failure, ACP status or otherwise. */
function toolFailed(part: Extract<FoldedMessagePart, { kind: 'tool_use' }>) {
  if (part.status === 'failed') return true;
  const detail = part.detail;
  return (
    detail.kind === 'terminal' && !!detail.exitCode && detail.exitCode !== 0
  );
}

/** What the user chose on a permission request, as a trailing label. */
function permissionOutcomeLabel(
  part: Extract<FoldedMessagePart, { kind: 'permission' }>
): string | undefined {
  const outcome = part.outcome;
  if (!outcome) return undefined;
  if (outcome.kind === 'cancelled') return 'Cancelled';
  const chosen = part.options.find((option) => option.id === outcome.optionId);
  return chosen?.name ?? 'Answered';
}

/**
 * The agent's reasoning, styled like the chat's `ThinkingBlock` but always
 * open — this view has no collapsing.
 */
function Thought(props: { text: string }) {
  return (
    <div class="relative text-xs leading-5 text-ink-extra-muted">
      <div class="flex min-h-7 items-center gap-1 py-1">
        <Brain class="size-4 shrink-0" />
        <span>Thought</span>
      </div>
      <div class="pl-5 text-ink-muted whitespace-pre-wrap wrap-break-word">
        {props.text}
      </div>
    </div>
  );
}

/** A tool call: icon, label + summary, and an expandable body when it has one. */
function FoldedToolUse(props: {
  part: Extract<FoldedMessagePart, { kind: 'tool_use' }>;
}) {
  const [expanded, setExpanded] = createSignal(false);
  const presentation = createMemo(() => toolPresentation(props.part.detail));
  const failed = createMemo(() => toolFailed(props.part));
  const hasBody = () => presentation().body !== undefined;

  return (
    <Tool.Root muted={failed()}>
      <Tool.Row
        icon={presentation().icon}
        trailing={
          <Tool.ResultToggle
            expanded={expanded()}
            onToggle={() => setExpanded((value) => !value)}
            showToggle={hasBody()}
            status={
              failed() ? (
                <span class="text-failure">Failed</span>
              ) : (
                presentation().status
              )
            }
          />
        }
      >
        <div class="flex min-w-0 items-center gap-1 overflow-hidden">
          <span class="shrink-0 text-ink">{props.part.label}</span>
          <Show when={presentation().summary}>
            {(summary) => (
              <>
                <span class="shrink-0 text-ink-placeholder">·</span>
                <span class="min-w-0 truncate font-mono">{summary()}</span>
              </>
            )}
          </Show>
        </div>
      </Tool.Row>
      <Show when={hasBody() && expanded()}>
        <Tool.Response>{presentation().body}</Tool.Response>
      </Show>
    </Tool.Root>
  );
}

// Folded parts are plain immutable query data — a new array arrives on each
// refetch — so rendering them non-reactively in a match is safe.
function FoldedPart(props: { part: FoldedMessagePart }): JSX.Element {
  return match(props.part)
    .with({ kind: 'text' }, (part) => (
      <div class="whitespace-pre-wrap wrap-break-word max-w-full text-sm">
        <StaticMarkdown
          markdown={part.text}
          theme={channelTheme}
          target="internal"
        />
      </div>
    ))
    .with({ kind: 'thought' }, (part) => <Thought text={part.text} />)
    .with({ kind: 'tool_use' }, (part) => <FoldedToolUse part={part} />)
    .with({ kind: 'permission' }, (part) => {
      const outcome = permissionOutcomeLabel(part);
      return (
        <Tool.Root>
          <Tool.Row
            icon={ShieldCheck}
            trailing={
              outcome ? <span class="text-ink">{outcome}</span> : undefined
            }
          >
            <span>Permission requested</span>
          </Tool.Row>
        </Tool.Root>
      );
    })
    .exhaustive();
}

/**
 * The dumb agent viewer: renders a folded agent-session message — prose,
 * reasoning, and tool calls — in place of a placeholder channel message's
 * missing content.
 */
export function FoldedContent(props: { folded: FoldedMessage }) {
  return (
    <div class="flex flex-col gap-1 min-w-0">
      <For each={props.folded.parts}>
        {(part) => <FoldedPart part={part} />}
      </For>
    </div>
  );
}
