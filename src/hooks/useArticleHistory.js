import { useEffect, useState } from 'react';
import { historyViewer } from '../lib/articleHistory';
import { subscribeArticleHistory } from '../services/articleHistory';

export function useArticleHistory(user) {
  const viewer = historyViewer(user);
  const accountKey = viewer.mode === 'account' ? viewer.uid : viewer.mode;
  const [articles, setArticles] = useState([]);
  const [loadedKey, setLoadedKey] = useState(null);
  const [errorKey, setErrorKey] = useState(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    if (viewer.mode !== 'account') return undefined;

    let active = true;
    const unsubscribe = subscribeArticleHistory(
      viewer.uid,
      (nextArticles) => {
        if (!active) return;
        setArticles(nextArticles);
        setLoadedKey(accountKey);
        setErrorKey(null);
      },
      (error) => {
        if (!active) return;
        console.error('Loading article history failed:', error);
        setArticles([]);
        setLoadedKey(null);
        setErrorKey(accountKey);
      },
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [accountKey, retryToken, viewer.mode, viewer.uid]);

  let status = viewer.mode;
  if (viewer.mode === 'account') {
    if (errorKey === accountKey) status = 'error';
    else if (loadedKey === accountKey) status = 'ready';
    else status = 'loading';
  }

  return {
    articles: status === 'ready' ? articles : [],
    status,
    retry() {
      setArticles([]);
      setLoadedKey(null);
      setErrorKey(null);
      setRetryToken((token) => token + 1);
    },
  };
}
