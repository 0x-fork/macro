/** Which fixture the page renders, read from `?scenario=`. */
export const scenario = () =>
  new URLSearchParams(window.location.search).get('scenario') ?? 'prefill';

/** A work-domain user with same-domain contacts vs. a personal-email user. */
export const hasWorkDomain = () => scenario() !== 'plain';
