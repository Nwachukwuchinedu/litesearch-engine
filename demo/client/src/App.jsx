import { useState, useEffect, useCallback, useRef } from "react";
import "./App.css";

function esc(s) {
  if (typeof s !== "string") s = String(s);
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

export default function App() {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState("all");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [offset, setOffset] = useState(0);
  const [stats, setStats] = useState(null);
  const limit = 20;
  const debounceRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  const doSearch = useCallback(
    (q, idx, off) => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        q,
        index: idx,
        limit,
        offset: off,
      });

      fetch(`/api/search?${params}`)
        .then((r) => r.json())
        .then((data) => {
          setResults(data);
          setOffset(off);
          setLoading(false);
        })
        .catch((err) => {
          setError(err.message);
          setLoading(false);
        });
    },
    [limit]
  );

  const handleInput = useCallback(
    (e) => {
      const val = e.target.value;
      setQuery(val);
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => doSearch(val, index, 0), 150);
    },
    [index, doSearch]
  );

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Escape") {
        setQuery("");
        doSearch("", index, 0);
        inputRef.current?.blur();
      }
    },
    [index, doSearch]
  );

  const handleIndexChange = useCallback(
    (e) => {
      const idx = e.target.value;
      setIndex(idx);
      doSearch(query, idx, 0);
    },
    [query, doSearch]
  );

  useEffect(() => {
    doSearch("", "all", 0);
  }, []);

  const total = results?.total ?? 0;
  const pages = Math.ceil(total / limit);
  const page = Math.floor(offset / limit) + 1;
  const totalDocs = stats
    ? stats.users.documentCount +
      stats.products.documentCount +
      stats.articles.documentCount
    : 0;
  const totalTerms = stats
    ? stats.users.termCount +
      stats.products.termCount +
      stats.articles.termCount
    : 0;

  return (
    <div className="container">
      <h1>
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        LiteSearch — 10K Documents
        <small>{totalDocs.toLocaleString()} docs</small>
      </h1>

      <div className="toolbar">
        <input
          ref={inputRef}
          type="text"
          className="search-box"
          placeholder='Try "designer", "wireframe", "typescript", "jollof"...'
          value={query}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          autoFocus
        />
        <select value={index} onChange={handleIndexChange}>
          <option value="all">All</option>
          <option value="users">Users</option>
          <option value="products">Products</option>
          <option value="articles">Articles</option>
        </select>
      </div>

      {stats && (
        <div className="stats-bar">
          <span>&#x1F464; {stats.users.documentCount.toLocaleString()} users</span>
          <span>&#x1F4E6; {stats.products.documentCount.toLocaleString()} products</span>
          <span>&#x1F4C4; {stats.articles.documentCount.toLocaleString()} articles</span>
          <span>&#x1F3F7; {totalTerms.toLocaleString()} terms</span>
        </div>
      )}

      {error && <div className="error">{error}</div>}

      {results && (
        <div className="meta">
          {results.total.toLocaleString()} matches in{" "}
          {((results.took || 0) / 1000).toFixed(2)}s
        </div>
      )}

      <div
        className="results"
        style={{ opacity: loading ? 0.35 : 1 }}
      >
        {results &&
          (results.hits?.length > 0
            ? results.hits.map((hit, i) => (
                <SearchHitCard key={hit.id ?? i} hit={hit} index={index} />
              ))
            : !loading && (
                <div className="empty">
                  <h3>{query ? "No results" : "No documents"}</h3>
                </div>
              ))}
      </div>

      {results?.hits?.length > 0 && (
        <div className="pagination">
          <button
            onClick={() => doSearch(query, index, 0)}
            disabled={offset === 0}
          >
            First
          </button>
          <button
            onClick={() =>
              doSearch(query, index, Math.max(0, offset - limit))
            }
            disabled={offset === 0}
          >
            Prev
          </button>
          <span className="info">
            Page {page} of {pages} ({total.toLocaleString()})
          </span>
          <button
            onClick={() => doSearch(query, index, offset + limit)}
            disabled={offset + limit >= total}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function SearchHitCard({ hit, index }) {
  const [showJson, setShowJson] = useState(false);
  const d = hit.document ?? {};
  const idx = d._index ?? index;
  const type = d.type ?? idx.replace(/s$/, "");
  const title = d.name || d.title || d.email || d.id;
  const score = hit.score != null ? `${(hit.score * 100).toFixed(0)}%` : "";

  const details = [];
  if (d.email) details.push({ icon: "\u2709", text: d.email });
  if (d.department)
    details.push({ icon: "\uD83C\uDFE2", text: d.department });
  if (d.skills?.length)
    details.push({
      icon: "\u26A1",
      text: d.skills.slice(0, 3).join(", "),
    });
  if (d.category) details.push({ icon: "\uD83D\uDCC1", text: d.category });
  if (d.brand) details.push({ icon: "\uD83C\uDFF7", text: d.brand });
  if (d.price != null)
    details.push({
      icon: "\uD83D\uDCB0",
      text: `\u20A6${Number(d.price).toLocaleString()}`,
    });
  if (d.author) details.push({ icon: "\u270D", text: d.author });
  if (d.wordCount)
    details.push({ icon: "\uD83D\uDCC4", text: `${d.wordCount} words` });
  if (hit.matchType)
    details.push({ icon: "\uD83D\uDD0D", text: hit.matchType });

  const tags = d.tags || d.skills || [];
  const highlights = hit.highlights || [];
  let bodyHtml = "";
  if (highlights.length) {
    bodyHtml = highlights
      .map((h) => `<div class="hit-body">${h.snippet}</div>`)
      .join("");
  } else if (d.bio) {
    bodyHtml = `<div class="hit-body">${esc(d.bio.slice(0, 200))}</div>`;
  } else if (d.description) {
    bodyHtml = `<div class="hit-body">${esc(d.description.slice(0, 200))}</div>`;
  } else if (d.body) {
    bodyHtml = `<div class="hit-body">${esc(d.body.slice(0, 200))}</div>`;
  } else if (d.email) {
    bodyHtml = `<div class="hit-body">${esc(d.email)}</div>`;
  }

  return (
    <div className="hit">
      <div className="hit-header">
        <div className="hit-title">{esc(title)}</div>
        <span className={`hit-type ${type}`}>
          {type}
          {idx !== "all" && (
            <span style={{ opacity: 0.6 }}> ({idx})</span>
          )}
        </span>
      </div>
      <div className="hit-details">
        {score && <span className="hit-score">{score}</span>}
        {details.map((det, i) => (
          <span key={i}>
            {det.icon} {det.text}
          </span>
        ))}
      </div>
      {bodyHtml && (
        <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
      )}
      {tags.length > 0 && (
        <div className="hit-tags">
          {tags.slice(0, 6).map((t, i) => (
            <span key={i}>
              {esc(typeof t === "string" ? t : t.name || "")}
            </span>
          ))}
        </div>
      )}
      <button className="toggle-details" onClick={() => setShowJson(!showJson)}>
        JSON
      </button>
      {showJson && (
        <div className="details open">
          <pre>{esc(JSON.stringify(d, null, 2))}</pre>
        </div>
      )}
    </div>
  );
}
