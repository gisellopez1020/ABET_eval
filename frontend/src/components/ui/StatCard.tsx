import { ReactNode } from 'react';

interface StatCardProps {
  title: string;
  value: string;
  icon?: ReactNode;
}

export function StatCard({
  title,
  value,
  icon,
}: StatCardProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-medium text-gray-700">
          {title}
        </p>

        {icon && (
          <span className="text-[#EF4444]">
            {icon}
          </span>
        )}
      </div>

      <p className="mt-1 text-xl font-medium text-gray-900">
        {value}
      </p>
    </div>
  );
}