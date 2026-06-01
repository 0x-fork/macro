import { currentThemeId, isThemeSaved, themes } from '../signals/themeSignals';
import { useAnalytics } from 'app/component/analytics-context';
import { applyTheme } from '../utils/themeUtils';
import { ColorSwatch } from './ColorSwatch';
import { ThemeCrud } from './ThemeCrud';

import { For } from 'solid-js';

function ThemeList() {
  const analytics = useAnalytics()

  return (
      <>
        <style>{`
          .theme-row {
            transition: background-color var(--transition), color var(--transition);
          }
          .theme-row:has(.theme-row-clickable:hover) {
            background-color: var(--color-hover);
          }
          .theme-row.current-theme {
            color: var(--a0);
          }
          .theme-row-clickable:hover {
            color: var(--a0);
          }
          .theme-row .theme-row-crud {
            opacity: 0;
            transition: opacity var(--transition);
          }
          .theme-row:hover .theme-row-crud,
          .theme-row:focus-within .theme-row-crud {
            opacity: 1;
          }
        `}</style>

        <div
          style="
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            column-gap: 0.5rem;
            font-size: 14px;
          "
        >
          <For each={themes()}>
            {(theme) => (
              <div
                class={`theme-row ${theme.id === currentThemeId() && isThemeSaved() ? 'current-theme' : ''}`}
                style="
                  box-sizing: border-box;
                  align-items: center;
                  padding: 0.375rem 0.5rem;
                  display: flex;
                  gap: 0.75rem;
                  border-radius: 0.375rem;
                "
              >
                <div
                  onClick={() => {
                    analytics.track('theme_changed', { themeId: theme.id });
                    applyTheme(theme.id);
                  }}
                  class="theme-row-clickable"
                  style="
                    align-items: center;
                    display: flex;
                    gap: 0.75rem;
                    cursor: pointer;
                    flex: 1;
                    min-width: 0;
                  "
                >
                  <div style="display: flex; gap: 3px; flex-shrink: 0;">
                    <ColorSwatch
                      color={`oklch(${theme.tokens.a0.l} ${theme.tokens.a0.c} ${theme.tokens.a0.h}deg)`}
                      width={'14px'}
                      height={'14px'}
                    />
                    <ColorSwatch
                      color={`oklch(${theme.tokens.b0.l} ${theme.tokens.b0.c} ${theme.tokens.b0.h}deg)`}
                      width={'14px'}
                      height={'14px'}
                    />
                    <ColorSwatch
                      color={`oklch(${theme.tokens.c0.l} ${theme.tokens.c0.c} ${theme.tokens.c0.h}deg)`}
                      width={'14px'}
                      height={'14px'}
                    />
                  </div>
                  <span
                    style="
                      white-space: nowrap;
                      overflow: hidden;
                      text-overflow: ellipsis;
                    "
                  >
                    {theme.name}
                  </span>
                </div>
                <div class="theme-row-crud">
                  <ThemeCrud themeId={theme.id} />
                </div>
              </div>
            )}
          </For>
        </div>
      </>
  );
}

export default ThemeList;
