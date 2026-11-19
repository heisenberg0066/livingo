export function isPrivateLock(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /this livingo is private/i.test(message);
}
