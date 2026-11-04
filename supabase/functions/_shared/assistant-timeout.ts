// A deadline must settle even if an SDK/transport does not honour cancellation.
export async function withDeadline<T>(operation: () => PromiseLike<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw Error('Anfrage abgebrochen oder Zeitlimit überschritten.')
  let rejectAbort: () => void = () => {}
  const aborted = new Promise<never>((_, reject) => { rejectAbort = () => reject(Error('Anfrage abgebrochen oder Zeitlimit überschritten.')) })
  signal.addEventListener('abort', rejectAbort, { once: true })
  try { return await Promise.race([Promise.resolve().then(() => { if (signal.aborted) throw Error('Zeitlimit überschritten.'); return operation() }), aborted]) }
  finally { signal.removeEventListener('abort', rejectAbort) }
}
