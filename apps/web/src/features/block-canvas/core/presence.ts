import type { PeerPresence } from '@macro-inc/graphics/loro';
import { z } from 'zod';

const finite = z.number().finite();
const point = z.object({ x: finite, y: finite });
const presenceSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
  color: z.string().max(100),
  cursor: point.nullable(),
  selectedIds: z.array(z.string().max(200)).max(1000),
  clock: z.record(z.string(), z.number().int().nonnegative()),
  preview: z
    .object({
      kind: z.enum([
        'draw',
        'move',
        'resize',
        'scale',
        'rotate',
        'radius',
        'marquee',
      ]),
      shapes: z
        .array(
          z.object({
            id: z.string().max(200),
            kind: z.enum(['rectangle', 'ellipse', 'pencil']),
            width: finite.nonnegative(),
            height: finite.nonnegative(),
            world: z.tuple([finite, finite, finite, finite, finite, finite]),
            pencil: z
              .object({
                points: z.array(z.tuple([finite, finite, finite])).max(2048),
                simulatePressure: z.boolean(),
              })
              .optional(),
            strokeWidth: finite.nonnegative().optional(),
            cornerRadius: finite.nonnegative().optional(),
          })
        )
        .max(256)
        .refine((shapes) =>
          shapes.every((shape) => shape.kind !== 'pencil' || !!shape.pencil)
        ),
      box: point
        .extend({ width: finite.nonnegative(), height: finite.nonnegative() })
        .nullable(),
    })
    .nullable(),
});

/** Presence is untrusted ephemeral input; invalid packets never reach rendering. */
export function decodeCanvasPresence(value: string): PeerPresence | null {
  if (typeof value !== 'string' || value.length > 128_000) return null;
  try {
    const parsed = presenceSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
