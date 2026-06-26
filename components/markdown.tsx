import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

// LLMs often emit math as \[ ... \] / \( ... \); remark-math expects $$ / $.
// Normalise so KaTeX renders it.
function normalizeMath(text: string): string {
  return text
    .replace(/\\\[/g, "$$$$") // \[  -> $$
    .replace(/\\\]/g, "$$$$") // \]  -> $$
    .replace(/\\\(/g, "$$") //   \(  -> $
    .replace(/\\\)/g, "$$"); //   \)  -> $
}

export function Markdown({ children }: { children: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
      >
        {normalizeMath(children)}
      </ReactMarkdown>
    </div>
  );
}
