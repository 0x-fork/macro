import type { Meta, StoryObj } from 'storybook-solidjs-vite';
import { Avatar } from './Avatar';

const meta = {
  component: Avatar,
} satisfies Meta<typeof Avatar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    for: 'Jacob Beckerman',
  },
};
