const OFFICIAL_HOSTS = new Set(["law.go.kr", "moel.go.kr", "scourt.go.kr", "open.example.go.kr"]);
const PATHSPEC_META = /[*?\[\]:@{}!]/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

export function isAllowedOfficialUrl(value: string | null): boolean {
  if (!value) {
    return false;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" && OFFICIAL_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function normalizeWikiPath(value: string): string | null {
  const normalized = value.normalize("NFC");
  if (
    normalized !== value ||
    !normalized ||
    normalized.includes("\\") ||
    normalized.startsWith("/") ||
    normalized.startsWith("//") ||
    /^[A-Za-z]:/.test(normalized)
  ) {
    return null;
  }

  const segments = normalized.split("/");
  if (
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        segment.toLowerCase() === ".git" ||
        PATHSPEC_META.test(segment) ||
        CONTROL.test(segment) ||
        segment.endsWith(".") ||
        segment.endsWith(" ") ||
        WINDOWS_RESERVED.test(segment),
    )
  ) {
    return null;
  }

  const leaf = segments.at(-1);
  if (
    (segments[0] !== "auto" && segments[0] !== "manual") ||
    segments.length < 2 ||
    !leaf ||
    leaf === ".md" ||
    !leaf.endsWith(".md")
  ) {
    return null;
  }
  return segments.join("/");
}

export function buildCitationHref(input: { canonicalUrl: string | null; wikiPath: string | null }): string | null {
  if (input.canonicalUrl && isAllowedOfficialUrl(input.canonicalUrl)) {
    return input.canonicalUrl;
  }
  if (!input.wikiPath) {
    return null;
  }
  const normalized = normalizeWikiPath(input.wikiPath);
  return normalized ? `/wiki/${normalized.slice(0, -3)}` : null;
}
