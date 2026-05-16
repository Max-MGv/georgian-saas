'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Section } from '@/lib/parseVault'

type Props = {
  section: Section | null
  open: boolean
  onClose: () => void
}

export default function DetailPanel({ section, open, onClose }: Props) {
  return (
    <div
      className={`absolute top-0 right-0 h-full w-96 bg-gray-900 border-l border-gray-700 z-20 flex flex-col
        transition-transform duration-300 ease-in-out
        ${open ? 'translate-x-0' : 'translate-x-full'}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 flex-shrink-0">
        <h2 className="text-white font-semibold text-base truncate pr-2">
          {section?.label ?? ''}
        </h2>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white text-xl leading-none flex-shrink-0 transition-colors"
          aria-label="Close panel"
        >
          ×
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {section && (
          <>
            {/* Task checklist */}
            {section.tasks.length > 0 && (
              <div className="mb-5">
                <div className="text-xs text-gray-500 uppercase tracking-widest mb-3">
                  Tasks — {section.tasks.filter(t => t.done).length}/{section.tasks.length}
                </div>
                <div className="space-y-2">
                  {section.tasks.map(task => (
                    <div key={task.id} className="flex items-start gap-2.5">
                      <div
                        className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors
                          ${task.done ? 'bg-emerald-500 border-emerald-500' : 'border-gray-600'}`}
                      >
                        {task.done && (
                          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 10">
                            <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <span className={`text-sm leading-snug ${task.done ? 'text-gray-500 line-through' : 'text-gray-200'}`}>
                        {task.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Markdown detail */}
            {section.detailMarkdown && (
              <div className="border-t border-gray-700 pt-4">
                <div className="text-xs text-gray-500 uppercase tracking-widest mb-3">Details</div>
                <div className="text-sm text-gray-300 leading-relaxed space-y-2 markdown-content">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h1: ({ children }) => <h1 className="text-white font-semibold text-base mt-4 mb-1">{children}</h1>,
                      h2: ({ children }) => <h2 className="text-white font-semibold text-sm mt-3 mb-1">{children}</h2>,
                      h3: ({ children }) => <h3 className="text-gray-200 font-medium text-sm mt-2 mb-1">{children}</h3>,
                      p: ({ children }) => <p className="text-gray-300 text-sm">{children}</p>,
                      li: ({ children }) => <li className="text-gray-300 text-sm ml-3 list-disc">{children}</li>,
                      ul: ({ children }) => <ul className="space-y-1 my-1">{children}</ul>,
                      ol: ({ children }) => <ol className="space-y-1 my-1 list-decimal ml-3">{children}</ol>,
                      code: ({ children }) => <code className="bg-gray-800 text-emerald-400 px-1 py-0.5 rounded text-xs font-mono">{children}</code>,
                      strong: ({ children }) => <strong className="text-white font-semibold">{children}</strong>,
                      a: ({ children }) => <span className="text-blue-400">{children}</span>,
                    }}
                  >
                    {section.detailMarkdown}
                  </ReactMarkdown>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
