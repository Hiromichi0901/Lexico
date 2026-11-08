import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, it } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import {
  articleHistoryId,
  buildOpenedArticleRecord,
  openedArticleDocument,
} from '../src/lib/articleHistory.js';

const PROJECT_ID = 'demo-lexico';
const OLDER = 'https://example.com/older';
const NEWER = 'https://example.com/newer';

let testEnv;

function account(uid, provider = 'password') {
  return testEnv.authenticatedContext(uid, {
    email: `${uid}@example.com`,
    firebase: { sign_in_provider: provider },
  }).firestore();
}

function anonymous(uid) {
  return testEnv.authenticatedContext(uid, {
    firebase: { sign_in_provider: 'anonymous' },
  }).firestore();
}

async function writeHistory(db, uid, url, title) {
  const record = buildOpenedArticleRecord(url, title);
  const id = await articleHistoryId(record.url);
  const ref = doc(db, 'users', uid, 'history', id);
  await setDoc(ref, openedArticleDocument(record, serverTimestamp()), { merge: true });
  return { id, ref, record };
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

after(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

describe('article history rules', () => {
  it('saves an opened article for a real account and updates that same article on revisit', async () => {
    const db = account('hiro');
    const created = await assertSucceeds(writeHistory(db, 'hiro', `${OLDER}/`, 'First title'));
    await assertSucceeds(writeHistory(db, 'hiro', OLDER, 'Updated title'));

    const saved = await getDoc(created.ref);
    const all = await getDocs(collection(db, 'users', 'hiro', 'history'));
    assert.equal(all.size, 1);
    assert.equal(saved.data().url, OLDER);
    assert.equal(saved.data().title, 'Updated title');
    assert.equal(saved.data().content, undefined);
    assert.equal(created.id, await articleHistoryId(OLDER));
  });

  it('lists the most recently opened article first', async () => {
    const db = account('hiro');
    await assertSucceeds(writeHistory(db, 'hiro', OLDER, 'Older'));
    await wait(300);
    await assertSucceeds(writeHistory(db, 'hiro', NEWER, 'Newer'));

    const snapshot = await getDocs(query(
      collection(db, 'users', 'hiro', 'history'),
      orderBy('lastOpenedAt', 'desc'),
    ));
    assert.deepEqual(
      snapshot.docs.map((entry) => entry.data().url),
      [NEWER, OLDER],
    );
  });

  it('accepts a Google account the same way as email/password', async () => {
    const db = account('hiro', 'google.com');
    await assertSucceeds(writeHistory(db, 'hiro', OLDER, 'From Google'));
  });

  it('rejects anonymous, signed-out, and other-account access', async () => {
    const owner = account('hiro');
    await assertSucceeds(writeHistory(owner, 'hiro', OLDER, 'Private'));

    await assertFails(writeHistory(anonymous('anon'), 'anon', NEWER, 'Anon'));
    await assertFails(getDocs(collection(anonymous('hiro'), 'users', 'hiro', 'history')));
    await assertFails(getDocs(collection(account('other'), 'users', 'hiro', 'history')));
    await assertFails(getDoc(doc(account('other'), 'users', 'hiro', 'history', await articleHistoryId(OLDER))));
    await assertFails(getDocs(collection(testEnv.unauthenticatedContext().firestore(), 'users', 'hiro', 'history')));
    await assertFails(writeHistory(account('other'), 'hiro', NEWER, 'Cross write'));
  });

  it('rejects article bodies, bad urls, client timestamps, url changes, and deletes', async () => {
    const db = account('hiro');
    const created = await assertSucceeds(writeHistory(db, 'hiro', OLDER, 'Older'));

    await assertFails(setDoc(created.ref, {
      url: OLDER,
      title: 'Older',
      content: '<p>full article</p>',
      lastOpenedAt: serverTimestamp(),
    }, { merge: true }));

    const badUrl = doc(db, 'users', 'hiro', 'history', created.id);
    await assertFails(setDoc(badUrl, {
      url: 'javascript:alert(1)',
      title: 'Nope',
      lastOpenedAt: serverTimestamp(),
    }));

    await assertFails(setDoc(doc(db, 'users', 'hiro', 'history', 'not-a-hash'), {
      url: NEWER,
      title: 'Nope',
      lastOpenedAt: serverTimestamp(),
    }));

    await assertFails(setDoc(created.ref, {
      url: OLDER,
      title: 'Older',
      lastOpenedAt: new Date(),
    }));

    await assertFails(setDoc(created.ref, openedArticleDocument(
      buildOpenedArticleRecord(NEWER, 'Different url'),
      serverTimestamp(),
    ), { merge: true }));

    await assertFails(deleteDoc(created.ref));
    assert.equal((await getDoc(created.ref)).exists(), true);
  });
});

describe('vocabulary rules require a real account owner', () => {
  it('lets the owning email account save a word and denies anonymous and other accounts', async () => {
    const word = {
      word: 'hello',
      definitionEn: 'a greeting',
      definitionJa: 'こんにちは',
      exampleSentence: 'Hello there.',
      sourceArticleUrl: OLDER,
      sourceArticleTitle: 'Older',
      savedAt: serverTimestamp(),
      reviewCount: 0,
      lastReviewedAt: null,
    };

    await assertSucceeds(setDoc(doc(account('hiro'), 'users', 'hiro', 'vocabulary', 'hello'), word));
    await assertSucceeds(getDocs(collection(account('hiro'), 'users', 'hiro', 'vocabulary')));
    await assertFails(setDoc(doc(anonymous('anon'), 'users', 'anon', 'vocabulary', 'hello'), word));
    await assertFails(getDocs(collection(anonymous('anon'), 'users', 'anon', 'vocabulary')));
    await assertFails(setDoc(doc(account('other'), 'users', 'hiro', 'vocabulary', 'hello'), word));
    await assertFails(setDoc(
      doc(testEnv.unauthenticatedContext().firestore(), 'users', 'hiro', 'vocabulary', 'hello'),
      word,
    ));
    await assertFails(getDocs(collection(account('other'), 'users', 'hiro', 'vocabulary')));
  });
});
