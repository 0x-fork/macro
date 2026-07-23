import { useSoup } from '@app/features/next-soup/soup-context';
import { lastExecutedCommand } from '@core/hotkey/state';
import { TOKENS } from '@core/hotkey/tokens';
import { createMemo } from 'solid-js';

export function useNavigatedFromJK() {
  const soup = useSoup();
  const navigatedFromJK = createMemo(() => {
    const hasRows = soup.list.dataSource()
      ? soup.list.items.count() > 0
      : soup.rows().length > 0;
    return (
      hasRows &&
      document.documentElement.getAttribute('data-modality') === 'keyboard' &&
      (lastExecutedCommand()?.hotkeyToken === TOKENS.entity.step.end ||
        lastExecutedCommand()?.hotkeyToken === TOKENS.entity.step.start ||
        lastExecutedCommand()?.hotkeyToken === TOKENS.entity.select.end ||
        lastExecutedCommand()?.hotkeyToken === TOKENS.entity.select.start)
    );
  });
  return { navigatedFromJK };
}
