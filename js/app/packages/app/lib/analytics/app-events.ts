/** Block/entity types tracked across the create/share/lifecycle events. */
export type TrackedEntityType =
  | 'md'
  | 'task'
  | 'snippet'
  | 'code'
  | 'canvas'
  | 'pdf'
  | 'chat'
  | 'project'
  | 'email';

/**
 * Surface an action was initiated from. Open-ended (`string & {}`) so call
 * sites can pass a new source without a type change, while keeping autocomplete
 * for the common ones.
 */
export type TrackedSource =
  | 'launcher'
  | 'mobile_dock'
  | 'command_menu'
  | 'context_menu'
  | 'detail_view'
  | 'list_view'
  | 'checkbox_conversion'
  | 'share_modal'
  | 'forward_to_channel'
  | 'api'
  // eslint-disable-next-line @typescript-eslint/ban-types
  | (string & {});

/** Mirrors the storage AccessLevel enum; null = made private. */
export type ShareAccessLevel = 'view' | 'comment' | 'edit' | 'owner' | null;

export type AppEvents = {
  sign_up: Record<string, unknown>; // payload - include link status
  sign_out: Record<string, unknown>;
  login: Record<string, unknown>; // payload - include link status
  onboarding_start: Record<string, unknown>;
  onboarding_step: Record<string, unknown>; // payload -
  onboarding_completed: Record<string, unknown>;
  login_from_onboarding: Record<string, unknown>;
  mobile_web_welcome_viewed: Record<string, unknown>;
  mobile_web_signup_sent_viewed: Record<string, unknown>;
  onboarding_team_created: { teamId: string; inviteCount: number };
  onboarding_team_skipped: Record<string, unknown>;

  subscription_start: Record<string, unknown>;
  subscription_cancel: Record<string, unknown>;
  subscription_success: Record<string, unknown>;

  sidebar_click: Record<string, unknown>;
  notifications_toggled: Record<string, unknown>;

  references_panel_open: { blockType: string };
  notifications_panel_open: { blockType: string };
  properties_panel_open: { blockType: string };
  share_menu_open: { blockType: string };

  copy_share_link: Record<string, unknown>;
  download: Record<string, unknown>;
  comment_create: { blockType: string };
  comment_update: { blockType: string };
  comment_delete: { blockType: string };
  upload_file: {
    fileType?: string;
    fileName?: string;
    fileSize?: number;
    destination: 'dss' | 'static';
    folder?: boolean;
  };
  upload_error: {
    type: string;
    destination?: 'dss' | 'static';
  };

  command_menu_open: { from: string };
  command_menu_use: { itemType: string };
  create_menu_open: { from: string };
  hotkey_use: Record<string, unknown>;
  preview_panel_use: Record<string, unknown>;
  mentions_menu_use: { itemType: string };
  split_created: { from: string };

  share_entity: Record<string, unknown>; // payload - entity type, location
  create_entity: Record<string, unknown>; // payload - entity type
  delete_entity: Record<string, unknown>; // payload - entity type
  update_entity: Record<string, unknown>; // payload - properties updated and entity type

  task_copy_branch_name: Record<string, unknown>;

  search: Record<string, unknown>;

  theme_changed: { themeId: string };

  ai_message_sent: Record<string, unknown>;
  ai_attachment_add: Record<string, unknown>;

  email_authorized: Record<string, unknown>;
  email_unauthorized: Record<string, unknown>;
  email_message_sent: Record<string, unknown>;

  channel_message_sent: Record<string, unknown>;
  channel_reaction: {
    emoji: string;
    action: 'add' | 'remove';
  };
  channel_participant_add: Record<string, unknown>;
  channel_participant_remove: Record<string, unknown>;

  block_pdf_definition_open: Record<string, unknown>;
  block_pdf_section_open: Record<string, unknown>;

  // --- Entity creation ---------------------------------------------------
  // Fired at the create.ts / projects.ts chokepoints so they capture EVERY
  // creation path (launcher, mobile dock, hotkey, checkbox conversion, API),
  // unlike the legacy `create_entity` which only fires from two UI surfaces.
  document_created: {
    entityType: Extract<TrackedEntityType, 'md' | 'snippet' | 'code' | 'canvas'>;
    entityId: string;
    projectId?: string;
    source?: TrackedSource;
    /** Set for code files. */
    extension?: string;
  };
  task_created: {
    entityId: string;
    projectId?: string;
    source?: TrackedSource;
    hasAssignee: boolean;
    hasDueDate: boolean;
    hasPriority: boolean;
    isSubtask: boolean;
  };
  chat_created: {
    entityId: string;
    source?: TrackedSource;
  };
  project_created: {
    entityId: string;
    parentId?: string;
    source?: TrackedSource;
  };

  // --- Document / file lifecycle -----------------------------------------
  // `entityType` here is the coarse storage ItemType ('document' | 'chat' |
  // 'project' | 'email' | ...) — the fine block subtype is not known at the
  // file-operations layer. Left open-ended to match ItemType without coupling.
  document_renamed: {
    entityType: TrackedEntityType | (string & {});
    entityId: string;
    source?: TrackedSource;
  };
  document_moved: {
    entityType: TrackedEntityType | (string & {});
    entityId: string;
    destProjectId?: string;
    source?: TrackedSource;
  };
  document_duplicated: {
    entityType: TrackedEntityType | (string & {});
    sourceId: string;
    newId?: string;
    source?: TrackedSource;
  };
  document_deleted: {
    entityType: TrackedEntityType | (string & {});
    entityId: string;
    deleteType: 'soft' | 'permanent';
    source?: TrackedSource;
  };

  // --- Sharing -----------------------------------------------------------
  // Typed, complete replacement path for the inconsistent `share_entity`
  // (which still fires alongside these until it is retired).
  document_shared: {
    // Coarse storage ItemType ('document' | 'project' | ...); the share layer
    // does not resolve the fine block subtype.
    entityType: TrackedEntityType | (string & {});
    entityId: string;
    shareMethod: 'public_link' | 'channel' | 'forward_to_channel' | 'user_invite';
    /** null = made private (untracked by the legacy event). */
    accessLevel?: ShareAccessLevel;
    targetType?: 'public' | 'channel' | 'user';
  };
  chat_shared: {
    entityId: string;
    shareMethod: 'public_link' | 'channel' | 'forward_to_channel' | 'user_invite';
    accessLevel?: ShareAccessLevel;
    targetType?: 'public' | 'channel' | 'user';
  };
  email_shared: {
    entityId: string;
    shareMethod: 'channel' | 'forward_to_channel' | 'attachment_public';
    targetType?: 'channel' | 'user';
    /** true when a file attachment was shared rather than the thread itself. */
    attachmentShared?: boolean;
  };

  // --- Task lifecycle ----------------------------------------------------
  // Fired at the property-save chokepoint (queries/properties/entity.ts),
  // gated to task entities.
  task_status_changed: {
    entityId: string;
    previousStatus?: string;
    newStatus: string;
    source?: TrackedSource;
  };
  task_completed: {
    entityId: string;
    source?: TrackedSource;
  };
  task_assignee_changed: {
    entityId: string;
    assigneeCount: number;
    source?: TrackedSource;
  };
  task_priority_changed: {
    entityId: string;
    newPriority?: string;
    source?: TrackedSource;
  };
  task_due_date_changed: {
    entityId: string;
    hasDueDate: boolean;
    source?: TrackedSource;
  };
  task_moved_to_project: {
    entityId?: string;
    newProjectId?: string;
    isBulk: boolean;
    bulkCount?: number;
    source?: TrackedSource;
  };

  // --- Calls (frontend intent + controls) --------------------------------
  // `call_started` here is a frontend proxy: it fires from the starter's client
  // when they join a channel that had no call in progress. Authoritative
  // lifecycle (ended / recording / summary) is deferred to server-side tracking
  // in the Rust call service, since those are webhook/background-job driven.
  call_started: {
    channelId: string;
  };
  call_join_clicked: {
    channelId: string;
    isExistingCall: boolean;
  };
  call_joined: {
    callId?: string;
    channelId: string;
    joinDurationMs?: number;
  };
  call_left: {
    callId?: string;
    channelId: string;
    callDurationSeconds?: number;
    leaveReason?: string;
  };
  call_screen_share_toggled: {
    callId?: string;
    channelId: string;
    enabled: boolean;
  };
};

export type AppEventNames = keyof AppEvents;
