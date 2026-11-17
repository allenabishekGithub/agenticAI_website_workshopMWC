// Token shared from the workshop. Not in git: read from WORKSHOP_TOKEN in.dev.vars (the.env of
// Wrangler, which the Cloudflare adapter loads also when compiling) and is displayed in /apis and in the
// slides. It is the same value as the Worker; in production:
//   pnpm wrangler secret put WORKSHOP_TOKEN
// When the workshop is finished, change the secret to stop it from working.
export const TOKEN_DEL_TALLER: string = import.meta.env.WORKSHOP_TOKEN ?? '';

if (!TOKEN_DEL_TALLER) {
  console.warn('[workshop] WORKSHOP_TOKEN missing in.dev.vars: the token will not be displayed in /apis or in slides.');
}
