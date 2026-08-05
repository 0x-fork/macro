export const useUserTeamsQuery = () => ({ data: [] as { name: string }[] });

export const useCreateTeamWithInvitesMutation = () => ({
  isPending: false,
  mutateAsync: async (body: unknown) => {
    console.log('[create-team]', JSON.stringify(body));
  },
});
