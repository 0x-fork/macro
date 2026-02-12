import type { Component } from 'solid-js';
import { SoupSidebar } from './SoupSidebar';

/**
 * App-level sidebar wrapper.
 * This component is rendered at the Layout level, outside of splits.
 * Always visible sidebar on the left side of the app.
 */
export const AppSidebar: Component = () => {
  return <SoupSidebar />;
};

export default AppSidebar;
