import React, { useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import useAuthStore from '../store/useAuthStore';
import useSubscriptionStore from '../store/useSubscriptionStore';
import { Zap, AlertCircle } from 'lucide-react';

// NOTE: No payment gateway is wired up yet. verifyPayment() calls a mock
// backend verifier that always succeeds for a valid pending order — swap
// in a real gateway (e.g. Razorpay checkout + signature verification)
// before accepting real money.
export default function PaymentConfirm() {
  const { isAuthenticated } = useAuthStore();
  const { verifyPayment } = useSubscriptionStore();
  const [searchParams] = useSearchParams();
  const orderRef = searchParams.get('order');
  const [isProcessing, setIsProcessing] = useState(true);
  const [error, setError] = useState(null);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const handleContinue = async () => {
    if (!orderRef) {
      setError('Missing order reference. Please restart plan selection.');
      return;
    }
    setError(null);
    try {
      await verifyPayment(orderRef);
      setIsProcessing(false);
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 1000);
    } catch (err) {
      setError(err?.response?.data?.error || 'Payment verification failed. Please try again.');
    }
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-6">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto" />
          <h1 className="text-3xl font-black text-slate-900 dark:text-white">Payment Not Confirmed</h1>
          <p className="text-slate-600 dark:text-slate-400">{error}</p>
          <button
            onClick={handleContinue}
            className="w-full py-4 px-6 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all active:scale-95"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!isProcessing) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-6">
        <div className="text-center">
          <div className="text-6xl mb-4 animate-bounce">✅</div>
          <h1 className="text-4xl font-black text-slate-900 dark:text-white mb-3">Payment Confirmed!</h1>
          <p className="text-lg text-slate-600 dark:text-slate-400 mb-8">Redirecting to your dashboard...</p>
          <div className="w-64 h-1 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full mx-auto animate-pulse"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-8">
        {/* Animated processing icon */}
        <div className="flex justify-center">
          <div className="relative w-24 h-24">
            <div className="absolute inset-0 bg-blue-600 rounded-full animate-pulse opacity-30"></div>
            <div className="absolute inset-2 bg-blue-600 rounded-full animate-pulse opacity-60" style={{ animationDelay: '0.2s' }}></div>
            <div className="absolute inset-4 bg-blue-600 rounded-full flex items-center justify-center">
              <Zap className="w-10 h-10 text-white" />
            </div>
          </div>
        </div>

        {/* Message */}
        <div>
          <h1 className="text-4xl font-black text-slate-900 dark:text-white mb-3">Processing Payment</h1>
          <p className="text-lg text-slate-600 dark:text-slate-400">
            We're finalizing your plan selection and setting up your account...
          </p>
        </div>

        {/* Status messages */}
        <div className="space-y-3 text-left bg-white dark:bg-slate-800 rounded-xl p-6">
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 rounded-full bg-green-500 animate-bounce"></div>
            <span className="text-slate-700 dark:text-slate-300 font-medium">Plan selected</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '0.2s' }}></div>
            <span className="text-slate-700 dark:text-slate-300 font-medium">Activating tools</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '0.4s' }}></div>
            <span className="text-slate-700 dark:text-slate-300 font-medium">Preparing dashboard</span>
          </div>
        </div>

        {/* Continue button */}
        <button
          onClick={handleContinue}
          className="w-full py-4 px-6 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all active:scale-95"
        >
          Continue to Dashboard
        </button>

        <p className="text-sm text-slate-600 dark:text-slate-400">
          This page will auto-redirect in a few seconds...
        </p>
      </div>
    </div>
  );
}
