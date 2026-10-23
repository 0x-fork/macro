import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import { createSignal, type JSX } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import type { CalendarInvitation } from '../core/calendar-invitation';
import { invitationFixture } from '../core/calendar-invitation-fixtures';
import type { EmailMessage } from '../core/email-message';
import { EmailMessageView } from './email-message';

vi.mock('@app/features/email-message/components/message-card', () => ({
  MessageCard: (props: { children: JSX.Element }) => (
    <div>{props.children}</div>
  ),
}));
vi.mock('@app/features/email-message/components/email-message-top-bar', () => ({
  EmailMessageTopBar: () => null,
}));
vi.mock('@app/features/email-message/views/email-message-body', () => ({
  EmailMessageBody: () => null,
}));
vi.mock('@app/features/email-message/components/collapsed-message', () => ({
  CollapsedMessage: () => null,
}));
vi.mock('@app/features/email-message/components/attachment-pill', () => ({
  EmailAttachmentPill: (props: {
    attachment: { fileName: string };
    onClick?: () => void;
  }) => (
    <button type="button" onClick={() => props.onClick?.()}>
      {props.attachment.fileName}
    </button>
  ),
}));
vi.mock('@core/component/ImageGalleryPreview', () => ({
  ImageGalleryPreview: () => null,
}));
vi.mock('@core/component/VideoPreview', () => ({ VideoPreview: () => null }));
vi.mock('../components/calendar-invite-card', () => ({
  CalendarInviteCard: () => null,
}));
afterEach(cleanup);

const calendarFile = {
  db_id: 'ics',
  filename: 'Planning.ics',
  mime_type: 'text/calendar',
};
const pdfFile = {
  db_id: 'pdf',
  filename: 'Agenda.pdf',
  mime_type: 'application/pdf',
};

function message(invitations: CalendarInvitation[]): EmailMessage {
  return {
    db_id: 'message',
    attachments: [calendarFile, pdfFile],
    attachments_draft: [],
    attachments_forwarded: [],
    calendar_invitations: invitations,
  } as unknown as EmailMessage;
}

it('keeps invitation cards mounted when the thread refreshes the message', () => {
  const [current, setCurrent] = createSignal(message([invitationFixture]));
  const renderInvitation = vi.fn(
    (_message: EmailMessage, invitation: CalendarInvitation) => (
      <div data-testid="card">{invitation.id}</div>
    )
  );
  render(() => (
    <EmailMessageView
      message={current()}
      renderInvitation={renderInvitation}
      isTouch={false}
      isPersonal={false}
      isSelected={false}
      allowHover={false}
      isExpanded
    />
  ));
  const card = screen.getByTestId('card');
  setCurrent(message([structuredClone(invitationFixture)]));
  expect(screen.getByTestId('card')).toBe(card);
  expect(renderInvitation).toHaveBeenCalledOnce();
});

it('opens a calendar file as the event it holds and other files through the host', () => {
  const onOpenAttachment = vi.fn();
  const onDownloadAttachment = vi.fn();
  render(() => (
    <EmailMessageView
      message={message([invitationFixture])}
      renderInvitation={(_message, invitation) => (
        <div data-testid="card">{invitation.id}</div>
      )}
      onOpenAttachment={onOpenAttachment}
      onDownloadAttachment={onDownloadAttachment}
      isTouch={false}
      isPersonal={false}
      isSelected={false}
      allowHover={false}
      isExpanded
    />
  ));
  fireEvent.click(screen.getByRole('button', { name: 'Planning.ics' }));
  const preview = screen.getByRole('dialog');
  expect(preview.textContent).toContain(invitationFixture.id);
  fireEvent.click(screen.getByRole('button', { name: 'Download .ics' }));
  expect(onDownloadAttachment).toHaveBeenCalledWith(calendarFile);
  expect(onOpenAttachment).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Agenda.pdf' }));
  expect(onOpenAttachment).toHaveBeenCalledWith(pdfFile);
});

it('hands a calendar file without a readable event to the host', () => {
  const onOpenAttachment = vi.fn();
  render(() => (
    <EmailMessageView
      message={message([])}
      onOpenAttachment={onOpenAttachment}
      isTouch={false}
      isPersonal={false}
      isSelected={false}
      allowHover={false}
      isExpanded
    />
  ));
  fireEvent.click(screen.getByRole('button', { name: 'Planning.ics' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(onOpenAttachment).toHaveBeenCalledWith(calendarFile);
});
