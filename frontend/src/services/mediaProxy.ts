/**
 * mediaProxy — converts a raw Meta CDN URL (WhatsApp/Facebook) into a
 * backend-proxied URL that the browser can load without needing an access token.
 *
 * Meta CDN URLs look like:
 *   https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=...
 *   https://mmg.whatsapp.net/...
 *   https://lookaside.fbcdn.net/...
 *
 * Any other URL (local blob:, /media/, https://...) is returned as-is.
 */

const META_CDN_PATTERNS = [
  'lookaside.fbsbx.com',
  'lookaside.fbcdn.net',
  'mmg.whatsapp.net',
  'fbcdn.net',
  'whatsapp.net',
  'graph.facebook.com',
];

export function isMetaCdnUrl(url: string): boolean {
  if (!url) return false;
  try {
    const { hostname } = new URL(url);
    return META_CDN_PATTERNS.some((p) => hostname.endsWith(p));
  } catch {
    return false;
  }
}

/**
 * Returns a proxied URL for Meta CDN media, or the original URL otherwise.
 *
 * @param url     The raw media_url stored on the Message model
 * @param channel 'whatsapp' | 'facebook' | 'instagram'
 * @param mediaId Optional WhatsApp media_id — passed to proxy so it can re-resolve if the URL has expired
 */
export function proxyMediaUrl(url: string, channel = 'whatsapp', mediaId?: string): string {
  if (!url) return '';
  // Blob URLs and local /media/ paths are fine as-is
  if (url.startsWith('blob:') || url.startsWith('/media/') || url.startsWith('data:')) {
    return url;
  }
  if (!isMetaCdnUrl(url)) return url;

  const base = `${window.location.origin}/api/media-proxy/`;
  const params = new URLSearchParams({ url, channel });
  if (mediaId) params.set('media_id', mediaId);
  return `${base}?${params.toString()}`;
}

/**
 * Returns a proxied URL using a media_id (WhatsApp only).
 * Use when media_url is not available but media_id is stored in metadata.
 */
export function proxyMediaById(mediaId: string, channel = 'whatsapp'): string {
  if (!mediaId) return '';
  const base = `${window.location.origin}/api/media-proxy/`;
  const params = new URLSearchParams({ media_id: mediaId, channel });
  return `${base}?${params.toString()}`;
}
