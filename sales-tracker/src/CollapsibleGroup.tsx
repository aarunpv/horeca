import React, { useId, useState, type ReactNode } from "react";

interface CollapsibleGroupProps {
  title: string;
  count?: number;
  children: ReactNode;
  defaultExpanded?: boolean;
  className?: string;
}

export const CollapsibleGroup: React.FC<CollapsibleGroupProps> = ({
  title,
  count,
  children,
  defaultExpanded = true,
  className = "",
}) => {
  const contentId = useId();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <section className={`crm-card-section w-full min-w-0 overflow-hidden border border-gray-200 bg-white ${className}`}>
      <h2>
        <button
          type="button"
          aria-expanded={isExpanded}
          aria-controls={contentId}
          onClick={() => setIsExpanded((expanded) => !expanded)}
          className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600"
        >
          <span className="min-w-0 truncate text-sm font-bold text-gray-900">{title}</span>
          <span className="flex shrink-0 items-center gap-2 text-xs text-gray-500">
            {count !== undefined && <span>{count}</span>}
            <svg
              aria-hidden="true"
              className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path fillRule="evenodd" d="M5.22 7.22a.75.75 0 0 1 1.06 0L10 10.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 8.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
            </svg>
          </span>
        </button>
      </h2>
      {isExpanded && (
        <div id={contentId} className="border-t border-gray-100 px-0 py-3">
          {children}
        </div>
      )}
    </section>
  );
};
