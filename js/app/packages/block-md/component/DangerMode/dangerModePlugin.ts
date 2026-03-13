import { CLEAR_HISTORY_COMMAND, type LexicalEditor } from 'lexical';
import { toast } from '@core/component/Toast/Toast';
import { createEffect, on } from 'solid-js';
import type { DangerModeState } from './DangerModeContext';
import type { WordcountStats } from '@core/component/LexicalMarkdown/plugins/wordcount/wordcountPlugin';
import type { Store } from 'solid-js/store';

const IDLE_THRESHOLD_MS = 500;
const DEPLETE_DURATION_MS = 4000;
const HEALTH_PER_KEYSTROKE = 0.05;
const HEALTH_FLOOR = 0.3;

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

  // Track content changes and bump health per keystroke
  const removeUpdateListener = editor.registerUpdateListener(
    ({ dirtyLeaves, dirtyElements }) => {
      if (dirtyLeaves.size > 0 || dirtyElements.size > 0) {
        lastContentChangeTime = performance.now();
        if (dangerMode.active()) {
          dangerMode.setStarted(true);
          const current = dangerMode.health();
          dangerMode.setHealth(
            Math.min(1, Math.max(current, HEALTH_FLOOR) + HEALTH_PER_KEYSTROKE)
          );

          // Update words written immediately so the countdown feels responsive
          const config = dangerMode.config();
          if (config.goalType === 'wordcount') {
            const written = Math.max(
              0,
              wordcountStats.totalWords - dangerMode.startWordCount()
            );
            dangerMode.setWordsWritten(written);
          }
        }
      }
    }
  );

  function stopLoop() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    lastFrameTime = null;
  }

  function startLoop() {
    dangerMode.setStarted(false);
    lastContentChangeTime = performance.now();
    lastFrameTime = null;
    if (rafId === null) {
      rafId = requestAnimationFrame(tick);
    }
  }

  function succeed() {
    dangerMode.setActive(false);
    dangerMode.setCheckpoint(null);
    stopLoop();
  }

  function fail() {
    const checkpoint = dangerMode.checkpoint();
    if (checkpoint && editor.getRootElement()) {
      editor.setEditorState(editor.parseEditorState(checkpoint));
      editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined);
    }
    dangerMode.setActive(false);
    dangerMode.setCheckpoint(null);
    toast.failure('You failed, suffer the consequences.');
    stopLoop();
  }

  function tick(now: number) {
    // Guard: bail if deactivated or editor destroyed
    if (!dangerMode.active() || !editor.getRootElement()) {
      stopLoop();
      return;
    }

    // Guard: skip first frame (initialize lastFrameTime)
    if (lastFrameTime === null) {
      lastFrameTime = now;
      rafId = requestAnimationFrame(tick);
      return;
    }

    const dt = now - lastFrameTime;
    lastFrameTime = now;

    // Guard: wait for first keystroke
    if (!dangerMode.started()) {
      rafId = requestAnimationFrame(tick);
      return;
    }

    // — Health depletion —
    const idleTime = now - lastContentChangeTime;
    let currentHealth = dangerMode.health();
    if (idleTime > IDLE_THRESHOLD_MS) {
      currentHealth -= dt / DEPLETE_DURATION_MS;
    }
    currentHealth = Math.max(0, Math.min(1, currentHealth));
    dangerMode.setHealth(currentHealth);

    // — Failure —
    if (currentHealth <= 0) {
      fail();
      return;
    }

    // — Goal progress —
    const config = dangerMode.config();
    if (config.goalType === 'time') {
      const remaining = dangerMode.timeRemaining() - dt;
      dangerMode.setTimeRemaining(remaining);
      if (remaining <= 0) {
        succeed();
        return;
      }
    } else {
      if (dangerMode.wordsWritten() >= config.goalValue) {
        succeed();
        return;
      }
    }

    rafId = requestAnimationFrame(tick);
  }

  // React to activation changes via createEffect instead of polling
  createEffect(
    on(
      () => dangerMode.active(),
      (active, prevActive) => {
        if (active && !prevActive) {
          startLoop();
        } else if (!active && prevActive) {
          stopLoop();
        }
      }
    )
  );

  return () => {
    removeUpdateListener();
    stopLoop();
  };
}

export function dangerModePlugin(props: DangerModePluginProps) {
  return (editor: LexicalEditor) => registerDangerModePlugin(editor, props);
}
