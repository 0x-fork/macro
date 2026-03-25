import { Dynamic } from 'solid-js/web';
import type { ContentHitData } from '../types/search';
import FileTextIcon from '@icon/regular/file-text.svg';
import { cn } from '@ui/utils/classname';
import { getSearchIcon } from './search-helpers';

interface SearchIconProps {
  hit?: ContentHitData;
  class?: string;
}
