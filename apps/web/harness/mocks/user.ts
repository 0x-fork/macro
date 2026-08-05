import { hasWorkDomain } from '../scenario';

/** Mirrors the real hook: a hook returning an Accessor<string | undefined>. */
export const useEmail = () => () =>
  hasWorkDomain() ? 'jacob@macro.com' : 'jacob@gmail.com';
