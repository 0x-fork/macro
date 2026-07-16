/**
 * Queries and mutations for the Documentation feature: team docs sites,
 * their nav trees, and the publish flow. All `/documentation/*` calls go
 * through `storageServiceClient.documentation`.
 */

import { throwOnErr } from '@core/util/result';
import { storageServiceClient } from '@service-storage/client';
import type { CreateNavNodeRequest } from '@service-storage/generated/schemas/createNavNodeRequest';
import type { CreateSiteRequest } from '@service-storage/generated/schemas/createSiteRequest';
import type { PatchNavNodeRequest } from '@service-storage/generated/schemas/patchNavNodeRequest';
import type { PatchSiteRequest } from '@service-storage/generated/schemas/patchSiteRequest';
import { useMutation, useQuery } from '@tanstack/solid-query';
import type { Accessor } from 'solid-js';
import { queryClient } from '../client';
import { documentationKeys } from './keys';

const AVAILABILITY_STALE_TIME = 60 * 1000;
const SITES_STALE_TIME = 30 * 1000;
/** Poll cadence for a site while a publish is running. */
const BUILD_POLL_INTERVAL = 2 * 1000;

export type { CreateNavNodeRequest, CreateSiteRequest };

/**
 * Whether Documentation is available to the caller's team: `plan_ok`
 * (team-plan requirement) and `enabled` (team-level toggle). Distinct from
 * the PostHog rollout flag, which gates the UI entirely.
 */
export function useDocumentationAvailabilityQuery(enabled?: Accessor<boolean>) {
  return useQuery(() => ({
    queryKey: documentationKeys.availability.queryKey,
    queryFn: () =>
      throwOnErr(() => storageServiceClient.documentation.getAvailability()),
    staleTime: AVAILABILITY_STALE_TIME,
    enabled: enabled?.() ?? true,
  }));
}

export function invalidateDocumentationAvailability() {
  void queryClient.invalidateQueries({
    queryKey: documentationKeys.availability.queryKey,
  });
}

/** The team's documentation sites, newest first. */
export function useDocumentationSitesQuery(enabled: Accessor<boolean>) {
  return useQuery(() => ({
    queryKey: documentationKeys.sites.queryKey,
    queryFn: async () => {
      const response = await throwOnErr(() =>
        storageServiceClient.documentation.listSites()
      );
      return response.sites;
    },
    staleTime: SITES_STALE_TIME,
    enabled: enabled(),
  }));
}

/**
 * A site with its nav tree and latest build. Polls while a build is
 * pending/in-progress so the publish bar tracks completion live.
 */
export function useDocumentationSiteQuery(siteId: Accessor<string | null>) {
  return useQuery(() => {
    const id = siteId();
    return {
      queryKey: documentationKeys.site(id ?? '').queryKey,
      queryFn: () => {
        if (!id) throw new Error('site id is required');
        return throwOnErr(() =>
          storageServiceClient.documentation.getSite({ siteId: id })
        );
      },
      enabled: !!id,
      // Poll while the latest build is still running so the publish bar
      // tracks completion live.
      refetchInterval: (query) => {
        const status = query.state.data?.latest_build?.status;
        return status === 'pending' || status === 'in_progress'
          ? BUILD_POLL_INTERVAL
          : false;
      },
    };
  });
}

function invalidateSites() {
  void queryClient.invalidateQueries({
    queryKey: documentationKeys.sites.queryKey,
  });
}

function invalidateSite(siteId: string) {
  void queryClient.invalidateQueries({
    queryKey: documentationKeys.site(siteId).queryKey,
  });
  invalidateSites();
}

export function useCreateDocumentationSiteMutation() {
  return useMutation(() => ({
    mutationFn: (body: CreateSiteRequest) =>
      throwOnErr(() => storageServiceClient.documentation.createSite({ body })),
    onSuccess: () => invalidateSites(),
  }));
}

export function usePatchDocumentationSiteMutation() {
  return useMutation(() => ({
    mutationFn: (args: { siteId: string; body: PatchSiteRequest }) =>
      throwOnErr(() => storageServiceClient.documentation.patchSite(args)),
    onSuccess: (_data, args) => invalidateSite(args.siteId),
  }));
}

export function useDeleteDocumentationSiteMutation() {
  return useMutation(() => ({
    mutationFn: (args: { siteId: string }) =>
      throwOnErr(() => storageServiceClient.documentation.deleteSite(args)),
    onSuccess: () => invalidateSites(),
  }));
}

export function useSetDocumentationCustomDomainMutation() {
  return useMutation(() => ({
    mutationFn: (args: { siteId: string; customDomain: string | null }) =>
      throwOnErr(() =>
        storageServiceClient.documentation.setCustomDomain(args)
      ),
    onSuccess: (_data, args) => invalidateSite(args.siteId),
  }));
}

export function useCreateDocumentationNavNodeMutation() {
  return useMutation(() => ({
    mutationFn: (args: { siteId: string; body: CreateNavNodeRequest }) =>
      throwOnErr(() => storageServiceClient.documentation.createNavNode(args)),
    onSuccess: (_data, args) => invalidateSite(args.siteId),
  }));
}

export function usePatchDocumentationNavNodeMutation() {
  return useMutation(() => ({
    mutationFn: (args: {
      siteId: string;
      nodeId: string;
      body: PatchNavNodeRequest;
    }) =>
      throwOnErr(() => storageServiceClient.documentation.patchNavNode(args)),
    onSuccess: (_data, args) => invalidateSite(args.siteId),
  }));
}

export function useMoveDocumentationNavNodeMutation() {
  return useMutation(() => ({
    mutationFn: (args: {
      siteId: string;
      nodeId: string;
      parentId: string | null;
      position: number;
    }) =>
      throwOnErr(() => storageServiceClient.documentation.moveNavNode(args)),
    onSuccess: (_data, args) => invalidateSite(args.siteId),
  }));
}

export function useDeleteDocumentationNavNodeMutation() {
  return useMutation(() => ({
    mutationFn: (args: { siteId: string; nodeId: string }) =>
      throwOnErr(() => storageServiceClient.documentation.deleteNavNode(args)),
    onSuccess: (_data, args) => invalidateSite(args.siteId),
  }));
}

export function usePublishDocumentationSiteMutation() {
  return useMutation(() => ({
    mutationFn: (args: { siteId: string }) =>
      throwOnErr(() => storageServiceClient.documentation.publishSite(args)),
    onSuccess: (_data, args) => invalidateSite(args.siteId),
  }));
}

/**
 * Creates a fresh markdown document to back a new documentation page.
 * Returns the new document id.
 */
export function useCreatePageDocumentMutation() {
  return useMutation(() => ({
    mutationFn: async (args: { title: string }) => {
      const response = await throwOnErr(() =>
        storageServiceClient.createMarkdownDocument({
          documentName: args.title,
          markdown: `# ${args.title}\n`,
        })
      );
      return response;
    },
  }));
}
