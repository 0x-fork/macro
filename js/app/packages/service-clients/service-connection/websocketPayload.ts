import { z } from 'zod';

export const jsonStringSchema = z.string().transform((value, ctx) => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid JSON' });
    return z.NEVER;
  }
});

export function websocketPayloadSchema<TSchema extends z.ZodType>(
  schema: TSchema
) {
  return z.union([schema, jsonStringSchema.pipe(schema)]);
}

export function decodeWebsocketPayload(
  type: string,
  payload: unknown
): unknown | undefined {
  if (typeof payload !== 'string') return payload;

  try {
    return JSON.parse(payload) as unknown;
  } catch (error) {
    console.warn(`Malformed ${type} websocket payload`, { payload, error });
    return undefined;
  }
}

export function parseWebsocketPayload<TSchema extends z.ZodType>(
  type: string,
  payload: unknown,
  schema: TSchema
): z.output<TSchema> | undefined {
  const result = websocketPayloadSchema(schema).safeParse(payload);
  if (!result.success) {
    console.warn(`Malformed ${type} websocket payload`, {
      payload,
      error: result.error,
    });
    return undefined;
  }

  return result.data;
}

export function handleWebsocketPayload<TSchema extends z.ZodType>(
  type: string,
  payload: unknown,
  schema: TSchema,
  handle: (payload: z.output<TSchema>) => void
): void {
  const parsedPayload = parseWebsocketPayload(type, payload, schema);
  if (parsedPayload === undefined) return;

  handle(parsedPayload);
}
