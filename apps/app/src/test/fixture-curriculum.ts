import { resolve } from "node:path";

/**
 * The tests' own frozen curriculum (Ceetrix story 13). Frontend tests read lessons,
 * the story and figures from here, never from curriculum/, so editing the book never
 * changes a test result. The running app never reads it.
 */
export const FIXTURE_CURRICULUM = resolve(__dirname, "../../../../fixtures/curriculum");
