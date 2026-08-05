export const useUserInvitesQuery = () => ({ data: { invites: [] } });

export const useJoinTeamMutation = () => ({
  isPending: false,
  mutate: (v: unknown) => console.log('[join-team]', v),
});
