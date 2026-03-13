import { CLEAR_HISTORY_COMMAND, type LexicalEditor } from 'lexical';
import { toast } from '@core/component/Toast/Toast';
import type { DangerModeState } from './DangerModeContext';
import type { WordcountStats } from '@core/component/LexicalMarkdown/plugins/wordcount/wordcountPlugin';
import type { Store } from 'solid-js/store';

const IDLE_THRESHOLD_MS = 500;
const DEPLETE_DURATION_MS = 4000;
const HEALTH_PER_KEYSTROKE = 0.05; // 5% per content change

type DangerModePluginProps = {
  dangerMode: DangerModeState;
  wordcountStats: Store<WordcountStats>;
};

function registerDangerModePlugin(
  editor: LexicalEditor,
  props: DangerModePluginProps
) {
  const { dangerMode, wordcountStats } = props;

  let lastContentChangeTime = performance.now();
  let rafId: number | null = null;
  let lastFrameTime: number | null = null;
  let started = false; // true after first keystroke in a session

  // Track content changes and bump health per keystroke
  const removeUpdateListener = editor.registerUpdateListener(
    ({ dirtyLeaves, dirtyElements }) => {
      if (dirtyLeaves.size > 0 || dirtyElements.size > 0) {
        lastContentChangeTime = performance.now();
        if (dangerMode.active()) {
          started = true;
          const current = dangerMode.health();
          const HEALTH_FLOOR = 0.3;
          dangerMode.setHealth(
            Math.min(1, Math.max(current, HEALTH_FLOOR) + HEALTH_PER_KEYSTROKE)
          );
        }
      }
    }
  );

  function tick(now: number) {
    if (!dangerMode.active()) {
      rafId = null;
      lastFrameTime = null;
      return;
    }

    if (lastFrameTime === null) {
      lastFrameTime = now;
      rafId = requestAnimationFrame(tick);
      return;
    }

    const dt = now - lastFrameTime;
    lastFrameTime = now;

    // Wait for first keystroke before starting depletion and countdown
    if (!started) {
      rafId = requestAnimationFrame(tick);
      return;
    }

    const idleTime = now - lastContentChangeTime;
    let currentHealth = dangerMode.health();

    // Deplete health when idle
    if (idleTime > IDLE_THRESHOLD_MS) {
      currentHealth -= dt / DEPLETE_DURATION_MS;
    }

    currentHealth = Math.max(0, Math.min(1, currentHealth));
    dangerMode.setHealth(currentHealth);

    // Check for failure
    if (currentHealth <= 0) {
      const checkpoint = dangerMode.checkpoint();
      if (checkpoint) {
        editor.setEditorState(editor.parseEditorState(checkpoint));
        editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined);
      }
      dangerMode.setActive(false);
      dangerMode.setCheckpoint(null);
      toast.failure('You failed, suffer the consequences.');
      rafId = null;
      lastFrameTime = null;
      return;
    }

    // Time mode: decrement remaining time
    const config = dangerMode.config();
    if (config.goalType === 'time') {
      const remaining = dangerMode.timeRemaining() - dt;
      dangerMode.setTimeRemaining(remaining);

      if (remaining <= 0) {
        // Success!
        dangerMode.setActive(false);
        dangerMode.setCheckpoint(null);
        rafId = null;
        lastFrameTime = null;
        return;
      }
    }

    // Word count mode: check if goal reached
    if (config.goalType === 'wordcount') {
      const wordsWritten =
        wordcountStats.totalWords - dangerMode.startWordCount();
      // Store words written in timeRemaining for the overlay to read
      dangerMode.setTimeRemaining(wordsWritten);

      if (wordsWritten >= config.goalValue) {
        // Success!
        dangerMode.setActive(false);
        dangerMode.setCheckpoint(null);
        rafId = null;
        lastFrameTime = null;
        return;
      }
    }

    rafId = requestAnimationFrame(tick);
  }

  // Watch for activation
  let prevActive = dangerMode.active();

  const checkInterval = setInterval(() => {
    const currentActive = dangerMode.active();
    if (currentActive && !prevActive) {
      // Just activated — wait for first keystroke
      started = false;
      lastContentChangeTime = performance.now();
      lastFrameTime = null;
      if (rafId === null) {
        rafId = requestAnimationFrame(tick);
      }
    }
    prevActive = currentActive;
  }, 100);

  // Start immediately if already active
  if (dangerMode.active() && rafId === null) {
    lastContentChangeTime = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  return () => {
    removeUpdateListener();
    clearInterval(checkInterval);
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
    }
  };
}

export function dangerModePlugin(props: DangerModePluginProps) {
  return (editor: LexicalEditor) => registerDangerModePlugin(editor, props);
}
