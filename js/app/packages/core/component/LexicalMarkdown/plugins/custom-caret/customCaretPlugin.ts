/**
 * TODO (seamus): Stashing this to return to. Not sure if
 * this will be worth the effort.
 */
function matchCaret(caretElement: HTMLDivElement, selection: Selection | null) {
  // If no selection or multiple ranges, hide cursor
  if (selection === null || selection.rangeCount === 0) {
    caretElement.style.visibility = 'hidden';
    return;
  }

  const range = selection.getRangeAt(0);

  // Hide caret if selection is not collapsed (i.e., text is selected)
  if (!range.collapsed) {
    caretElement.style.visibility = 'hidden';
    return;
  }

  // Make caret visible
  caretElement.style.visibility = 'visible';

  // Get bounding rectangle of the range
  const rect = range.getBoundingClientRect();

  // Update caret position and size
  caretElement.style.height = `${rect.height}px`;
  caretElement.style.left = `${rect.left - 1}px`;
  caretElement.style.top = `${rect.top}px`;
}

export {};
