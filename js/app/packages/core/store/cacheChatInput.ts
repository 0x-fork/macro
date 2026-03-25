import { makePersisted } from '@solid-primitives/storage';
import { createStore } from 'solid-js/store';

const [, setCachedInputStore] = makePersisted(
  createStore<
    Partial<{
      [key: string]: string;
    }>
  >({}),
  {
    name: 'cachedChatInputStore',
  }
);
export { setCachedInputStore };
