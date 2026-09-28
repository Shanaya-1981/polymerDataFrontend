/**
 * Barrel export for the data layer. Prefer importing from `@/data` directly;
 * the individual modules (`@/data/dataset`, `@/data/conductivity`, …) exist
 * mainly to keep this file from becoming one giant module.
 */
export * from "./dataset";
export * from "./conductivity";
export * from "./correlations";
export * from "./categories";
export * from "./temperature-series";
