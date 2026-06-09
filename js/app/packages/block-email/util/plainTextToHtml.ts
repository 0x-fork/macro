function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function plainTextToHtml(text: string): string {
  const lines = text.split('\n');
  const inner = lines
    .map((line) => {
      // Empty lines map to '' — the join below already contributes the
      // line break, so emitting <br> here would double the blank lines
      if (!line) return '';
      return `<span style="white-space: pre-wrap;">${escapeHtml(line)}</span>`;
    })
    .join('<br>');
  // An empty body still needs a <br> so the div renders as one blank line
  return `<div>${inner || '<br>'}</div>`;
}
