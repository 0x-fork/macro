/**
 * @vitest-environment jsdom
 */

import { ChannelType } from '@service-storage/generated/schemas/channelType';
import { fireEvent, render, screen } from '@solidjs/testing-library';
import type { JSX } from 'solid-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type AddParticipantsVars = { channelId: string; participants: string[] };
type AddParticipantsCallbacks = {
  onSuccess?: (response: unknown, vars: AddParticipantsVars) => void;
};

const mocks = vi.hoisted(() => ({
  channelType: 'private' as string | undefined,
  participants: [] as { user_id: string }[],
  team: undefined as
    | { team: { id: string }; members: { user_id: string }[] }
    | undefined,
  mutate: vi.fn(),
  mutationCallbacks: undefined as AddParticipantsCallbacks | undefined,
  toastSuccess: vi.fn(),
}));

vi.mock('@core/context/channels', () => ({
  useChannelType: () => () => mocks.channelType,
}));

vi.mock('@queries/channel/channel-participants', () => ({
  useChannelParticipantsQuery: () => ({
    get data() {
      return mocks.participants;
    },
  }),
}));

vi.mock('@queries/team/teams', () => ({
  useCurrentTeamQuery: () => ({
    get data() {
      return mocks.team;
    },
  }),
}));

vi.mock('@queries/channel/participants', () => ({
  useAddParticipantsMutation: (callbacks?: AddParticipantsCallbacks) => {
    mocks.mutationCallbacks = callbacks;
    return { mutate: mocks.mutate };
  },
}));

vi.mock('@core/component/Toast/Toast', () => ({
  toast: { success: mocks.toastSuccess, failure: vi.fn() },
}));

// The user barrel drags service clients into the module graph; the component
// only needs the two pure id helpers.
vi.mock('@core/user', () => ({
  idToDisplayName: (id: string) => id.replace('macro|', '').split('@')[0],
  idToEmail: (id: string) => id.replace('macro|', ''),
}));

vi.mock('@core/component/UserIcon', () => ({
  UserIcon: (props: { id?: string }) => (
    <span data-testid="user-icon" data-user-id={props.id} />
  ),
}));

vi.mock('@phosphor/user-plus.svg', () => ({
  default: () => <span data-testid="user-plus-icon" />,
}));

// Render the Kobalte popover as a transparent passthrough so the content is
// always in the DOM — these tests exercise the invite logic, not the popover
// primitive.
vi.mock('@kobalte/core/popover', () => {
  const Popover: any = (p: { children?: JSX.Element }) => (
    <div>{p.children}</div>
  );
  Popover.Trigger = (p: any) => (
    <button
      type="button"
      aria-label={p['aria-label']}
      data-input-action={p['data-input-action']}
    >
      {p.children}
    </button>
  );
  Popover.Portal = (p: { children?: JSX.Element }) => <div>{p.children}</div>;
  Popover.Content = (p: { children?: JSX.Element }) => <div>{p.children}</div>;
  return { Popover };
});

vi.mock('@ui', () => ({
  Button: (p: any) => p.children,
  Layer: (p: { children?: JSX.Element }) => <>{p.children}</>,
}));

import { InviteTeammatesAction } from './InviteTeammatesAction';

const member = (email: string) => ({ user_id: `macro|${email}` });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.channelType = ChannelType.private;
  mocks.participants = [member('owner@team.com')];
  mocks.team = {
    team: { id: 'team-1' },
    members: [
      member('owner@team.com'),
      member('zoe@team.com'),
      member('amir@team.com'),
    ],
  };
});

function renderAction() {
  return render(() => <InviteTeammatesAction channelId="channel-1" />);
}

describe('InviteTeammatesAction', () => {
  it('lists teammates who are not participants, alphabetically', () => {
    const { container } = renderAction();

    const rows = Array.from(
      container.querySelectorAll('[data-invite-teammate]')
    );
    expect(rows.map((row) => row.getAttribute('data-invite-teammate'))).toEqual(
      ['macro|amir@team.com', 'macro|zoe@team.com']
    );
  });

  it('invites the clicked teammate to the channel', () => {
    const { container } = renderAction();

    const row = container.querySelector(
      '[data-invite-teammate="macro|zoe@team.com"]'
    ) as HTMLElement;
    fireEvent.click(row);

    expect(mocks.mutate).toHaveBeenCalledWith({
      channelId: 'channel-1',
      participants: ['macro|zoe@team.com'],
    });
  });

  it('filters by search and invites the first match on Enter', () => {
    renderAction();

    const search = screen.getByRole('searchbox', { name: 'Search teammates' });
    fireEvent.input(search, { target: { value: 'zoe' } });
    expect(
      screen
        .getByRole('dialog', { name: 'Invite teammates' })
        .querySelectorAll('[data-invite-teammate]')
    ).toHaveLength(1);

    fireEvent.keyDown(search, { key: 'Enter' });
    expect(mocks.mutate).toHaveBeenCalledWith({
      channelId: 'channel-1',
      participants: ['macro|zoe@team.com'],
    });
  });

  it('toasts with the display name after a successful invite', () => {
    renderAction();

    mocks.mutationCallbacks?.onSuccess?.(undefined, {
      channelId: 'channel-1',
      participants: ['macro|zoe@team.com'],
    });

    expect(mocks.toastSuccess).toHaveBeenCalledOnce();
    expect(mocks.toastSuccess.mock.calls[0]?.[0]).toContain('Invite sent to');
  });

  it('explains when everyone on the team is already in the channel', () => {
    mocks.participants = mocks.team?.members ?? [];
    renderAction();

    expect(
      screen.getByText('Everyone on your team is already in this channel.')
    ).toBeTruthy();
  });

  it.each([ChannelType.direct_message, ChannelType.public])(
    'renders nothing for %s channels',
    (channelType) => {
      mocks.channelType = channelType;
      const { container } = renderAction();
      expect(container.innerHTML).toBe('');
    }
  );

  it('renders nothing when the viewer has no team', () => {
    mocks.team = undefined;
    const { container } = renderAction();
    expect(container.innerHTML).toBe('');
  });
});
