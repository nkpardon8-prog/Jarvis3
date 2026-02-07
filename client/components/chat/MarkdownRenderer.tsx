"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useState, useCallback } from "react";

interface MarkdownRendererProps {
  content: string;
}

function CodeBlock({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || "");
  const lang = match ? match[1] : "";
  const code = String(children).replace(/\n$/, "");

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  return (
    <div className="relative group my-3">
      {lang && (
        <div className="flex items-center justify-between px-4 py-1.5 bg-[#1a1f2e] rounded-t border border-b-0 border-hud-border text-xs text-hud-text-muted">
          <span>{lang}</span>
          <button
            onClick={handleCopy}
            className="text-hud-text-muted hover:text-hud-accent transition-colors"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      )}
      <div className="relative">
        {!lang && (
          <button
            onClick={handleCopy}
            className="absolute top-2 right-2 text-xs text-hud-text-muted hover:text-hud-accent transition-colors opacity-0 group-hover:opacity-100"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        )}
        <pre
          className={`overflow-x-auto p-4 bg-[#0d1117] text-sm font-mono text-hud-text ${
            lang ? "rounded-b" : "rounded"
          } border border-hud-border`}
        >
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ className, children, ...props }) {
          const isInline = !className && typeof children === "string" && !children.includes("\n");
          if (isInline) {
            return (
              <code
                className="px-1.5 py-0.5 bg-[#1a1f2e] rounded text-hud-accent font-mono text-sm border border-hud-border"
                {...props}
              >
                {children}
              </code>
            );
          }
          return <CodeBlock className={className}>{children}</CodeBlock>;
        },
        p({ children }) {
          return <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>;
        },
        h1({ children }) {
          return <h1 className="text-xl font-bold text-hud-text mb-3 mt-4">{children}</h1>;
        },
        h2({ children }) {
          return <h2 className="text-lg font-semibold text-hud-text mb-2 mt-3">{children}</h2>;
        },
        h3({ children }) {
          return <h3 className="text-base font-semibold text-hud-text mb-2 mt-3">{children}</h3>;
        },
        ul({ children }) {
          return <ul className="list-disc list-inside mb-3 space-y-1">{children}</ul>;
        },
        ol({ children }) {
          return <ol className="list-decimal list-inside mb-3 space-y-1">{children}</ol>;
        },
        li({ children }) {
          return <li className="text-hud-text-secondary">{children}</li>;
        },
        blockquote({ children }) {
          return (
            <blockquote className="border-l-2 border-hud-accent pl-4 my-3 text-hud-text-muted italic">
              {children}
            </blockquote>
          );
        },
        a({ href, children }) {
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-hud-accent hover:underline"
            >
              {children}
            </a>
          );
        },
        table({ children }) {
          return (
            <div className="overflow-x-auto my-3">
              <table className="min-w-full border border-hud-border">{children}</table>
            </div>
          );
        },
        th({ children }) {
          return (
            <th className="px-3 py-2 bg-[#1a1f2e] border border-hud-border text-left text-sm font-semibold text-hud-text">
              {children}
            </th>
          );
        },
        td({ children }) {
          return (
            <td className="px-3 py-2 border border-hud-border text-sm text-hud-text-secondary">
              {children}
            </td>
          );
        },
        hr() {
          return <hr className="my-4 border-hud-border" />;
        },
        strong({ children }) {
          return <strong className="font-semibold text-hud-text">{children}</strong>;
        },
        em({ children }) {
          return <em className="italic text-hud-text-secondary">{children}</em>;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
