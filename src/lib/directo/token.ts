// Live demos call the APIs from the workshop with the same token as exercises.
// The Directo.astro layout puts it in <meta name="token-taller">.
export function conToken(headers: Record<string, string> = {}): Record<string, string> {
  const token = document.querySelector<HTMLMetaElement>('meta[name="token-taller"]')?.content ?? '';
  return { ...headers, Authorization: `Bearer ${token}` };
}
