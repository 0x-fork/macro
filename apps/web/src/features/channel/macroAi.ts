import {
  isMacroAgentId,
  MACRO_AGENT_NAME,
  MACRO_AGENT_PRINCIPAL_ID,
} from '@core/constant/macroAgent';
import type { IUser } from '@core/user/types';
import type { Bot } from '@service-storage/generated/schemas/bot';

// Re-export the shared Macro identity under the names used in this package.
export {
  isMacroAgentId as isMacroAiId,
  MACRO_AGENT_BOT_ID as MACRO_AI_BOT_ID,
  MACRO_AGENT_HANDLE as MACRO_AI_HANDLE,
  MACRO_AGENT_NAME as MACRO_AI_NAME,
  MACRO_AGENT_PRINCIPAL_ID as MACRO_AI_PRINCIPAL_ID,
} from '@core/constant/macroAgent';

/**
 * A synthetic [`IUser`] entry so Macro appears in the channel `@`-mention
 * typeahead. The mention rides the existing user-mention machinery and is
 * re-tagged as a bot mention at send time (see `expandMentions`). `email` is set
 * to the display name so the typeahead shows just "Macro". The id uses the
 * canonical `bot|<uuid>` principal form so persisted mention content matches
 * bot sender/participant ids.
 */
export function macroAiMentionUser(): IUser {
  return {
    id: MACRO_AGENT_PRINCIPAL_ID,
    name: MACRO_AGENT_NAME,
    email: MACRO_AGENT_NAME,
  };
}

/**
 * Synthetic [`IUser`] entries so a channel's agent bots appear in the
 * `@`-mention typeahead, mirroring [`macroAiMentionUser`]. `email` carries the
 * bare handle: the typeahead shows it dimmed next to the name and the mention
 * chip renders it as `@handle`. The id uses the canonical `bot|<uuid>`
 * principal form so persisted mention content matches bot sender/participant
 * ids and is re-tagged as a bot mention at send time.
 *
 * Standard bots are excluded — they post via webhooks and do not react to
 * mentions — and so is Macro, which is injected separately in every channel.
 */
export function agentBotMentionUsers(bots: readonly Bot[]): IUser[] {
  return bots
    .filter((bot) => bot.bot_type === 'agent' && !isMacroAgentId(bot.id))
    .map((bot) => ({
      id: `bot|${bot.id}`,
      name: bot.name,
      email: bot.handle,
    }));
}
