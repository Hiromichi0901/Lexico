import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  ALL_ARTICLES,
  NEWEST_FIRST,
  NO_ARTICLE,
  OLDEST_FIRST,
  SERVER_TIMESTAMP,
  articleFilterForAccount,
  articleFilterValue,
  buildVocabularySave,
  formatSavedAt,
  labelForSourceArticle,
  resolveArticleFilter,
  savedAtMillis,
  shouldClearVocabularySession,
  sourceArticleOf,
  sourceArticleOptions,
  visibleVocabulary,
  vocabularyEmptyCopy,
  vocabularySummary,
} from '../src/lib/vocabularyReview.js';

const AI = 'https://news.example/how-ai';
const OTHER = 'https://other.example/how-ai';
const CITIES = 'https://news.example/cities';
const AI_FILTER = articleFilterValue(AI);
const OTHER_FILTER = articleFilterValue(OTHER);

// '2026-2-01' is February and '2026-10-01' is October, but the February string
// sorts after the October string. Ordering has to follow the parsed time.
const FEBRUARY = '2026-2-01';
const OCTOBER = '2026-10-01';

function ids(words) {
  return words.map((word) => word.id);
}

const words = [
  {
    id: 'zeta',
    word: 'zeta',
    savedAt: OCTOBER,
    sourceArticleUrl: AI,
    sourceArticleTitle: 'How AI reads',
  },
  {
    id: 'alpha',
    word: 'alpha',
    savedAt: FEBRUARY,
    sourceArticleUrl: `${AI}/#section`,
    sourceArticleTitle: 'How AI reads',
  },
  {
    id: 'same-early',
    word: 'same-early',
    savedAt: { seconds: 1700000000, nanoseconds: 0 },
    sourceArticleUrl: OTHER,
    sourceArticleTitle: 'How AI reads',
  },
  {
    id: 'same-late',
    word: 'same-late',
    savedAt: { seconds: 1700000000, nanoseconds: 2_000_000 },
    sourceArticleUrl: `${OTHER}/`,
    sourceArticleTitle: 'How AI reads',
  },
  {
    id: 'dict',
    word: 'dict',
    savedAt: new Date(2026, 0, 15, 12),
    sourceArticleUrl: null,
    sourceArticleTitle: null,
  },
  {
    id: 'legacy',
    word: 'legacy',
  },
  {
    id: 'blank',
    word: 'blank',
    savedAt: '',
    sourceArticleUrl: '   ',
    sourceArticleTitle: 'Orphan title',
  },
  {
    id: 'pending',
    word: 'pending',
    savedAt: { _methodName: 'serverTimestamp' },
    sourceArticleUrl: CITIES,
    sourceArticleTitle: 'City guide',
  },
  {
    id: 'epoch',
    word: 'epoch',
    savedAt: 0,
    sourceArticleUrl: CITIES,
    sourceArticleTitle: '  City   guide  ',
  },
];

