/**
 * Renders admin-edited page content. Format:
 *   - lines starting with "## " become section headings
 *   - blank lines separate paragraphs
 */
export default function RichText({ content }) {
  const blocks = String(content)
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  return blocks.map((block, i) => {
    if (block.startsWith("## ")) {
      return (
        <h2 key={i} className="mt-8 text-xl font-bold text-slate-900">
          {block.slice(3).trim()}
        </h2>
      );
    }
    return (
      <p key={i} className="mt-3 whitespace-pre-line leading-7 text-slate-600">
        {block}
      </p>
    );
  });
}
