import { Fragment } from "react";

/**
 * Prose styles for rendered post content. Shared by the public blog post
 * page and the admin editor preview so they match exactly.
 */
export const proseClass = `text-slate-700
  [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:tracking-tight [&_h2]:text-slate-900
  [&_h3]:mt-8 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-slate-900
  [&_p]:my-4 [&_p]:leading-7
  [&_a]:font-medium [&_a]:text-brand-600 [&_a]:underline [&_a]:decoration-brand-200 [&_a]:underline-offset-2 hover:[&_a]:text-brand-700
  [&_ul]:my-4 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6
  [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-6
  [&_li]:leading-7
  [&_strong]:font-semibold [&_strong]:text-slate-900
  [&_em]:italic
  [&_blockquote]:my-6 [&_blockquote]:border-l-4 [&_blockquote]:border-brand-200 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-slate-600
  [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-sm
  [&_pre]:my-6 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-slate-900 [&_pre]:p-4 [&_pre]:text-sm [&_pre]:text-slate-100
  [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-inherit
  [&_img]:my-6 [&_img]:max-w-full [&_img]:rounded-xl
  [&_hr]:my-8 [&_hr]:border-slate-200`;

/* ------------------------------ inline parsing ---------------------------- */

const INLINE_PATTERNS = [
  {
    re: /!\[([^\]]*)\]\(([^)\s]+)\)/, // ![alt](url)
    // eslint-disable-next-line @next/next/no-img-element
    render: (m, key) => <img key={key} src={m[2]} alt={m[1]} loading="lazy" />,
  },
  {
    re: /\[([^\]]+)\]\(([^)\s]+)\)/, // [text](url)
    render: (m, key) => (
      <a
        key={key}
        href={m[2]}
        {...(/^https?:\/\//.test(m[2])
          ? { target: "_blank", rel: "noopener noreferrer" }
          : {})}
      >
        {parseInline(m[1])}
      </a>
    ),
  },
  {
    re: /\*\*([^*]+)\*\*/, // **bold**
    render: (m, key) => <strong key={key}>{parseInline(m[1])}</strong>,
  },
  {
    re: /\*([^*]+)\*/, // *italic*
    render: (m, key) => <em key={key}>{parseInline(m[1])}</em>,
  },
  {
    re: /`([^`]+)`/, // `code`
    render: (m, key) => <code key={key}>{m[1]}</code>,
  },
];

function parseInline(text) {
  const nodes = [];
  let rest = text;
  let key = 0;
  while (rest) {
    let best = null;
    for (const pattern of INLINE_PATTERNS) {
      const match = pattern.re.exec(rest);
      if (match && (!best || match.index < best.match.index)) {
        best = { match, pattern };
      }
    }
    if (!best) {
      nodes.push(rest);
      break;
    }
    if (best.match.index > 0) nodes.push(rest.slice(0, best.match.index));
    nodes.push(best.pattern.render(best.match, key++));
    rest = rest.slice(best.match.index + best.match[0].length);
  }
  return nodes;
}

/* ------------------------------ block parsing ----------------------------- */

/**
 * Renders markdown (headings, paragraphs, lists, quotes, images, links,
 * bold/italic/code, dividers) as React elements. Style the output by
 * wrapping it in an element with `proseClass`.
 */
export default function Markdown({ content }) {
  const lines = String(content ?? "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let i = 0;

  const collect = (test) => {
    const group = [];
    while (i < lines.length && test(lines[i])) group.push(lines[i++]);
    return group;
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
    } else if (/^### /.test(trimmed)) {
      blocks.push(<h3 key={i}>{parseInline(trimmed.slice(4))}</h3>);
      i++;
    } else if (/^##? /.test(trimmed)) {
      blocks.push(<h2 key={i}>{parseInline(trimmed.replace(/^#+ /, ""))}</h2>);
      i++;
    } else if (/^(---|\*\*\*)\s*$/.test(trimmed)) {
      blocks.push(<hr key={i} />);
      i++;
    } else if (/^[-*] /.test(trimmed)) {
      const items = collect((l) => /^[-*] /.test(l.trim()));
      blocks.push(
        <ul key={i}>
          {items.map((item, j) => (
            <li key={j}>{parseInline(item.trim().slice(2))}</li>
          ))}
        </ul>
      );
    } else if (/^\d+[.)] /.test(trimmed)) {
      const items = collect((l) => /^\d+[.)] /.test(l.trim()));
      blocks.push(
        <ol key={i}>
          {items.map((item, j) => (
            <li key={j}>{parseInline(item.trim().replace(/^\d+[.)] /, ""))}</li>
          ))}
        </ol>
      );
    } else if (/^> ?/.test(trimmed)) {
      const quoted = collect((l) => /^> ?/.test(l.trim()));
      blocks.push(
        <blockquote key={i}>
          {quoted.map((q, j) => (
            <Fragment key={j}>
              {j > 0 ? <br /> : null}
              {parseInline(q.trim().replace(/^> ?/, ""))}
            </Fragment>
          ))}
        </blockquote>
      );
    } else {
      const para = collect((l) => {
        const t = l.trim();
        return (
          t &&
          !/^#{1,3} /.test(t) &&
          !/^[-*] /.test(t) &&
          !/^\d+[.)] /.test(t) &&
          !/^> ?/.test(t) &&
          !/^(---|\*\*\*)\s*$/.test(t)
        );
      });
      blocks.push(<p key={i}>{parseInline(para.join(" ").trim())}</p>);
    }
  }

  return blocks;
}
