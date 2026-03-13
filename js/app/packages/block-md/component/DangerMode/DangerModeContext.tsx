import {
  createContext,
  createSignal,
  type ParentProps,
  useContext,
} from 'solid-js';
import type { SerializedEditorState } from 'lexical';

export function createDangerModeState() {
  const [dialogOpen, setDialogOpen] = createSignal(false);
  const [active, setActive] = createSignal(false);
  const [config, setConfig] = createSignal<{
    goalType: 'time' | 'wordcount';
    goalValue: number;
  }>({ goalType: 'time', goalValue: 5 });
  const [health, setHealth] = createSignal(1);
  const [checkpoint, setCheckpoint] =
    createSignal<SerializedEditorState | null>(null);
  const [startWordCount, setStartWordCount] = createSignal(0);
  const [timeRemaining, setTimeRemaining] = createSignal(0);

  return {
    dialogOpen,
    setDialogOpen,
    active,
    setActive,
    config,
    setConfig,
    health,
    setHealth,
    checkpoint,
    setCheckpoint,
    startWordCount,
    setStartWordCount,
    timeRemaining,
    setTimeRemaining,
  };
}

export type DangerModeState = ReturnType<typeof createDangerModeState>;

const DangerModeContext = createContext<DangerModeState>();

export function DangerModeProvider(props: ParentProps) {
  const state = createDangerModeState();
  return (
    <DangerModeContext.Provider value={state}>
      {props.children}
    </DangerModeContext.Provider>
  );
}

export function useDangerMode() {
  return useContext(DangerModeContext);
}
