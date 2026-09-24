import { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'danger'
  | 'ghost'
  | 'outline';

type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  loading?: boolean;
}

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-[#9E0B0F] text-white hover:bg-[#82090d]',
  secondary:
    'bg-white text-gray-800 border hover:bg-gray-200',
  danger:
    'bg-red-50 text-red-700 hover:bg-red-100', 
  ghost:
    'text-gray-600 hover:bg-gray-100',
  outline:
    'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'px-3 py-2 text-xs',
  md: 'px-4 py-2.5 text-sm',
  lg: 'px-5 py-3 text-base',
};

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  disabled,
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`
        inline-flex items-center justify-center gap-2
        rounded-lg
        font-medium
        transition
        disabled:cursor-not-allowed
        disabled:opacity-50
        ${variants[variant]}
        ${sizes[size]}
        ${className}
      `}
      {...props}
    >
      {icon}
      {loading ? 'Cargando...' : children}
    </button>
  );
}