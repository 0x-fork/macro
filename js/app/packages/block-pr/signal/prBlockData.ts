import { blockDataSignalAs } from '@core/block';
import type { PrData } from '../definition';

export const blockDataSignal = blockDataSignalAs<PrData>('pr');
