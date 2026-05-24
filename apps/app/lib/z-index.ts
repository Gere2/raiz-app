/**
 * Centralized z-index constants for consistent layering across the application.
 * Prevents z-index conflicts and makes hierarchy explicit.
 */

export const Z_INDEX = {
  // Base layers
  DROPDOWN: 10,
  MODAL_OVERLAY: 40,
  HEADER: 50,
  BOTTOM_NAV: 50,
  NOTIFICATION: 50,

  // Elevated layers
  TOAST: 60,
  MILK_PICKER: 100,

  // Maximum z-index for critical overlays
  MAX: 100,
} as const;
