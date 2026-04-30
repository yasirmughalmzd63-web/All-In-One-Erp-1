const BASE = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
  : "";

export function getApiUrl(path: string): string {
  return `${BASE}${path}`;
}
