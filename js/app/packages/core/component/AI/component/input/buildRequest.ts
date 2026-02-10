import { DEFAULT_MODEL } from '@core/component/AI/constant';
import { useAdditionalInstructions } from '@core/component/AI/constant/prompts';
import type {
  Attachment,
  ChatSendRequest,
  Model,
  ToolSet,
} from '@core/component/AI/types';
import { getMacroApiToken } from '@service-auth/fetch';

export function useBuildChatSendRequest() {
  const additionalInstructions = useAdditionalInstructions();
  return async function buildChatSendRequest({
    userRequest,
    chatId,
    model,
    attachments,
    toolset,
  }: {
    userRequest: string;
    chatId: string | undefined;
    isPersistent?: boolean;
    model?: Model;
    attachments?: Attachment[];
    toolset?: ToolSet;
    source?: string;
  }): Promise<ChatSendRequest> {
    const token = await getMacroApiToken();
    const modelInstructions = model ? `\nYou are ${model}` : '';
    const additional = `${additionalInstructions()}${modelInstructions}`;

    return {
      chat_id: chatId,
      content: userRequest,
      model: model ?? DEFAULT_MODEL,
      attachments: attachments ?? [],
      token,
      additional_instructions: additional,
      toolset,
    };
  };
}
