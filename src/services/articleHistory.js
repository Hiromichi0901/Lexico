import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  articleHistoryId,
  buildOpenedArticleRecord,
  openedArticleDocument,
  openedAtMillis,
} from '../lib/articleHistory';

// Writes url, title, and lastOpenedAt only. Article HTML stays in memory
// for the reader and is not stored.
export async function saveOpenedArticle(user, { url, title }) {
  if (!user || user.isAnonymous || typeof user.uid !== 'string' || user.uid.length === 0) {
    throw new Error('Article history is only saved for signed-in accounts');
  }

  const record = buildOpenedArticleRecord(url, title);
  const id = await articleHistoryId(record.url);
  await setDoc(
    doc(db, 'users', user.uid, 'history', id),
    openedArticleDocument(record, serverTimestamp()),
    { merge: true },
  );
  return id;
}

export function subscribeArticleHistory(uid, onChange, onError) {
  const historyQuery = query(
    collection(db, 'users', uid, 'history'),
    orderBy('lastOpenedAt', 'desc'),
  );

  return onSnapshot(
    historyQuery,
    (snapshot) => {
      const articles = snapshot.docs
        .map((entry) => {
          const data = entry.data();
          return {
            id: entry.id,
            url: data.url,
            title: data.title,
            lastOpenedAt: data.lastOpenedAt ?? null,
          };
        })
        .filter((article) => typeof article.url === 'string' && typeof article.title === 'string')
        .sort((left, right) => openedAtMillis(right.lastOpenedAt) - openedAtMillis(left.lastOpenedAt));
      onChange(articles);
    },
    onError,
  );
}
