import { facet } from './base';

export const DOCUMENT_TYPE = facet({
  id: 'type',
  mode: 'or',
  multiple: true,
  options: [
    {
      id: 'doc-markdown',
      clause: (b) => ({
        df: b.and(
          b.eq('fileAssoc', 'assoc:md'),
          b.not(b.eq('subType', 'snippet')),
          b.not(b.eq('subType', 'task'))
        ),
      }),
      predicate: (e) =>
        e.type === 'document' && e.fileType === 'md' && !e.subType,
    },
    {
      id: 'doc-snippet',
      clause: (b) => ({
        df: b.and(b.eq('fileAssoc', 'assoc:md'), b.eq('subType', 'snippet')),
      }),
      predicate: (e) => e.type === 'document' && e.subType?.type === 'snippet',
    },
    {
      id: 'doc-canvas',
      clause: (b) => ({ df: b.eq('fileAssoc', 'assoc:canvas') }),
      predicate: (e) => e.type === 'document' && e.fileType === 'canvas',
    },
    {
      id: 'file-code',
      clause: (b) => ({ df: b.eq('fileAssoc', 'assoc:code') }),
    },
    {
      id: 'file-image',
      clause: (b) => ({ df: b.eq('fileAssoc', 'assoc:image') }),
    },
    { id: 'file-pdf', clause: (b) => ({ df: b.eq('fileAssoc', 'assoc:pdf') }) },
    {
      id: 'file-docx',
      clause: (b) => ({ df: b.eq('fileAssoc', 'assoc:document') }),
    },
    {
      id: 'file-video',
      clause: (b) => ({ df: b.eq('fileAssoc', 'assoc:video') }),
    },
    {
      id: 'file-other',
      clause: (b) => ({
        df: b.and(
          b.eq('fileAssoc', 'assoc:other'),
          b.not(b.eq('fileAssoc', 'assoc:document')),
          b.not(b.eq('fileAssoc', 'assoc:image')),
          b.not(b.eq('fileAssoc', 'assoc:video'))
        ),
      }),
    },
  ],
});
