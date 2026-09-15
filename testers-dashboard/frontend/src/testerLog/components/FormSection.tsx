import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FormSectionProps {
    title: string;
    children: React.ReactNode;
    defaultOpen?: boolean;
    badge?: string | number;
}

/**
 * Collapsible accordion section for grouping form fields.
 * Starts open by default (defaultOpen=true).
 */
export function FormSection({ title, children, defaultOpen = true, badge }: FormSectionProps) {
    const [open, setOpen] = useState(defaultOpen);

    return (
        <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className={cn(
                    'w-full flex items-center justify-between px-4 py-3',
                    'text-left font-semibold text-sm text-foreground',
                    'bg-muted/50 hover:bg-muted transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                )}
            >
                <span className="flex items-center gap-2">
                    {title}
                    {badge !== undefined && (
                        <span className="inline-flex items-center justify-center rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
                            {badge}
                        </span>
                    )}
                </span>
                {open ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
            </button>
            {open && (
                <div className="px-4 py-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {children}
                </div>
            )}
        </div>
    );
}
