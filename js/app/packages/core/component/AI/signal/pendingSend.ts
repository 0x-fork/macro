import type { Attachment, Model } from '@core/component/AI/types';
import { createSignal } from 'solid-js';

export type PendingSend = {
  chatId: string;
  content: string;
  attachments: Attachment[];
  model: Model;
};

const [pendingSend, setPendingSend] = createSignal<PendingSend | null>(null);

export function getPendingSend(chatId: string): PendingSend | null {
  const pending = pendingSend();
  if (pending && pending.chatId === chatId) {
    // Clear it once retrieved
    setPendingSend(null);
    return pending;
  }
  return null;
}

export function setPendingSendForChat(send: PendingSend): void {
  setPendingSend(send);
}
