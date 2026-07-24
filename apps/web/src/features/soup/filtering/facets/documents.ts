import { codeFileExtensions } from '@block-code/util/languageSupport';
import type { EntityData } from '@entity';
import { facet } from './base';

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'];
const VIDEO_EXTENSIONS = [
  'mp4',
  'mkv',
  'webm',
  'avi',
  'mov',
  'wmv',
  'mpg',
  'mpeg',
  'm4v',
  'flv',
  'f4v',
  'threegp',
];

export const DOCUMENT_SEARCH_FILE_TYPES: Record<string, readonly string[]> = {
  'doc-markdown': ['md'],
  'doc-snippet': ['md'],
  'doc-canvas': ['canvas'],
  'file-code': codeFileExtensions,
  'file-image': IMAGE_EXTENSIONS,
  'file-pdf': ['pdf'],
  'file-docx': ['docx'],
  'file-video': VIDEO_EXTENSIONS,
};

const hasFileType = (entity: EntityData, fileTypes: readonly string[]) =>
  entity.type === 'document' && fileTypes.includes(entity.fileType ?? '');

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
      predicate: (entity) =>
        entity.type === 'document' &&
        entity.fileType === 'md' &&
        !entity.subType,
    },
    {
      id: 'doc-snippet',
      clause: (b) => ({
        df: b.and(b.eq('fileAssoc', 'assoc:md'), b.eq('subType', 'snippet')),
      }),
      predicate: (entity) =>
        entity.type === 'document' && entity.subType?.type === 'snippet',
    },
    {
      id: 'doc-canvas',
      clause: (b) => ({ df: b.eq('fileAssoc', 'assoc:canvas') }),
      predicate: (entity) => hasFileType(entity, ['canvas']),
    },
    {
      id: 'file-code',
      clause: (b) => ({ df: b.eq('fileAssoc', 'assoc:code') }),
      predicate: (entity) => hasFileType(entity, codeFileExtensions),
    },
    {
      id: 'file-image',
      clause: (b) => ({ df: b.eq('fileAssoc', 'assoc:image') }),
      predicate: (entity) => hasFileType(entity, IMAGE_EXTENSIONS),
    },
    {
      id: 'file-pdf',
      clause: (b) => ({ df: b.eq('fileAssoc', 'assoc:pdf') }),
      predicate: (entity) => hasFileType(entity, ['pdf']),
    },
    {
      id: 'file-docx',
      clause: (b) => ({ df: b.eq('fileAssoc', 'assoc:document') }),
      predicate: (entity) => hasFileType(entity, ['docx']),
    },
    {
      id: 'file-video',
      clause: (b) => ({ df: b.eq('fileAssoc', 'assoc:video') }),
      predicate: (entity) => hasFileType(entity, VIDEO_EXTENSIONS),
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
      predicate: (entity) => {
        if (entity.type !== 'document') return false;
        const fileType = entity.fileType ?? '';
        return (
          !['md', 'canvas', 'pdf', 'docx'].includes(fileType) &&
          !(codeFileExtensions as readonly string[]).includes(fileType) &&
          !IMAGE_EXTENSIONS.includes(fileType) &&
          !VIDEO_EXTENSIONS.includes(fileType)
        );
      },
    },
  ],
});
