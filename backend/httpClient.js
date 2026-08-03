// Shared helpers that turn opaque `fetch` failures into messages a user can act
// on. Native fetch reports aborts as "This operation was aborted" and every
// connection problem as "fetch failed", neither of which says which host broke.

export async function responseError(res, url) {
  const body = await res.text().catch(() => '');
  const detail = body
    ? `: ${body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200)}`
    : '';
  return new Error(`HTTP ${res.status} from ${url}${detail}`);
}

export function describeFetchError(err, url, timeoutMs) {
  if (err.name === 'AbortError') return new Error(`request to ${url} timed out after ${timeoutMs}ms`);
  if (err.name === 'SyntaxError') return new Error(`invalid JSON in response from ${url}: ${err.message}`);
  if (err.name === 'TypeError') {
    const cause = err.cause?.code || err.cause?.message;
    return new Error(`could not reach ${url}${cause ? ` (${cause})` : ''}`);
  }
  return err;
}
