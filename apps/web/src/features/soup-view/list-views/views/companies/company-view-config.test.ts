import { describe, expect, it, vi } from 'vitest';
import {
  applyCompanyView,
  captureCompanyView,
  isSoupCompanyViewConfig,
  requestedCompanyTab,
  resolveInitialCompanyView,
  type SoupCompanyViewConfig,
} from './company-view-config';

describe('company saved-view compatibility', () => {
  it('accepts production CRM configs without replacement fields', () => {
    expect(
      isSoupCompanyViewConfig({
        kind: 'crm',
        clientFilters: { and: ['crm-company-active'] },
        sort: ['updated_at'],
      })
    ).toBe(true);
  });

  it('recovers Hidden from production predicate and query formats', () => {
    expect(
      requestedCompanyTab({
        kind: 'crm',
        clientFilters: { and: ['crm-company-hidden'] },
      })
    ).toBe('hidden');
    expect(
      requestedCompanyTab({
        kind: 'crm',
        filters: { include: { crmCompanyHidden: true } },
      })
    ).toBe('hidden');
  });

  it('rejects malformed legacy predicate arrays', () => {
    expect(
      isSoupCompanyViewConfig({
        kind: 'crm',
        clientFilters: { and: 'crm-company-hidden' },
      })
    ).toBe(false);
  });

  it('prefers the explicit active tab over legacy fields', () => {
    expect(
      requestedCompanyTab({
        kind: 'crm',
        activeTab: 'active',
        clientFilters: { and: ['crm-company-hidden'] },
      })
    ).toBe('active');
  });

  it('sanitizes a non-admin Hidden initial config to Active scope', () => {
    const resolved = resolveInitialCompanyView(
      {
        kind: 'crm',
        facets: {
          scope: ['crm-company-hidden'],
          companies: ['hidden'],
          company_stage: ['stage-a'],
        },
        activeTab: 'hidden',
      },
      { allowedTab: () => 'active' }
    );

    expect(resolved.initialState.activeTab).toBe('active');
    expect(resolved.initialState.facets).toEqual({
      scope: ['crm-company-active'],
      companies: ['active'],
      company_stage: ['stage-a'],
    });
  });

  it('maps production stage and owner selections into facets', () => {
    const resolved = resolveInitialCompanyView({
      kind: 'crm',
      stageFilter: ['stage-a'],
      ownerFilter: ['owner-a'],
      searchText: 'macro',
      sort: ['created_at'],
      viewMode: 'list',
    });

    expect(resolved).toEqual({
      initialState: {
        facets: {
          company_stage: ['stage-a'],
          company_owner: ['owner-a'],
        },
        search: 'macro',
        sort: ['created_at'],
        groupBy: undefined,
        activeTab: undefined,
      },
      viewMode: 'list',
    });
  });

  it('captures the complete production company query envelope', () => {
    const config = captureCompanyView(
      {
        facets: { serialize: () => ({}) } as never,
        state: {
          activeTab: 'hidden',
          search: '',
          groupBy: undefined,
          sort: [{ id: 'updated_at', reversed: false }],
        } as never,
      },
      { viewMode: () => 'board' }
    );
    const include = (config.filters as { include: Record<string, unknown> })
      .include;

    expect(include.crmCompanyHidden).toBe(true);
    expect(include.documentId).toEqual([
      '00000000-0000-0000-0000-000000000000',
    ]);
    expect(include.threadId).toEqual(['00000000-0000-0000-0000-000000000000']);
    expect(include.crmCompanyId).toBeUndefined();
    expect(config.clientFilters).toEqual({
      and: ['crm-company-hidden'],
    });
  });

  it('applies an allowed Hidden preset and defaults old configs to board', () => {
    const hydrate = vi.fn();
    const setState = vi.fn();
    const applyTabPreset = vi.fn(() => true);
    const setViewMode = vi.fn();
    const config: SoupCompanyViewConfig = {
      kind: 'crm',
      clientFilters: { and: ['crm-company-hidden'] },
      stageFilter: ['stage-a'],
    };

    applyCompanyView(
      {
        facets: { hydrate } as never,
        setState,
      },
      {
        activePresetFacets: () => ({ scope: ['crm-company-hidden'] }),
        applyTabPreset,
        setViewMode,
      },
      config,
      { allowedTab: (tab) => tab ?? 'active' }
    );

    expect(applyTabPreset).toHaveBeenCalledWith('hidden');
    expect(hydrate).toHaveBeenCalledWith({
      company_stage: ['stage-a'],
      scope: ['crm-company-hidden'],
      companies: ['hidden'],
    });
    expect(setState).toHaveBeenCalledWith({
      search: '',
      groupBy: undefined,
      sort: [{ id: 'updated_at', reversed: false }],
      activeTab: 'hidden',
    });
    expect(setViewMode).toHaveBeenCalledWith('board');
  });
});
