import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/** Chat-tuned markdown: tight spacing, Deepwater-styled code and links. */
export const Markdown = memo(function Markdown({ text }: { text: string }): React.JSX.Element {
  return (
    <div className="space-y-2 font-ui text-[13.5px] leading-relaxed text-ink select-text">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p>{children}</p>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
            >
              {children}
            </a>
          ),
          ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>,
          h1: ({ children }) => <h2 className="pt-1 text-[15px] font-semibold">{children}</h2>,
          h2: ({ children }) => <h3 className="pt-1 text-[14px] font-semibold">{children}</h3>,
          h3: ({ children }) => <h4 className="pt-1 text-[13.5px] font-semibold">{children}</h4>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-edge pl-3 text-ink-2">{children}</blockquote>
          ),
          code: ({ className, children }) => {
            const isBlock = /language-/.test(className ?? '') || String(children).includes('\n')
            if (isBlock) {
              return (
                <code className="block overflow-x-auto rounded-md border border-edge-2 bg-term p-2.5 font-mono text-[12px] leading-[1.55] whitespace-pre text-term-ink">
                  {children}
                </code>
              )
            }
            return (
              <code className="rounded bg-overlay px-1 py-0.5 font-mono text-[12px] text-accent">
                {children}
              </code>
            )
          },
          pre: ({ children }) => <pre className="my-1">{children}</pre>,
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="border-collapse text-[12.5px]">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-edge bg-raised px-2 py-1 text-left font-medium">{children}</th>
          ),
          td: ({ children }) => <td className="border border-edge-2 px-2 py-1">{children}</td>,
          hr: () => <hr className="border-edge-2" />
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
})
