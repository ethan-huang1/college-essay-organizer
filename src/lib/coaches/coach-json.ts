/**
 * Strip-and-parse for coach responses.
 *
 * Every coach asks its Travila profile for a bare JSON object and receives
 * it as text, because the platform's schema-constrained responseFormat
 * proved unreliable here. Models still occasionally wrap that JSON in a
 * markdown fence anyway, so all four coaches ran exactly the same
 * trim/de-fence/JSON.parse step before looking at their own fields - the one
 * piece of parsing that is genuinely identical across them, and the piece
 * most likely to need tuning if a model's wrapping habits change.
 *
 * Returns null when the text is not JSON at all, so each coach can return
 * its own typed malformed error. What happens to the parsed value - which
 * arrays are required, which entries get dropped, what may legitimately be
 * empty - stays in each coach, where it differs.
 */
export function parseCoachJson(text: string): { value: unknown } | null {
  const stripped = text.trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  try {
    return { value: JSON.parse(stripped) };
  } catch {
    return null;
  }
}
