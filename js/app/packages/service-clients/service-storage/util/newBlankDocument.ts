import type { BlockName } from '@core/block';
import { blockNameToMimeTypes } from '@core/constant/allBlocks';
import { match } from 'ts-pattern';

export function newBlankDocument(blockName: BlockName) {
  const encoder = new TextEncoder();
  return match(blockName)
    .with(
      'md',
      () =>
        new File([encoder.encode('')], '', {
          type: blockNameToMimeTypes['md']?.[0],
        })
    )
    .with(
      'canvas',
      () =>
        new File(
          [encoder.encode('{"nodes": [],"edges": [],"groups": []}')],
          'New Canvas.canvas',
          { type: blockNameToMimeTypes['canvas']?.[0] }
        )
    )
    .otherwise(() => null);
}