describe('saved time', () => {
  it('reads timestamps, dates, and date strings as milliseconds', () => {
    assert.equal(savedAtMillis(0), 0);
    assert.equal(savedAtMillis(new Date(2026, 10, 7, 15)), new Date(2026, 10, 7, 15).getTime());
    assert.equal(savedAtMillis({ toMillis: () => 42 }), 42);
    assert.equal(savedAtMillis({ seconds: 10, nanoseconds: 2_000_000 }), 10002);
    assert.ok(Date.parse(FEBRUARY) < Date.parse(OCTOBER));
    assert.ok(FEBRUARY > OCTOBER);
    assert.equal(savedAtMillis(FEBRUARY), Date.parse(FEBRUARY));
  });

  it('treats missing, blank, and pending values as unknown', () => {
    assert.equal(savedAtMillis(null), null);
    assert.equal(savedAtMillis(undefined), null);
    assert.equal(savedAtMillis(''), null);
    assert.equal(savedAtMillis('not-a-date'), null);
    assert.equal(savedAtMillis({ _methodName: 'serverTimestamp' }), null);
    assert.equal(savedAtMillis({ toMillis: () => Number.NaN }), null);
    assert.equal(formatSavedAt(null), 'Date not recorded');
    assert.equal(formatSavedAt({ _methodName: 'serverTimestamp' }), 'Date not recorded');
    assert.equal(formatSavedAt(new Date(2026, 10, 7, 15)), 'Saved Nov 7, 2026');
  });

  it('sorts newest and oldest by time, not by the display text', () => {
    const nov8 = {
      id: 'nov8',
      savedAt: new Date(2026, 10, 8, 12),
      savedLabel: 'Saved Nov 8, 2026',
    };
    const nov10 = {
      id: 'nov10',
      savedAt: new Date(2026, 10, 10, 12),
      savedLabel: 'Saved Nov 10, 2026',
    };
    const labelDescending = [nov8, nov10].map((word) => word.savedLabel).sort().reverse();
    assert.deepEqual(labelDescending, ['Saved Nov 8, 2026', 'Saved Nov 10, 2026']);

    assert.deepEqual(ids(visibleVocabulary([nov8, nov10], { order: NEWEST_FIRST })), ['nov10', 'nov8']);
    assert.deepEqual(ids(visibleVocabulary([nov10, nov8], { order: OLDEST_FIRST })), ['nov8', 'nov10']);
    assert.deepEqual(ids(visibleVocabulary(words, { order: NEWEST_FIRST })), [
      'zeta',
      'alpha',
      'dict',
      'same-late',
      'same-early',
      'epoch',
      'blank',
      'legacy',
      'pending',
    ]);
    assert.deepEqual(ids(visibleVocabulary(words, { order: OLDEST_FIRST })), [
      'epoch',
      'same-early',
      'same-late',
      'dict',
      'alpha',
      'zeta',
      'blank',
      'legacy',
      'pending',
    ]);
  });

  it('breaks equal times by word id and keeps unknown dates last either way', () => {
    const tied = [
      { id: 'b', savedAt: 50 },
      { id: 'a', savedAt: 50 },
    ];
    assert.deepEqual(ids(visibleVocabulary(tied, { order: NEWEST_FIRST })), ['a', 'b']);
    assert.deepEqual(ids(visibleVocabulary(tied, { order: OLDEST_FIRST })), ['a', 'b']);

    const mixed = [
      { id: 'a', savedAt: null },
      { id: 'z', savedAt: 50 },
    ];
    assert.deepEqual(ids(visibleVocabulary(mixed, { order: OLDEST_FIRST })), ['z', 'a']);
    assert.deepEqual(ids(visibleVocabulary(mixed, { order: NEWEST_FIRST })), ['z', 'a']);
  });

  it('does not reorder the stored list', () => {
    const original = ids(words);
    visibleVocabulary(words, { order: OLDEST_FIRST, source: AI_FILTER });
    assert.deepEqual(ids(words), original);
  });
});

