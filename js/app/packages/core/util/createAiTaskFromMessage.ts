import {
  PROPERTY_OPTION_IDS,
  SYSTEM_PROPERTY_IDS,
} from '@core/component/Properties/constants';
import { structuredOutputCompletion } from '@core/client/structuredOutput';
import { createTask } from '@core/util/create';
import {
  extractDateMention,
  extractUserMentions,
} from '@core/util/taskExtraction';
import { markdownToPlainText } from '@lexical-core/utils/parsers';
import type { PropertyInput } from '@service-storage/generated/schemas/propertyInput';

type AiTaskDraft = {
  title: string;
  content: string;
};

const AI_TASK_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    content: { type: 'string' },
  },
  required: ['title', 'content'] as string[],
  additionalProperties: false,
};

function buildTaskPropertyInputs(
  messageContent: string,
  currentUserId?: string
): PropertyInput[] {
  const assigneeUserIds = extractUserMentions(messageContent);
  const dueDate = extractDateMention(messageContent);

  const propertyValues: PropertyInput[] = [
    {
      propertyId: SYSTEM_PROPERTY_IDS.STATUS,
      value: {
        type: 'select_option',
        option_id: PROPERTY_OPTION_IDS.STATUS.NOT_STARTED,
      },
    },
  ];

  if (assigneeUserIds.length > 0) {
    propertyValues.push({
      propertyId: SYSTEM_PROPERTY_IDS.ASSIGNEES,
      value: {
        type: 'multi_entity_reference',
        references: assigneeUserIds.map((userId) => ({
          entity_id: userId,
          entity_type: 'USER' as const,
        })),
      },
    });
  } else if (currentUserId) {
    propertyValues.push({
      propertyId: SYSTEM_PROPERTY_IDS.ASSIGNEES,
      value: {
        type: 'multi_entity_reference',
        references: [
          { entity_id: currentUserId, entity_type: 'USER' as const },
        ],
      },
    });
  }

  if (dueDate) {
    propertyValues.push({
      propertyId: SYSTEM_PROPERTY_IDS.DUE_DATE,
      value: { type: 'date', value: dueDate.toISOString() },
    });
  }

  return propertyValues;
}

function buildPrompt(messageText: string) {
  return `
Convert the following channel message into one actionable task.

Return JSON with:
- title: a concise imperative task title, max 10 words
- content: short markdown with the relevant context needed to complete the task

Rules:
- Do not mention AI or that this task was generated.
- Keep the content concise and useful.
- If the message is already task-like, preserve the original intent.

Channel message:
"""
${messageText}
"""
`.trim();
}

export async function createAiTaskFromMessage(params: {
  messageContent: string;
  currentUserId?: string;
}): Promise<{ documentId: string; title: string; content: string } | null> {
  const messageText = markdownToPlainText(params.messageContent).trim();
  if (!messageText) return null;

  const draft = await structuredOutputCompletion<AiTaskDraft>(
    buildPrompt(messageText),
    AI_TASK_SCHEMA,
    'channel_message_task'
  );

  if (!draft) return null;

  const title = draft.title.trim();
  const content = draft.content.trim() || messageText;
  if (!title) return null;

  const documentId = await createTask({
    title,
    content,
    propertyValues: buildTaskPropertyInputs(
      params.messageContent,
      params.currentUserId
    ),
  });

  if (!documentId) return null;

  return { documentId, title, content };
}
