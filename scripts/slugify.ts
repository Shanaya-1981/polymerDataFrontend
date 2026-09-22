/**
 * Turn a raw CSV header (e.g. `"VFT activation energy (K)"`,
 * `"Comonomer1 MW"`, `"crystalline?"`) into a stable camelCase column id
 * safe to use as an object key / URL query value.
 *
 * "Stable" here just means deterministic and collision-free across the 69
 * columns `build-data.ts` emits — `build-data.ts` asserts that uniqueness
 * at generation time, so a collision fails the build loudly rather than
 * silently overwriting a column.
 *
 * All-uppercase words (`MW`, `DOI`, `SMILES`, `VFT`, single-letter units
 * like `K`/`S`/`T`) are treated as acronyms and kept intact rather than
 * mangled by naive title-casing (`DOI` -> `doi`/`...Doi`, not `dOI`).
 */
export function slugifyHeader(header: string): string {
  const cleaned = header
    .replace(/[?%]/g, "")
    .replace(/[():/]/g, " ")
    .replace(/[*^]/g, " ")
    .trim();

  const parts = cleaned.split(/\s+/).filter((p) => p.length > 0);

  return parts
    .map((part, i) => {
      const isAcronym = part === part.toUpperCase() && /[A-Z]/.test(part);
      if (i === 0) {
        return isAcronym ? part.toLowerCase() : part.charAt(0).toLowerCase() + part.slice(1);
      }
      return isAcronym ? part : part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join("");
}
