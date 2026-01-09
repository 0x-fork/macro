import IconAI from '@macro-icons/wide/star.svg';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { Avatar, Initials } from './Avatar';

const meta = {
  component: Avatar,
  argTypes: {
    for: {
      control: { type: 'text' },
    },
    src: {
      control: { type: 'text' },
    },
    children: {
      disable: true,
    },
  },
  render: (args) => (
    <div class="text-3xl leading-normal">
      <Avatar {...args} />
    </div>
  ),
} satisfies Meta<typeof Avatar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    for: 'Jacob Beckerman',
  },
};

/** Avatars will display an image if a `src` is provided, falling back to initials (or children if present). */
export const WithImage: Story = {
  args: {
    for: 'Chad G. Petty',
    src: 'https://i.pravatar.cc/300',
  },
};

/** Avatars can also display anything passed as children, eg icons, logos, etc. */
export const WithIcon: Story = {
  args: {
    for: 'Some Document',
    children: <IconAI class="size-full" />,
    class: 'text-surface-0 bg-accent',
  },
};

/** Avatars get their sizing from the line-height of the parent element. */
export const NextToText: Story = {
  args: {
    for: 'Jacob Beckerman',
    class: undefined,
  },
  render: (args: Story['args']) => (
    <ul class="space-y-6">
      <li class="flex items-center gap-1">
        <Avatar {...args} />
        <p>{args.for}</p>
      </li>
      <li class="flex items-center gap-1">
        <Avatar for="Jarvis" class="text-surface-0 bg-accent">
          <IconAI class="size-full" />
        </Avatar>
        <p>Jarvis</p>
      </li>
    </ul>
  ),
};

/** Initials can be customized by passing a custom component as children. Either directly as a string, or with the Initials component: `<Initials of="Donkey Boy" />`. */
export const CustomInitials: Story = {
  args: {
    for: 'Claude Code',
    children: <Initials of="Donkey Boy" />,
  },
  render: (args: Story['args']) => (
    <div class="flex items-center gap-1">
      <Avatar {...args} />
      <p>{args.for}</p>
    </div>
  ),
};
