function WordListItem({ word, result, savedLabel, sourceLabel }) { // this forms the word card
  return (
    <li className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
      <div className="flex items-start justify-between gap-4"> {/*word*/}
        <h3 className="text-lg font-semibold text-white">{word.word}</h3>
        {result && (
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
              result === 'correct'
                ? 'bg-emerald-900 text-emerald-300'
                : 'bg-neutral-800 text-neutral-400'
            }`}
          >
            {result === 'correct' ? 'Knew it' : "Didn't know"}
          </span>
        )}
      </div>

      {word.definitionEn && (
        <p className="mt-2 text-sm leading-relaxed text-neutral-400">{word.definitionEn}</p>
      )}
      {word.definitionJa && <p className="mt-2 text-sm text-emerald-400">{word.definitionJa}</p>}
      {word.exampleSentence && (
        <p className="mt-3 text-sm italic leading-relaxed text-neutral-500">
          "{word.exampleSentence}"
        </p>
      )}
      {(sourceLabel || savedLabel) && (
        <p className="mt-3 text-xs text-neutral-500">
          {sourceLabel}
          {sourceLabel && savedLabel ? ' · ' : ''}
          {savedLabel}
        </p>
      )}
    </li>
  );
}

export default WordListItem;
