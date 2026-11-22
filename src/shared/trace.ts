import { z } from "zod";

const point = z.tuple([z.number(), z.number()]);
const path = z.array(point).min(3).max(4000);

/**
 * A traced design: the outer outline and any interior paths, closed, in
 * image orientation (y down), scaled so the outline's longest side is 1.
 */
export const traceSchema = z
  .object({ outline: path, interior: z.array(path).max(300) })
  .strict();

export type Trace = z.infer<typeof traceSchema>;
export type Point = [number, number];
