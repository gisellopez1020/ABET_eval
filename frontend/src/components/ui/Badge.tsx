import { ReactNode } from 'react';

type BadgeVariant = 'success' | 'warning' | 'error' | 'neutral' | 'info';

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
}

const classes: Record<BadgeVariant, string> = {
  success: 'bg-green-100 text-green-800',
  warning: 'bg-yellow-100 text-yellow-800',
  error: 'bg-red-100 text-red-800',
  neutral: 'bg-gray-100 text-gray-700',
  info: 'bg-blue-100 text-blue-800',
};

export function Badge({ variant = 'neutral', children }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${classes[variant]}`}>
      {children}
    </span>
  );
}
