/**
 * Normalize a website the admin typed ("https://www.Acme.com/help", "acme.com")
 * into the bare hostname the widget origin check compares against ("acme.com").
 * Returns null for empty input and undefined for input that isn't a valid hostname.
 */
function normalizeDomain(input) {
  if (input === undefined || input === null) return null;
  const raw = String(input).trim().toLowerCase();
  if (!raw) return null;

  let hostname;
  try {
    hostname = new URL(raw.includes('://') ? raw : `https://${raw}`).hostname;
  } catch (e) {
    return undefined;
  }

  hostname = hostname.replace(/^www\./, '');
  if (!/^[a-z0-9.-]+$/.test(hostname) || hostname.startsWith('.') || hostname.endsWith('.')) {
    return undefined;
  }
  return hostname;
}

module.exports = { normalizeDomain };
