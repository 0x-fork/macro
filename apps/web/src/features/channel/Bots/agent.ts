import type {
  AgentMode,
  BotEventKind,
  BotWithAgent,
} from '@service-storage/client';

/** Human-readable labels for agent event kinds. */
export const BOT_EVENT_LABELS: Record<BotEventKind, string> = {
  'channel.bot-mentioned': 'Bot mentioned',
};

/** Human-readable label for an agent mode. */
export function agentModeLabel(mode: AgentMode | undefined): string {
  return mode === 'external' ? 'External' : 'Macro agent';
}

/** Badge text for agent bots (e.g. "Agent · Macro"), undefined otherwise. */
export function agentBadgeLabel(bot: BotWithAgent): string | undefined {
  if (bot.bot_type !== 'agent') return undefined;
  return `Agent · ${bot.agent?.mode === 'external' ? 'External' : 'Macro'}`;
}
