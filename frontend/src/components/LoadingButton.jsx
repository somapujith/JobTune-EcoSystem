import { Loader } from 'lucide-react';

export default function LoadingButton({ loading, children, ...props }) {
  return (
    <button {...props} disabled={loading || props.disabled} className={`flex items-center justify-center gap-2 disabled:opacity-75 disabled:cursor-not-allowed ${props.className}`}>
      {loading && <Loader className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  );
}
