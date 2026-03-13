import { createSignal } from 'solid-js';
import { makePersisted } from '@solid-primitives/storage';

export const [dangerModeEnabled, setDangerModeEnabled] = makePersisted(
  createSignal(false),
  { name: 'dangerModeEnabled' }
);
