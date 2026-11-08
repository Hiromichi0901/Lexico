import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ArticleCard from "../components/ArticleCard";
import { useArticleHistory } from "../hooks/useArticleHistory";
import { useAuth } from "../hooks/useAuth";
import {
  formatLastOpened,
  historyViewer,
  isLoadedArticle,
  normalizeArticleUrl,
} from "../lib/articleHistory";
import { saveOpenedArticle } from "../services/articleHistory";
import { scrapeUrl } from "../services/scraper";

function Home() {
  const { user } = useAuth();
  const { articles, status, retry } = useArticleHistory(user);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const opening = useRef(false);
  const navigate = useNavigate();

  const openArticle = async (rawUrl) => {
    const normalized = normalizeArticleUrl(rawUrl);
    if (!normalized) {
      setError("Enter a full http or https link.");
      return;
    }
    if (opening.current) return;

    opening.current = true;
    setLoading(true);
    setError("");
    try {
      const scraped = await scrapeUrl(normalized);
      const article = { ...scraped, url: normalized };
      if (!isLoadedArticle(article)) {
        setError("Couldn't open that article.");
        return;
      }

      let historySaveFailed = false;
      if (historyViewer(user).mode === "account") {
        try {
          await saveOpenedArticle(user, {
            url: article.url,
            title: article.title,
          });
        } catch (saveError) {
          console.error("Saving article history failed:", saveError);
          historySaveFailed = true;
        }
      }

      navigate("/reader", { state: { article, historySaveFailed } });
    } catch (openError) {
      console.error("Scraping failed:", openError);
      setError("Couldn't open that article. Check the link and try again.");
    } finally {
      opening.current = false;
      setLoading(false);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    openArticle(url);
  };

  return (
    <div className="flex flex-col items-center justify-center text-white p-8">
      <h1 className="text-2xl font-semibold flex items-center gap-4">
        <span>Past a link.</span>
        <span>Start reading.</span>
      </h1>
      <form
        onSubmit={handleSubmit}
        className="mt-8 w-full max-w-3xl bg-neutral-800 rounded-2xl py-2 px-3 flex items-center gap-2"
      >
        <input
          type="text"
          placeholder="Paste a URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="flex-1 bg-transparent text-white placeholder-neutral-500 px-2 py-3 text-base outline-none"
        />
        <button
          type="submit"
          disabled={loading}
          className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-3 rounded-xl font-medium disabled:cursor-wait disabled:opacity-60"
        >
          {loading ? "loading..." : "Read →"}
        </button>
      </form>
      {error && (
        <p className="mt-3 w-full max-w-3xl text-sm text-red-400" role="alert">
          {error}
        </p>
      )}

      <section className="mt-7 w-full max-w-3xl">
        <h2 className="text-sm font-medium text-neutral-500">Recently opened</h2>
        {status !== "ready" && <HistoryStatus status={status} onRetry={retry} />}
        {status === "ready" && user?.email && (
          <p className="mt-1 text-sm text-neutral-500">Saved for {user.email}</p>
        )}
        {status === "ready" && articles.length === 0 && (
          <p className="mt-4 text-sm text-neutral-500">
            No articles yet. Open a link above and it will show up here.
          </p>
        )}
        {status === "ready" && articles.length > 0 && (
          <div className="mt-4 grid w-full grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
            {articles.map((article) => (
              <ArticleCard
                key={article.id}
                url={article.url}
                title={article.title}
                openedLabel={formatLastOpened(article.lastOpenedAt)}
                onOpen={() => openArticle(article.url)}
                disabled={loading}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function HistoryStatus({ status, onRetry }) {
  if (status === "loading") {
    return <p className="mt-4 text-sm text-neutral-500">Loading your articles…</p>;
  }

  if (status === "error") {
    return (
      <div className="mt-4">
        <p className="text-sm text-red-400" role="alert">
          Couldn't load your articles.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-xl bg-neutral-800 px-4 py-2 text-sm text-white hover:bg-neutral-700"
        >
          Try again
        </button>
      </div>
    );
  }

  if (status === "anonymous") {
    return (
      <p className="mt-4 text-sm text-neutral-500">
        History is saved for signed-in accounts only. Anonymous reading still works, and nothing is stored.
      </p>
    );
  }

  if (status === "signed-out") {
    return (
      <p className="mt-4 text-sm text-neutral-500">
        Sign in with your account to see articles you've opened.
      </p>
    );
  }

  return null;
}

export default Home;
