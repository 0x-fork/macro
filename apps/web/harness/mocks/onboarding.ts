import { hasWorkDomain } from '../scenario';

export const useOnboardingQuery = () => ({
  data: {
    suggested_team_domain: hasWorkDomain() ? 'macro.com' : null,
  },
});
