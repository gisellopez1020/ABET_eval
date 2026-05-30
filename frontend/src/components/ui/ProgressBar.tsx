interface ProgressBarProps {
  value: number;
  max?: number;
  showLabel?: boolean;
  className?: string;
}

export function ProgressBar({ value, max = 100, showLabel = true, className = '' }: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const isComplete = pct >= 100;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            isComplete ? 'bg-green-500' : 'bg-uao-accent'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <span className={`text-xs font-medium w-10 text-right ${isComplete ? 'text-green-600' : 'text-uao-accent'}`}>
          {Math.round(pct)}%
        </span>
      )}
    </div>
  );
}
