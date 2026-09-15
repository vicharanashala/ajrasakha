import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * HH:MM:SS time input that wraps a native <input type="time" step="1">.
 * The step="1" attribute enables seconds in modern browsers (Chrome, Edge, Firefox).
 * The value is always a string in HH:MM:SS or HH:MM format, matching what the
 * browser reports and what the API stores.
 */
interface TimeInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
    label?: string;
    hint?: string;
    readOnly?: boolean;
}

export const TimeInput = forwardRef<HTMLInputElement, TimeInputProps>(
    ({ label, hint, className, readOnly, ...props }, ref) => {
        return (
            <div className="flex flex-col gap-1">
                {label && (
                    <label className="text-sm font-medium text-foreground">
                        {label}
                        {readOnly && (
                            <span className="ml-1 text-xs text-muted-foreground">(auto)</span>
                        )}
                    </label>
                )}
                <input
                    ref={ref}
                    type={readOnly ? 'text' : 'datetime-local'}
                    step={readOnly ? undefined : '1'}
                    readOnly={readOnly}
                    className={cn(
                        'flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1',
                        'text-sm shadow-sm transition-colors dark:[color-scheme:dark]',
                        'placeholder:text-muted-foreground',
                        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                        'disabled:cursor-not-allowed disabled:opacity-50',
                        readOnly && 'bg-muted text-muted-foreground cursor-default',
                        className,
                    )}
                    {...props}
                />
                {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
            </div>
        );
    },
);
TimeInput.displayName = 'TimeInput';
