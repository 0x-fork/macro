// In-memory seed data for the demo build (single-user, no real backend).
// Extend these collections as you mock additional routes in ./handlers.ts.

export const DEMO_USER = {
  userId: 'demo-user-1',
  email: 'demo@macro.com',
  name: 'Demo User',
  organizationId: 'demo-org-1',
  organizationName: 'Demo Workspace',
};

export const DEMO_PERMISSIONS = {
  userId: DEMO_USER.userId,
  permissions: [],
  email: DEMO_USER.email,
  name: DEMO_USER.name,
  licenseStatus: 'active',
  tutorialComplete: true,
  group: null,
  hasChromeExt: false,
  hasTrialed: false,
  aiDataConsent: true,
  referralCode: null,
};

const now = new Date().toISOString();

export const DEMO_CHANNELS = [
  {
    id: 'demo-channel-general',
    channel_type: 'public',
    name: 'general',
    owner_id: DEMO_USER.userId,
    org_id: 1,
    created_at: now,
    updated_at: now,
    participants: [
      {
        user_id: DEMO_USER.userId,
        channel_id: 'demo-channel-general',
        joined_at: now,
      },
    ],
    latest_message_id: null,
    latest_message_at: null,
    frecency_score: 1,
    interacted_at: now,
    viewed_at: now,
  },
  {
    id: 'demo-channel-design',
    channel_type: 'public',
    name: 'design',
    owner_id: DEMO_USER.userId,
    org_id: 1,
    created_at: now,
    updated_at: now,
    participants: [
      {
        user_id: DEMO_USER.userId,
        channel_id: 'demo-channel-design',
        joined_at: now,
      },
    ],
    latest_message_id: null,
    latest_message_at: null,
    frecency_score: 0.5,
    interacted_at: now,
    viewed_at: now,
  },
];

export const DEMO_DOCS = [
  {
    id: 'demo-doc-welcome',
    name: 'Welcome to Macro',
    item_type: 'document',
    owner_id: DEMO_USER.userId,
    created_at: now,
    updated_at: now,
  },
  {
    id: 'demo-doc-roadmap',
    name: 'Q3 Roadmap',
    item_type: 'document',
    owner_id: DEMO_USER.userId,
    created_at: now,
    updated_at: now,
  },
];

export const DEMO_SOUP_PAGE = {
  items: DEMO_DOCS,
  next_cursor: null,
};
