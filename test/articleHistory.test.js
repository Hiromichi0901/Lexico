import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  MAX_ARTICLE_TITLE_LENGTH,
  articleHistoryId,
  buildOpenedArticleRecord,
  formatLastOpened,
  historyViewer,
  isLoadedArticle,
  normalizeArticleUrl,
  openedArticleDocument,
} from '../src/lib/articleHistory.js';

const ARTICLE = 'https://example.com/news/how-ai-is-changing-reading';

describe('article history identity', () => {
  it('treats a revisit as the same article', async () => {
    const first = normalizeArticleUrl(`${ARTICLE}/`);
    const revisit = normalizeArticleUrl(`  HTTPS://Example.com/news/how-ai-is-changing-reading#section  `);
    assert.equal(first, ARTICLE);
    assert.equal(revisit, ARTICLE);
    assert.equal(await articleHistoryId(first), await articleHistoryId(revisit));
  });

  it('keeps distinct links distinct', async () => {
    const story = normalizeArticleUrl(ARTICLE);
    const other = normalizeArticleUrl(`${ARTICLE}?page=2`);
    assert.notEqual(story, other);
    assert.notEqual(await articleHistoryId(story), await articleHistoryId(other));
  });

  it('uses sha256 so the Firestore id matches the rules', async () => {
    const id = await articleHistoryId(ARTICLE);
    const expected = createHash('sha256').update(ARTICLE).digest('hex');
    assert.equal(id, expected);
    assert.match(id, /^[a-f0-9]{64}$/);
  });

  it('drops fragments, default ports, and credentials without keeping the secret', () => {
    assert.equal(
      normalizeArticleUrl('https://reader:secret@example.com:443/a/?q=1#top'),
      'https://example.com/a?q=1',
    );
    assert.equal(normalizeArticleUrl('http://example.com:80/a'), 'http://example.com/a');
    assert.equal(normalizeArticleUrl('https://example.com:8443/a'), 'https://example.com:8443/a');
  });

  it('rejects links that are not http(s) pages', () => {
    assert.equal(normalizeArticleUrl('javascript:alert(1)'), null);
    assert.equal(normalizeArticleUrl('file:///tmp/article.html'), null);
    assert.equal(normalizeArticleUrl('not a url'), null);
    assert.equal(normalizeArticleUrl(''), null);
    assert.equal(normalizeArticleUrl(null), null);
  });
});

describe('opened article record', () => {
  it('stores the url, title, and open time, not the article body', () => {
    const record = buildOpenedArticleRecord(`${ARTICLE}/`, '  How   AI\nreads  ');
    const document = openedArticleDocument(record, 'SERVER_TIME');
    assert.deepEqual(document, {
      url: ARTICLE,
      title: 'How AI reads',
      lastOpenedAt: 'SERVER_TIME',
    });
    assert.equal(Object.hasOwn(document, 'content'), false);
  });

  it('falls back to the hostname and caps a very long title', () => {
    const untitled = buildOpenedArticleRecord(ARTICLE, '   ');
    assert.equal(untitled.title, 'example.com');

    const longTitle = 'Word '.repeat(200);
    const capped = buildOpenedArticleRecord(ARTICLE, longTitle);
    assert.equal(capped.title.length, MAX_ARTICLE_TITLE_LENGTH);
  });

  it('refuses to build a record for an invalid url', () => {
    assert.throws(() => buildOpenedArticleRecord('javascript:alert(1)', 'Nope'), /Invalid article URL/);
  });

  it('treats a scrape with no title and no body as a failed load', () => {
    assert.equal(isLoadedArticle({ title: 'How AI reads', content: '<p>Hello</p>' }), true);
    assert.equal(isLoadedArticle({ title: '', content: '' }), false);
    assert.equal(isLoadedArticle({ title: '   ', content: null }), false);
    assert.equal(isLoadedArticle(null), false);
  });
});

describe('history viewer', () => {
  it('saves only for a non-anonymous account and clears the previous account', () => {
    assert.deepEqual(historyViewer(null), { mode: 'signed-out', uid: null });
    assert.deepEqual(historyViewer({ uid: 'anon', isAnonymous: true }), { mode: 'anonymous', uid: null });
    assert.deepEqual(historyViewer({ uid: 'hiro', isAnonymous: false }), { mode: 'account', uid: 'hiro' });
    assert.notEqual(
      historyViewer({ uid: 'hiro', isAnonymous: false }).uid,
      historyViewer({ uid: 'other', isAnonymous: false }).uid,
    );
  });

  it('formats a real open time and hides a missing one', () => {
    assert.equal(formatLastOpened(null), 'Opened just now');
    assert.equal(formatLastOpened(new Date(2026, 10, 7, 15, 0, 0)), 'Opened Nov 7, 2026');
  });
});

describe('firestore rules source', () => {
  it('does not leave a recursive user wildcard over history', () => {
    const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
    assert.equal(/match\s+\/users\/\{uid\}\/\{document=\*\*\}/.test(rules), false);
    assert.match(rules, /match \/users\/\{uid\}\/vocabulary\/\{wordId\}/);
    assert.match(
      rules,
      /match \/users\/\{uid\}\/vocabulary\/\{wordId\} \{\s*allow read, write: if isSignedInOwner\(uid\);/,
    );
    assert.match(rules, /match \/users\/\{uid\}\/history\/\{articleId\}/);
    assert.match(rules, /allow read: if isSignedInOwner\(uid\);/);
    assert.match(rules, /sign_in_provider != 'anonymous'/);
    assert.match(rules, /hasOnly\(\['url', 'title', 'lastOpenedAt'\]\)/);
  });
});
