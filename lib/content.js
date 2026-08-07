/**
 * Blog content helpers. New posts are stored as HTML (WYSIWYG editor);
 * older posts and the built-in content/blog files are markdown. These
 * helpers detect which is which and upgrade markdown to HTML.
 */

const HTML_TAG_RE =
  /<(p|h[1-6]|ul|ol|li|blockquote|img|figure|hr|br|div|strong|em|a|pre|code|table|span|u|s)\b/i;

export function looksLikeHtml(content) {
  return HTML_TAG_RE.test(String(content ?? ""));
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Inline markdown (on already-escaped text) → HTML. */
function inline(text) {
  return text
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img src="$2" alt="$1">')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

/** Markdown (the subset used by the old posts) → HTML string. */
export function markdownToHtml(markdown) {
  const lines = escapeHtml(String(markdown ?? "").replace(/\r\n/g, "\n")).split("\n");
  const blocks = [];
  let i = 0;

  const collect = (test) => {
    const group = [];
    while (i < lines.length && test(lines[i].trim())) group.push(lines[i++].trim());
    return group;
  };

  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      i++;
    } else if (/^### /.test(trimmed)) {
      blocks.push(`<h3>${inline(trimmed.slice(4))}</h3>`);
      i++;
    } else if (/^##? /.test(trimmed)) {
      blocks.push(`<h2>${inline(trimmed.replace(/^#+ /, ""))}</h2>`);
      i++;
    } else if (/^(---|\*\*\*)\s*$/.test(trimmed)) {
      blocks.push("<hr>");
      i++;
    } else if (/^[-*] /.test(trimmed)) {
      const items = collect((t) => /^[-*] /.test(t));
      blocks.push(
        `<ul>${items.map((t) => `<li><p>${inline(t.slice(2))}</p></li>`).join("")}</ul>`
      );
    } else if (/^\d+[.)] /.test(trimmed)) {
      const items = collect((t) => /^\d+[.)] /.test(t));
      blocks.push(
        `<ol>${items
          .map((t) => `<li><p>${inline(t.replace(/^\d+[.)] /, ""))}</p></li>`)
          .join("")}</ol>`
      );
    } else if (/^&gt; ?/.test(trimmed) || /^> ?/.test(trimmed)) {
      const quoted = collect((t) => /^(&gt;|>) ?/.test(t));
      blocks.push(
        `<blockquote><p>${quoted
          .map((t) => inline(t.replace(/^(&gt;|>) ?/, "")))
          .join("<br>")}</p></blockquote>`
      );
    } else {
      const para = collect(
        (t) =>
          t &&
          !/^#{1,3} /.test(t) &&
          !/^[-*] /.test(t) &&
          !/^\d+[.)] /.test(t) &&
          !/^(&gt;|>) ?/.test(t) &&
          !/^(---|\*\*\*)\s*$/.test(t)
      );
      blocks.push(`<p>${inline(para.join(" ").trim())}</p>`);
    }
  }
  return blocks.join("\n");
}
