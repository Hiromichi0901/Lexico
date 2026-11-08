import { articleHistoryTitle, normalizeArticleUrl } from './articleHistory.js';

export const ALL_ARTICLES = 'all';
export const NO_ARTICLE = 'none';
export const NEWEST_FIRST = 'newest';
export const OLDEST_FIRST = 'oldest';

// The service swaps this for Firestore's serverTimestamp() on the first save.
// Keeping the marker here lets tests see "use the server clock" without
// importing Firebase. A later save never writes it, so a missing date stays missing.
export const SERVER_TIMESTAMP = Symbol('serverTimestamp');

const ARTICLE_FILTER_PREFIX = 'article:';

export function savedAtOrder(order) {
  return order === OLDEST_FIRST ? OLDEST_FIRST : NEWEST_FIRST;
}

// Real save time in milliseconds, or null when the record has no time yet.
// Null covers legacy documents saved before savedAt existed, and a server
// timestamp that is still pending (Firestore leaves that empty until the
// server answers). Those are not sorted as text, and they are not given a fake time.
export function savedAtMillis(value) {
  if (value == null || value === '') return null;

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isNaN(time) ? null : time;
  }

  if (typeof value.toMillis === 'function') {
    const time = value.toMillis();
    return typeof time === 'number' && Number.isFinite(time) ? time : null;
  }

  if (typeof value.seconds === 'number' && Number.isFinite(value.seconds)) {
    const nanos = typeof value.nanoseconds === 'number' && Number.isFinite(value.nanoseconds)
      ? value.nanoseconds
      : 0;
    return value.seconds * 1000 + Math.floor(nanos / 1e6);
  }

  if (typeof value === 'string') {
    const time = Date.parse(value);
    return Number.isNaN(time) ? null : time;
  }

  return null;
}

export function formatSavedAt(value) {
  const millis = savedAtMillis(value);
  if (millis === null) return 'Date not recorded';

  const formatted = new Date(millis).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `Saved ${formatted}`;
}

function articleHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function sourceArticleForSave(url, title) {
  const normalized = normalizeArticleUrl(url);
  if (!normalized) {
    return { sourceArticleUrl: null, sourceArticleTitle: null };
  }

  return {
    sourceArticleUrl: normalized,
    sourceArticleTitle: articleHistoryTitle(title, normalized),
  };
}

// Article identity is the normalized URL. Titles collide, so they are only labels.
// A blank URL is "no article" even if a title string was stored beside it.
// A URL that cannot be normalized is still kept, so a legacy value is not
// silently dropped into the dictionary bucket.
export function sourceArticleOf(word) {
  if (!word || typeof word.sourceArticleUrl !== 'string') return null;
  const trimmed = word.sourceArticleUrl.trim();
  if (!trimmed) return null;

  const normalized = normalizeArticleUrl(trimmed);
  const url = normalized ?? trimmed;
  const rawTitle = typeof word.sourceArticleTitle === 'string'
    ? word.sourceArticleTitle.replace(/\s+/g, ' ').trim()
    : '';

  return {
    key: url,
    url,
    title: rawTitle || articleHost(url),
    rawTitle,
  };
}

export function articleFilterValue(urlKey) {
  return `${ARTICLE_FILTER_PREFIX}${urlKey}`;
}

function titleFromNewerWord(current, incoming, incomingMillis) {
  if (!incoming.rawTitle) return current;
  if (!current.rawTitle) {
    return {
      ...current,
      title: incoming.title,
      rawTitle: incoming.rawTitle,
      titleMillis: incomingMillis,
    };
  }

  const currentMillis = current.titleMillis;
  if (incomingMillis == null) return current;
  if (currentMillis == null || incomingMillis > currentMillis) {
    return {
      ...current,
      title: incoming.title,
      rawTitle: incoming.rawTitle,
      titleMillis: incomingMillis,
    };
  }
  if (incomingMillis === currentMillis && incoming.rawTitle.localeCompare(current.rawTitle) < 0) {
    return {
      ...current,
      title: incoming.title,
      rawTitle: incoming.rawTitle,
      titleMillis: incomingMillis,
    };
  }
  return current;
}

export function sourceArticleOptions(words) {
  const byKey = new Map();

  for (const word of words ?? []) {
    const article = sourceArticleOf(word);
    if (!article) continue;

    const millis = savedAtMillis(word.savedAt);
    const existing = byKey.get(article.key);
    if (!existing) {
      byKey.set(article.key, {
        key: article.key,
        url: article.url,
        title: article.title,
        rawTitle: article.rawTitle,
        titleMillis: article.rawTitle ? millis : null,
        count: 1,
      });
      continue;
    }

    existing.count += 1;
    const next = titleFromNewerWord(existing, article, millis);
    existing.title = next.title;
    existing.rawTitle = next.rawTitle;
    existing.titleMillis = next.titleMillis;
  }

  const articles = [...byKey.values()];

  function labelFor(article) {
    const sameTitle = articles.filter((other) => other.title === article.title);
    if (sameTitle.length < 2) return article.title;

    const host = articleHost(article.url);
    const sameHost = sameTitle.filter((other) => articleHost(other.url) === host);
    if (sameHost.length < 2) return `${article.title} — ${host}`;
    return `${article.title} — ${article.url}`;
  }

  return articles
    .map((article) => ({
      value: articleFilterValue(article.key),
      key: article.key,
      url: article.url,
      title: article.title,
      label: labelFor(article),
      count: article.count,
    }))
    .sort((left, right) => left.label.localeCompare(right.label) || left.key.localeCompare(right.key));
}

