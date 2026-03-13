import { Dialog } from '@kobalte/core';
import { DialogWrapper } from '@core/component/DialogWrapper';
import { SegmentedControl } from '@core/component/FormControls/SegmentControls';
import { Button } from '@ui/components/Button';
import { createMemo, createSignal, Show } from 'solid-js';
import type { LexicalEditor } from 'lexical';
import type { WordcountStats } from '@core/component/LexicalMarkdown/plugins/wordcount/wordcountPlugin';
import type { Store } from 'solid-js/store';
import { useDangerMode } from './DangerModeContext';
import { useFocusLock } from '@core/util/createControlledOpenSignal';

const GOAL_TYPES = ['Time Limit', 'Word Count'];

function numberToWords(n: number): string {
  const words = [
    'zero',
    'one',
    'two',
    'three',
    'four',
    'five',
    'six',
    'seven',
    'eight',
    'nine',
    'ten',
    'eleven',
    'twelve',
    'thirteen',
    'fourteen',
    'fifteen',
    'sixteen',
    'seventeen',
    'eighteen',
    'nineteen',
    'twenty',
  ];
  if (n >= 0 && n <= 20) return words[n];
  return String(n);
}

export function DangerModeDialog(props: {
  editor: LexicalEditor;
  wordcountStats: Store<WordcountStats>;
}) {
  const dangerMode = useDangerMode();
  if (!dangerMode) return null;
  const focusLock = useFocusLock('danger-mode');
  const [goalType, setGoalType] = createSignal<'Time Limit' | 'Word Count'>(
    'Time Limit'
  );
  const [timeValue, setTimeValue] = createSignal<number | undefined>(5);
  const [wordcountValue, setWordcountValue] = createSignal<number | undefined>(
    150
  );

  const isTimeMode = createMemo(() => goalType() === 'Time Limit');

  const goalValue = createMemo<number | undefined>(() =>
    isTimeMode() ? timeValue() : wordcountValue()
  );
  const setGoalValue = (v: number) =>
    isTimeMode() ? setTimeValue(v) : setWordcountValue(v);

  const getTimeModeString = (plural?: boolean) =>
    isTimeMode() ? `minute${plural && 's'}` : `word${plural && 's'}`;

  const goalLabel = createMemo(() => {
    const val = goalValue();
    if (!val) return null;
    return isTimeMode()
      ? `${numberToWords(val)} minute${val === 1 ? '' : 's'}`
      : `${val} words`;
  });

  const onCommit = () => {
    const snapshot = props.editor.getEditorState().toJSON();
    const currentWords = props.wordcountStats.totalWords;
    const val = goalValue();
    if (!val) return;

    dangerMode.setCheckpoint(snapshot);
    dangerMode.setStartWordCount(currentWords);

    if (isTimeMode()) {
      dangerMode.setConfig({ goalType: 'time', goalValue: val });
      dangerMode.setTimeRemaining(val * 60 * 1000);
    } else {
      dangerMode.setConfig({ goalType: 'wordcount', goalValue: val });
      dangerMode.setTimeRemaining(0);
    }

    dangerMode.setHealth(1);
    dangerMode.setActive(true);
    dangerMode.setDialogOpen(false);
  };

  return (
    <Dialog.Root
      open={dangerMode.dialogOpen()}
      onOpenChange={(open) => {
        if (open) {
          focusLock.acquire();
        } else {
          focusLock.release();
        }
        dangerMode.setDialogOpen(open);
      }}
    >
      <Dialog.Portal>
        <DialogWrapper width="480px">
          <div class="flex flex-col gap-6 p-4">
            <div>
              <h2 class="text-ink text-lg font-semibold font-sans leading-7">
                Danger Mode
              </h2>
              <p class="text-ink-muted mt-1">
                You have goals, are you ready to achieve them?
              </p>
            </div>

            <div class="flex flex-col gap-3">
              {' '}
              <SegmentedControl
                list={GOAL_TYPES}
                value={goalType()}
                onChange={(val) =>
                  setGoalType(val as 'Time Limit' | 'Word Count')
                }
              />
              <div class="flex gap-3 items-center">
                <input
                  type="number"
                  min={1}
                  value={goalValue()}
                  onInput={(e) =>
                    setGoalValue(
                      Math.max(1, parseInt(e.currentTarget.value) || 1)
                    )
                  }
                  placeholder="#"
                  class="font-mono border border-edge rounded bg-panel text-ink p-2 w-[6ch]"
                />
                <p>{getTimeModeString(true)}</p>
              </div>
            </div>

            <Show
              when={goalLabel()}
              fallback={
                <p>
                  Choose how {isTimeMode() ? 'long' : 'many words'} you want to
                  write{isTimeMode() ? ' for' : ''}.
                </p>
              }
            >
              <p>
                Write {isTimeMode() ? 'for ' : ''}
                <strong>{goalLabel()}</strong>, or your work will be destroyed.
              </p>
            </Show>

            <div class="flex justify-end gap-3 pt-1">
              <Button
                variant="secondary"
                onClick={() => dangerMode.setDialogOpen(false)}
              >
                Too scary
              </Button>
              <Button
                variant="destructive"
                disabled={!goalValue()}
                onClick={onCommit}
              >
                Commit
              </Button>
            </div>
          </div>
        </DialogWrapper>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
