import { InputHTMLAttributes, ReactNode } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  leftIcon?: ReactNode;
}

export function Input({
  label,
  error,
  leftIcon,
  className = '',
  ...props
}: InputProps) {
  return (
    <div className="w-full">
      {label && (
        <label className="mb-2 block text-sm font-medium text-gray-700">
          {label}
        </label>
      )}

      <div className="relative">
        {leftIcon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            {leftIcon}
          </div>
        )}

        <input
          {...props}
          className={`
            w-full rounded-lg border border-gray-200
            bg-white px-3 py-2.5
            text-sm outline-none
            transition
            focus:border-[#9E0B0F]
            focus:ring-2 focus:ring-[#9E0B0F]/10
            ${leftIcon ? 'pl-10' : ''}
            ${className}
          `}
        />
      </div>

      {error && (
        <p className="mt-1 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}