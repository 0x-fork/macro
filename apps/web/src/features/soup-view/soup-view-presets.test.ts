import {
  compileFacets,
  type Facet,
  NIL_UUID,
} from '@app/features/soup-list/facet-store';
import { PROPERTY_OPTION_IDS, SYSTEM_PROPERTY_IDS } from '@property/constants';
import { describe, expect, it } from 'vitest';
import { getViewPreset } from './soup-view-presets';

describe('facet view presets', () => {
  it('keeps calls confined in the legacy inbox preset', () => {
    const preset = getViewPreset('inbox', 'signal', {
      userId: 'user-1',
      isTeamAdmin: false,
      isNewInbox: false,
    });

    expect(
      compileFacets(preset?.initialFacets ?? {}, preset?.facets ?? [], {}).callf
    ).toEqual({ l: { CallId: NIL_UUID } });
  });

  it('leaves calls open for the runtime missed-call facet in New Inbox', () => {
    const preset = getViewPreset('inbox', 'signal', {
      userId: 'user-1',
      isTeamAdmin: false,
      isNewInbox: true,
    });

    expect(
      compileFacets(preset?.initialFacets ?? {}, preset?.facets ?? [], {}).callf
    ).toBeUndefined();
  });

  it('lets task status refinements replace the tab seed', () => {
    const preset = getViewPreset('tasks', 'assigned-to-me', {
      userId: 'user-1',
      isTeamAdmin: false,
    });
    const compiled = compileFacets(
      {
        ...(preset?.initialFacets ?? {}),
        'task-status': ['task-completed'],
      },
      [
        ...(preset?.facets ?? []),
        {
          id: 'task-status',
          mode: 'or',
          options: [
            {
              id: 'task-completed',
              clause: {
                propf: {
                  field: 'properties',
                  value: {
                    propertyId: SYSTEM_PROPERTY_IDS.STATUS,
                    type: 'select',
                    value: PROPERTY_OPTION_IDS.STATUS.COMPLETED,
                  },
                },
              },
            },
          ],
        } satisfies Facet,
      ],
      {}
    );
    const serialized = JSON.stringify(compiled.propf);

    expect(serialized).toContain(PROPERTY_OPTION_IDS.STATUS.COMPLETED);
    expect(serialized).not.toContain(PROPERTY_OPTION_IDS.STATUS.NOT_STARTED);
  });

  it('hides the Companies hidden tab from non-admin users', () => {
    expect(
      getViewPreset('companies', 'hidden', {
        userId: 'user-1',
        isTeamAdmin: false,
      })
    ).toBeUndefined();
  });
});