export function articleFilterForAccount(accountUid, selection) {
  if (!accountUid || !selection || selection.uid !== accountUid) return ALL_ARTICLES;
  return typeof selection.source === 'string' ? selection.source : ALL_ARTICLES;
}

export function resolveArticleFilter(source, words) {
  if (source === NO_ARTICLE) return NO_ARTICLE;
  if (source == null || source === ALL_ARTICLES) return ALL_ARTICLES;
  const known = sourceArticleOptions(words).some((option) => option.value === source);
  return known ? source : ALL_ARTICLES;
}

export function matchesArticleFilter(word, source) {
  if (source == null || source === ALL_ARTICLES) return true;
  const article = sourceArticleOf(word);
  if (source === NO_ARTICLE) return article == null;
  return article != null && articleFilterValue(article.key) === source;
}

function wordTieBreak(left, right) {
  const leftId = String(left?.id ?? left?.word ?? '');
  const rightId = String(right?.id ?? right?.word ?? '');
  return leftId.localeCompare(rightId);
}

// Dated words compare by epoch milliseconds. Missing and pending times stay
// after every dated word, in both directions, then by word id. Same timestamp
// also breaks the tie by word id so the order does not depend on Firestore's
// document order.
export function compareSavedAt(left, right, order) {
  const direction = savedAtOrder(order);
  const leftTime = savedAtMillis(left?.savedAt);
  const rightTime = savedAtMillis(right?.savedAt);
  const leftMissing = leftTime === null;
  const rightMissing = rightTime === null;

  if (leftMissing || rightMissing) {
    if (leftMissing && rightMissing) return wordTieBreak(left, right);
    return leftMissing ? 1 : -1;
  }

  const delta = direction === OLDEST_FIRST ? leftTime - rightTime : rightTime - leftTime;
  if (delta !== 0) return delta;
  return wordTieBreak(left, right);
}

export function visibleVocabulary(words, { order = NEWEST_FIRST, source = ALL_ARTICLES } = {}) {
  return (words ?? [])
    .filter((word) => matchesArticleFilter(word, source))
    .sort((left, right) => compareSavedAt(left, right, order));
}

export function labelForSourceArticle(word, options) {
  const article = sourceArticleOf(word);
  if (!article) return 'No article';
  const match = (options ?? []).find((option) => option.value === articleFilterValue(article.key));
  return match?.label ?? article.title;
}

export function vocabularySummary(totalCount, visibleCount, source, sourceLabel) {
  const totalNoun = totalCount === 1 ? 'word' : 'words';
  if (source == null || source === ALL_ARTICLES) {
    return `${totalCount} ${totalNoun} saved`;
  }
  if (source === NO_ARTICLE) {
    return `${visibleCount} of ${totalCount} ${totalNoun} saved without an article`;
  }
  return `${visibleCount} of ${totalCount} ${totalNoun} from ${sourceLabel}`;
}

export function vocabularyEmptyCopy(totalCount, source, sourceLabel) {
  if (totalCount === 0) {
    return 'No words yet. Click a word while reading an article to save it here.';
  }
  if (source === NO_ARTICLE) {
    return 'No words saved without an article. Words you save from the dictionary show up here.';
  }
  if (source !== ALL_ARTICLES && source != null) {
    return `No words saved from ${sourceLabel}.`;
  }
  return null;
}

export function shouldClearVocabularySession(status, loadedUid, currentUid) {
  if (status === 'idle') return false;
  return loadedUid !== currentUid;
}

export function buildVocabularySave(wordData, existingData) {
  const payload = {
    word: wordData.word,
    definitionEn: wordData.definitionEn ?? '',
    definitionJa: wordData.definitionJa ?? '',
    exampleSentence: wordData.exampleSentence ?? '',
  };

  // The document is already there. Update the lookup text only. Writing savedAt
  // or a source article here would stamp "now" onto an old word, or attach an
  // article the original save never recorded.
  if (existingData != null) return payload;

  return {
    ...payload,
    ...sourceArticleForSave(wordData.sourceArticleUrl, wordData.sourceArticleTitle),
    savedAt: SERVER_TIMESTAMP,
    reviewCount: 0,
    lastReviewedAt: null,
  };
}
