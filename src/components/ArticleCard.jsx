function ArticleCard({ url, title, openedLabel, onOpen, disabled }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={disabled}
      className="flex min-h-36 w-full flex-col items-center justify-center gap-1 rounded-2xl bg-neutral-800 px-4 py-3 text-center text-white transition-colors hover:bg-neutral-700 disabled:cursor-wait disabled:opacity-60"
    >
      <p className="w-full truncate text-sm text-neutral-500" title={url}>
        {url}
      </p>
      <p className="w-full truncate text-lg font-medium" title={title}>
        {title}
      </p>
      <p className="w-full truncate text-xs text-neutral-500" title={openedLabel}>
        {openedLabel}
      </p>
    </button>
  );
}

export default ArticleCard;
