// URL params live here (not in signal/location.ts) so light consumers like
// DocumentPreview and notification navigation don't pull the whole PDF viewer
// into the initial bundle.
export const URL_PARAMS = {
  pageNumber: 'pdf_page_number',
  yPos: 'pdf_page_y',
  x: 'pdf_page_x',
  width: 'pdf_width',
  height: 'pdf_height',
  annotationId: 'pdf_ann_id',
  searchPage: 'pdf_search_page',
  searchSnippet: 'pdf_search_snippet',
  searchRawQuery: 'pdf_search_raw_query',
  searchHighlightTerms: 'pdf_search_highlight_terms',
} as const;
