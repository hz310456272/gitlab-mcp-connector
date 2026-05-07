const SENSITIVE_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /PRIVATE-TOKEN:\s*\S+/gi, replacement: "PRIVATE-TOKEN: [REDACTED]" },
  { pattern: /Authorization:\s*Bearer\s+\S+/gi, replacement: "Authorization: Bearer [REDACTED]" },
  { pattern: /private_token=[^&\s"']+/gi, replacement: "private_token=[REDACTED]" },
  { pattern: /access_token=[^&\s"']+/gi, replacement: "access_token=[REDACTED]" },
  { pattern: /"private_token"\s*:\s*"[^"]*"/gi, replacement: '"private_token":"[REDACTED]"' },
  { pattern: /"access_token"\s*:\s*"[^"]*"/gi, replacement: '"access_token":"[REDACTED]"' },
  { pattern: /"token"\s*:\s*"[^"]*"/gi, replacement: '"token":"[REDACTED]"' },
  {
    pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    replacement: "[EMAIL REDACTED]",
  },
];

export function redact(input: string): string {
  return SENSITIVE_PATTERNS.reduce(
    (text, { pattern, replacement }) => text.replaceAll(pattern, replacement),
    input,
  );
}
