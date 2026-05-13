import { type Accessor, createEffect, createSignal, on } from 'solid-js';

export type FindBarSourceContext = {
  isOpen: Accessor<boolean>;
  submittedQuery: Accessor<string>;
  activeIndex: Accessor<number>;
};

export type FindBarSource<T> = {
  results: Accessor<T[]>;
  isFetching: Accessor<boolean>;
  navigate: (result: T) => void;
  validateText?: (text: string) => boolean;
  totalCount?: Accessor<number | undefined>;
  /**
   * Bidirectional lookup by 1-based global index. When provided, the
   * controller consults this for navigation (so an asc-pre-fetched tail can
   * answer high indices instantly) and only falls back to `results()[idx-1]`
   * when unset. Returns undefined if the index hasn't been loaded yet.
   */
  resultAt?: (index: number) => T | undefined;
  /**
   * Load enough pages so the 1-based `index` is resolvable. Used for
   * backward wraparound (jump to globally-last) and forward extension when
   * the prefetch hasn't caught up.
   */
  loadToIndex?: (index: number) => Promise<void>;
};

export type FindBarController = {
  isOpen: Accessor<boolean>;
  query: Accessor<string>;
  setQuery: (value: string) => void;
  submittedQuery: Accessor<string>;
  activeIndex: Accessor<number>;
  hasUnsubmittedChanges: Accessor<boolean>;
  isPending: Accessor<boolean>;
  resultsCount: Accessor<number>;
  open: () => void;
  close: () => void;
  submit: () => void;
  next: () => void;
  previous: () => void;
  setInputEl: (el: HTMLInputElement | undefined) => void;
};

export type FindBarControllerOptions = {
  /**
   * Fires synchronously inside `submit()` *before* `submittedQuery` updates.
   * Lets callers run side-effects (e.g. clearing an existing selection)
   * that must complete before downstream results-driven effects run.
   */
  onBeforeSubmit?: () => void;
};

export function createFindBarController<T>(
  makeSource: (ctx: FindBarSourceContext) => FindBarSource<T>,
  options: FindBarControllerOptions = {}
): FindBarController {
  const [isOpen, setIsOpen] = createSignal(false);
  const [query, setQuery] = createSignal('');
  const [submittedQuery, setSubmittedQuery] = createSignal('');
  const [activeIndex, setActiveIndex] = createSignal(0);
  const [inputEl, setInputEl] = createSignal<HTMLInputElement>();

  const source = makeSource({ isOpen, submittedQuery, activeIndex });
  const validateText = source.validateText ?? ((text) => text.length > 0);

  const total = () => source.totalCount?.() ?? source.results().length;
  const resolve = (idx: number): T | undefined =>
    source.resultAt?.(idx) ?? source.results()[idx - 1];

  createEffect(
    on(source.results, (rs) => {
      if (!isOpen()) return;
      const cap = total();
      if (cap === 0 && rs.length === 0) {
        setActiveIndex(0);
        return;
      }
      const current = activeIndex();
      const nextIdx =
        current === 0 ? 1 : Math.max(1, Math.min(current, cap || rs.length));
      const item = resolve(nextIdx);
      if (item) {
        setActiveIndex(nextIdx);
        source.navigate(item);
      }
    })
  );

  const step = (delta: 1 | -1) => {
    const cap = total();
    if (cap === 0) return;
    const current = activeIndex();
    const desired =
      delta === 1
        ? current >= cap
          ? 1
          : current + 1
        : current <= 1
          ? cap
          : current - 1;

    const immediate = resolve(desired);
    if (immediate) {
      setActiveIndex(desired);
      source.navigate(immediate);
      return;
    }

    if (source.loadToIndex) {
      source.loadToIndex(desired).then(() => {
        const item = resolve(desired);
        if (item) {
          setActiveIndex(desired);
          source.navigate(item);
        }
      });
    }
  };

  const next = () => step(1);
  const previous = () => step(-1);

  const submit = () => {
    const trimmed = query().trim();
    options.onBeforeSubmit?.();
    setSubmittedQuery(validateText(trimmed) ? trimmed : '');
  };

  const open = () => {
    if (!isOpen()) {
      setIsOpen(true);
      return;
    }
    const el = inputEl();
    if (el && document.activeElement === el) {
      setIsOpen(false);
      return;
    }
    el?.focus();
    el?.select();
  };

  const close = () => {
    setIsOpen(false);
    setSubmittedQuery('');
    setActiveIndex(0);
  };

  return {
    isOpen,
    query,
    setQuery: (value) => setQuery(value),
    submittedQuery,
    activeIndex,
    hasUnsubmittedChanges: () => query().trim() !== submittedQuery(),
    isPending: () => !!submittedQuery() && source.isFetching(),
    resultsCount: () => source.totalCount?.() ?? source.results().length,
    open,
    close,
    submit,
    next,
    previous,
    setInputEl: (el) => setInputEl(el),
  };
}
