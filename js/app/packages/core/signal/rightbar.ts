import { makePersisted } from '@solid-primitives/storage';
import { createSignal } from 'solid-js';
import type { Attachment, CreateAndSend, Send } from '@core/component/AI/types';

export const [rightbarChatId, setRightbarChatId] = makePersisted(
  createSignal<string | undefined>(undefined),
  {
    name: 'rightbarChatId',
    storage: sessionStorage,
  }
);

// TODO: probably not needed
// NOTE: this can be fully deprecated once sidebar is fully deprecated
export const [rightbarOpenOnce, setRightbarOpenOnce] = makePersisted(
  createSignal(true),
  {
    name: 'rightbarOpenOnce',
  }
);

// Dock chat input state
export const [dockChatText, setDockChatText] = createSignal<string>('');
export const [dockChatAttachments, setDockChatAttachments] =
  createSignal<Attachment[]>([]);

// Rightbar onSend handler registration
let rightbarOnSend: ((request: Send | CreateAndSend) => Promise<void>) | null =
  null;

export const setRightbarOnSend = (
  onSend: (request: Send | CreateAndSend) => Promise<void>
) => {
  rightbarOnSend = onSend;
};

export const getRightbarOnSend = () => {
  return rightbarOnSend;
};
