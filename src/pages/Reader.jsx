import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import ArticleContent from "../components/ArticleContent";
import VocabCard from "../components/VocabCard";

// const vocabData = {
//   amortized: {
//     word: "amortized",
//     type: "adj.",
//     pronunciation: "/əˈmɔːr.tə.zaɪzd/",
//     definition:
//       "Gradually reduced or spread out over time, especially a cost or debt.",
//     japanese: "分割償却された、平準化された",
//     inThisSentence:
//       "The cost of an operation is averaged across many runs, not just the single worst case.",
//   },
// };

function Reader() {
  const location = useLocation();
  const article = location.state?.article;
  const historySaveFailed = location.state?.historySaveFailed === true;


  const [activeWord, setActiveWord] = useState(null);
  const [showVocabCard, setShowVocabCard] = useState(false);
  const [activeSentence, setActiveSentence] = useState(null);

  // const selectedVocab = vocabData[activeWord];

  if (!article) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center">
        <p className="text-neutral-400">No article loaded. <Link to="/" className="text-emerald-400">Go back home</Link></p>
      </div>
    );
  }

  const handleWordClick = (word, sentence) => {
      setActiveWord(word);
      setActiveSentence(sentence);
      setShowVocabCard(true);
  };

  

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <header className="flex items-center justify-between border-b border-neutral-800 px-12 py-4">
        <Link to="/" className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-full bg-emerald-700" />
          <span className="text-lg font-semibold">Lexico</span>
        </Link>

        <div className="flex items-center gap-6">
          <button type="button" className="text-sm text-neutral-400 hover:text-white">
            Aa
          </button>
          <button type="button" className="text-sm font-medium text-emerald-400">
            Simplify
          </button>
          <button type="button" className="text-sm text-neutral-400 hover:text-white">
            Save
          </button>
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-neutral-800 text-neutral-400 hover:text-white"
            aria-label="Menu"
          >
            ···
          </button>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-10 px-12 py-10">
        <div className="min-w-0 flex-1">
          {historySaveFailed && (
            <p className="mb-4 text-sm text-amber-400" role="alert">
              This article is open, but it could not be saved to your history.
            </p>
          )}

          <div className="mb-8 flex items-center justify-between rounded-xl border border-emerald-900 bg-emerald-950/40 px-4 py-3">
            {/* <p className="text-sm text-emerald-400">
              {exampleArticle.keyWordsCount} key words to know before reading this article
            </p> */}
            <button type="button" className="text-sm font-medium text-emerald-400 hover:text-emerald-300">
              Review →
            </button>
          </div>

          <ArticleContent
            source={article.url}
            title={article.title}
            content={article.content}
            activeWord={activeWord}
            onWordClick={handleWordClick}
          />
        </div>

        {showVocabCard && activeWord && (
          <aside className="w-96 shrink-0">
            <div className="sticky top-10">
              <VocabCard
                word={activeWord}
                sentence={activeSentence}
                articleUrl={article.url}
                articleTitle={article.title}
                onClose={() => setShowVocabCard(false)}
              />
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

export default Reader;
