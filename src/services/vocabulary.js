import { collection, doc, getDocs, runTransaction, serverTimestamp } from "firebase/firestore";
import { buildVocabularySave, SERVER_TIMESTAMP } from "../lib/vocabularyReview";
import { db } from "./firebase";

// The first save stores the server clock and the source article (null for a
// dictionary save). Saving the same word again updates the definition only.
// Documents already in Firestore are not migrated.
export async function saveWord(uid, wordData) {
  const wordId = wordData.word.toLowerCase();
  const wordRef = doc(db, "users", uid, "vocabulary", wordId);

  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(wordRef);
    const payload = buildVocabularySave(
      wordData,
      existing.exists() ? existing.data() : null,
    );
    if (payload.savedAt === SERVER_TIMESTAMP) {
      payload.savedAt = serverTimestamp();
    }
    transaction.set(wordRef, payload, { merge: true });
  });
}

// Unordered on purpose. The review page sorts by the actual save time and
// keeps missing timestamps together, which a Firestore orderBy would not do.
export async function getAllWords(uid) {
  const vocabRef = collection(db, "users", uid, "vocabulary");
  const snapshot = await getDocs(vocabRef);
  return snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
}
