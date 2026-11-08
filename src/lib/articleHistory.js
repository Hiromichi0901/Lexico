export const MAX_ARTICLE_URL_LENGTH = 2000;
export const MAX_ARTICLE_TITLE_LENGTH = 300;

// Identity for one opened article. The same normalized URL always maps to
// the same Firestore document, so a revisit updates that document.
export function historyViewer(user) {
  if (!user || user.isAnonymous) {
    return { mode: user ? 'anonymous' : 'signed-out', uid: null };
  }
  if (typeof user.uid !== 'string' || user.uid.length === 0) {
    return { mode: 'signed-out', uid: null };
  }
  return { mode: 'account', uid: user.uid };
}

export function normalizeArticleUrl(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_ARTICLE_URL_LENGTH) return null;

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (!parsed.hostname) return null;

  parsed.username = '';
  parsed.password = '';
  parsed.hash = '';
  parsed.hostname = parsed.hostname.toLowerCase();

  if (
    (parsed.protocol === 'http:' && parsed.port === '80')
    || (parsed.protocol === 'https:' && parsed.port === '443')
  ) {
    parsed.port = '';
  }

  if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
    parsed.pathname = parsed.pathname.slice(0, -1);
  }

  const normalized = parsed.toString();
  if (normalized.length > MAX_ARTICLE_URL_LENGTH) return null;
  return normalized;
}

export function articleHistoryTitle(title, normalizedUrl) {
  const collapsed = typeof title === 'string' ? title.replace(/\s+/g, ' ').trim() : '';
  const fallback = collapsed || new URL(normalizedUrl).hostname;
  return fallback.slice(0, MAX_ARTICLE_TITLE_LENGTH);
}

export function buildOpenedArticleRecord(url, title) {
  const normalized = normalizeArticleUrl(url);
  if (!normalized) {
    throw new Error('Invalid article URL');
  }
  return {
    url: normalized,
    title: articleHistoryTitle(title, normalized),
  };
}

export function openedArticleDocument(record, lastOpenedAt) {
  return {
    url: record.url,
    title: record.title,
    lastOpenedAt,
  };
}

export function isLoadedArticle(article) {
  if (!article || typeof article !== 'object') return false;
  const title = typeof article.title === 'string' ? article.title.trim() : '';
  const content = typeof article.content === 'string' ? article.content.trim() : '';
  return title.length > 0 || content.length > 0;
}

export async function articleHistoryId(normalizedUrl) {
  const bytes = new TextEncoder().encode(normalizedUrl);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function openedAtMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return 0;
}

export function formatLastOpened(value) {
  let date = null;
  if (value instanceof Date) {
    date = value;
  } else if (value && typeof value.toDate === 'function') {
    date = value.toDate();
  }

  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return 'Opened just now';
  }

  const formatted = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `Opened ${formatted}`;
}