describe('source article filter', () => {
  it('groups one article by normalized url and separates the same title', () => {
    const options = sourceArticleOptions(words);
    assert.deepEqual(options.map((option) => option.label), [
      'City guide',
      'How AI reads — news.example',
      'How AI reads — other.example',
    ]);
    assert.equal(options.find((option) => option.value === AI_FILTER).count, 2);
    assert.equal(options.some((option) => option.label.includes('Orphan')), false);
    assert.equal(sourceArticleOf(words.find((word) => word.id === 'alpha')).key, AI);
    assert.equal(sourceArticleOf(words.find((word) => word.id === 'blank')), null);
  });

  it('uses the full url when the title and host both collide', () => {
    const options = sourceArticleOptions([
      {
        id: 'a',
        savedAt: 1,
        sourceArticleUrl: 'https://news.example/notes/a',
        sourceArticleTitle: 'Notes',
      },
      {
        id: 'b',
        savedAt: 2,
        sourceArticleUrl: 'https://news.example/notes/b',
        sourceArticleTitle: 'Notes',
      },
    ]);
    assert.deepEqual(options.map((option) => option.label), [
      'Notes — https://news.example/notes/a',
      'Notes — https://news.example/notes/b',
    ]);
    const filterA = options[0].value;
    assert.deepEqual(
      ids(visibleVocabulary([
        { id: 'a', savedAt: 1, sourceArticleUrl: 'https://news.example/notes/a', sourceArticleTitle: 'Notes' },
        { id: 'b', savedAt: 2, sourceArticleUrl: 'https://news.example/notes/b', sourceArticleTitle: 'Notes' },
      ], { source: filterA })),
      ['a'],
    );
  });

  it('keeps the newest real title when the same article was saved under two names', () => {
    const options = sourceArticleOptions([
      { id: 'old', savedAt: 1, sourceArticleUrl: AI, sourceArticleTitle: 'Old name' },
      { id: 'blank', savedAt: 3, sourceArticleUrl: AI, sourceArticleTitle: '   ' },
      { id: 'next', savedAt: 2, sourceArticleUrl: `${AI}/`, sourceArticleTitle: 'New name' },
    ]);
    assert.equal(options.length, 1);
    assert.equal(options[0].label, 'New name');
    assert.equal(options[0].count, 3);
  });

  it('filters to one article, or to saves with no article', () => {
    assert.deepEqual(ids(visibleVocabulary(words, { source: AI_FILTER, order: NEWEST_FIRST })), ['zeta', 'alpha']);
    assert.deepEqual(ids(visibleVocabulary(words, { source: OTHER_FILTER, order: OLDEST_FIRST })), [
      'same-early',
      'same-late',
    ]);
    assert.deepEqual(ids(visibleVocabulary(words, { source: NO_ARTICLE, order: NEWEST_FIRST })), [
      'dict',
      'blank',
      'legacy',
    ]);
    assert.equal(labelForSourceArticle(words.find((word) => word.id === 'dict'), sourceArticleOptions(words)), 'No article');
    assert.equal(
      labelForSourceArticle(words.find((word) => word.id === 'zeta'), sourceArticleOptions(words)),
      'How AI reads — news.example',
    );
  });

  it('applies the article filter and the date order together', () => {
    assert.deepEqual(ids(visibleVocabulary(words, { source: AI_FILTER, order: OLDEST_FIRST })), ['alpha', 'zeta']);
    assert.deepEqual(
      ids(visibleVocabulary(words, { source: articleFilterValue(CITIES), order: NEWEST_FIRST })),
      ['epoch', 'pending'],
    );
    assert.deepEqual(ids(visibleVocabulary(words, { source: articleFilterValue('https://example.com/missing') })), []);
  });

  it('describes an empty review without inventing a match', () => {
    assert.equal(
      vocabularyEmptyCopy(0, ALL_ARTICLES, ''),
      'No words yet. Click a word while reading an article to save it here.',
    );
    assert.equal(vocabularySummary(0, 0, ALL_ARTICLES, ''), '0 words saved');
    assert.equal(vocabularySummary(1, 1, ALL_ARTICLES, ''), '1 word saved');
    assert.equal(
      vocabularyEmptyCopy(4, NO_ARTICLE, ''),
      'No words saved without an article. Words you save from the dictionary show up here.',
    );
    assert.equal(vocabularySummary(10, 0, NO_ARTICLE, ''), '0 of 10 words saved without an article');
    assert.equal(vocabularySummary(10, 1, NO_ARTICLE, ''), '1 of 10 words saved without an article');
    assert.equal(
      vocabularyEmptyCopy(10, AI_FILTER, 'How AI reads — news.example'),
      'No words saved from How AI reads — news.example.',
    );
    assert.equal(
      vocabularySummary(10, 2, AI_FILTER, 'How AI reads — news.example'),
      '2 of 10 words from How AI reads — news.example',
    );
    assert.equal(vocabularyEmptyCopy(10, ALL_ARTICLES, ''), null);
  });
});

