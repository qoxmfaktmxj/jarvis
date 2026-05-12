/**
 * Shared pagination defaults.
 *
 * `DEFAULT_PAGE_SIZE` is the standard page size for every paginated list/grid.
 * Use this everywhere unless a screen has a documented reason to override.
 * Intentional overrides should hard-code the value inline at the call site so
 * the intent is visible (e.g., admin/menus loads the full tree at limit=200).
 */
export const DEFAULT_PAGE_SIZE = 20;

/**
 * Hard upper bound enforced by Zod input schemas + server actions.
 */
export const MAX_PAGE_SIZE = 100;
