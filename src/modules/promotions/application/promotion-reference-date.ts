export const ARG_TZ = "America/Argentina/Buenos_Aires";

/**
 * Returns a `Date` representing the current instant aligned to the
 * {@link ARG_TZ} (`America/Argentina/Buenos_Aires`) timezone.
 *
 * The returned value is the server-local-time interpretation of the Argentina-
 * local date‑time string; it is therefore NOT a true UTC timestamp. It is
 * designed to be compared against promotion `start_date` / `end_date` values
 * that share the same convention, producing correct active‑range checks.
 */
export function argentinaNow(): Date {
  const now = new Date();
  const argString = now.toLocaleString("en-US", { timeZone: ARG_TZ });
  return new Date(argString);
}
