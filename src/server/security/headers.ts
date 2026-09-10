export type SecurityHeader = {
  key: string;
  value: string;
};

export const baseSecurityHeaders: SecurityHeader[] = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()"
  }
];

export function securityHeadersForEnvironment(env: Record<string, string | undefined> = process.env): SecurityHeader[] {
  if (env.APP_ENV === "production") {
    return [
      ...baseSecurityHeaders,
      {
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains"
      }
    ];
  }

  return baseSecurityHeaders;
}

export function applySecurityHeaders(headers: Headers, env: Record<string, string | undefined> = process.env) {
  for (const header of securityHeadersForEnvironment(env)) {
    headers.set(header.key, header.value);
  }
  return headers;
}
