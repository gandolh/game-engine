/**
 * sim-client barrel — re-exports the public API originally in sim-client.ts.
 *
 * Consumers import from "./worker/sim-client" (or "../worker/sim-client") and
 * see an identical surface to the old flat file.
 */

export { SimClient } from "./client";