describe('account changes', () => {
  it('drops another account\'s article filter, including when the url exists there too', () => {
    const selection = { uid: 'hiro', source: AI_FILTER };
    const otherWords = [
      { id: 'other-word', savedAt: 5, sourceArticleUrl: AI, sourceArticleTitle: 'How AI reads' },
    ];

    assert.equal(articleFilterForAccount('hiro', selection), AI_FILTER);
    assert.equal(resolveArticleFilter(articleFilterForAccount('hiro', selection), words), AI_FILTER);
    assert.equal(resolveArticleFilter(selection.source, otherWords), AI_FILTER);
    assert.equal(articleFilterForAccount('other', selection), ALL_ARTICLES);
    assert.equal(resolveArticleFilter(articleFilterForAccount('other', selection), otherWords), ALL_ARTICLES);
    assert.equal(articleFilterForAccount('hiro', selection), AI_FILTER);
    assert.equal(articleFilterForAccount(null, selection), ALL_ARTICLES);
    assert.equal(resolveArticleFilter(articleFilterValue('https://example.com/gone'), words), ALL_ARTICLES);
    assert.equal(resolveArticleFilter(NO_ARTICLE, words.filter((word) => sourceArticleOf(word))), NO_ARTICLE);
  });

  it('leaves an in-progress review when the signed-in account changes', () => {
    assert.equal(shouldClearVocabularySession('testing', 'hiro', 'other'), true);
    assert.equal(shouldClearVocabularySession('finished', 'hiro', null), true);
    assert.equal(shouldClearVocabularySession('testing', 'hiro', 'hiro'), false);
    assert.equal(shouldClearVocabularySession('idle', 'hiro', 'other'), false);
  });
});

describe('vocabulary save payload', () => {
  it('records the server time and normalized article only when the word is new', () => {
    const created = buildVocabularySave({
      word: 'Amortized',
      definitionEn: 'spread out',
      definitionJa: '平準化',
      exampleSentence: 'The cost is amortized.',
      sourceArticleUrl: ' HTTPS://News.Example/how-ai/#top ',
      sourceArticleTitle: '  How   AI\nreads ',
    }, null);

    assert.equal(created.sourceArticleUrl, AI);
    assert.equal(created.sourceArticleTitle, 'How AI reads');
    assert.equal(created.savedAt, SERVER_TIMESTAMP);
    assert.equal(created.reviewCount, 0);
    assert.equal(created.lastReviewedAt, null);
  });

  it('stores a dictionary save as no article', () => {
    const created = buildVocabularySave({
      word: 'serene',
      definitionEn: 'calm',
      sourceArticleUrl: 'javascript:alert(1)',
      sourceArticleTitle: 'Not an article',
    }, null);

    assert.equal(created.sourceArticleUrl, null);
    assert.equal(created.sourceArticleTitle, null);
    assert.equal(created.definitionJa, '');
    assert.equal(created.exampleSentence, '');
  });

  it('does not invent a date or an article for a word that already exists', () => {
    const existing = { word: 'serene', definitionEn: 'calm', reviewCount: 4 };
    const updated = buildVocabularySave({
      word: 'serene',
      definitionEn: 'calm and peaceful',
      definitionJa: '穏やか',
      exampleSentence: 'A serene lake.',
      sourceArticleUrl: AI,
      sourceArticleTitle: 'How AI reads',
    }, existing);

    assert.equal(updated.definitionEn, 'calm and peaceful');
    assert.equal(updated.definitionJa, '穏やか');
    assert.equal(Object.hasOwn(updated, 'savedAt'), false);
    assert.equal(Object.hasOwn(updated, 'sourceArticleUrl'), false);
    assert.equal(Object.hasOwn(updated, 'sourceArticleTitle'), false);
    assert.equal(Object.hasOwn(updated, 'reviewCount'), false);
    assert.equal(Object.hasOwn(updated, 'lastReviewedAt'), false);
    assert.equal(existing.reviewCount, 4);
    assert.equal(existing.definitionEn, 'calm');
  });
});

describe('review wiring', () => {
  it('saves the open article from the reader and not from the dictionary', () => {
    const reader = readFileSync(new URL('../src/pages/Reader.jsx', import.meta.url), 'utf8');
    const dictionary = readFileSync(new URL('../src/pages/Dictionary.jsx', import.meta.url), 'utf8');
    const service = readFileSync(new URL('../src/services/vocabulary.js', import.meta.url), 'utf8');

    assert.match(reader, /articleUrl=\{article\.url\}/);
    assert.match(reader, /articleTitle=\{article\.title\}/);
    assert.equal(dictionary.includes('articleUrl'), false);
    assert.match(service, /buildVocabularySave/);
    assert.match(service, /runTransaction/);
    assert.equal(service.includes('reviewCount'), false);
  });
});
