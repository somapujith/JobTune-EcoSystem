import React from 'react';
import { Check } from 'lucide-react';

const GlassCard = ({ 
  emoji, 
  title, 
  description, 
  isSelected, 
  onClick, 
  className = "" 
}) => {
  return (
    <button
      onClick={onClick}
      className={`
        relative text-left flex flex-col p-5 md:p-6 rounded-[20px] transition-all duration-300 w-full
        backdrop-blur-xl border 
        ${isSelected 
          ? 'bg-white/15 border-blue-400/60 shadow-[0_0_30px_rgba(59,130,246,0.3)] scale-[1.02]' 
          : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20 hover:scale-[1.02] hover:shadow-[0_8px_30px_rgba(0,0,0,0.12)]'
        }
        ${className}
      `}
    >
      <div className="flex items-start justify-between w-full mb-2">
        {emoji && (
          <span className="text-3xl md:text-4xl drop-shadow-md mr-4">
            {emoji}
          </span>
        )}
        
        {/* Animated Checkmark for Selected State */}
        <div className={`
          flex items-center justify-center w-6 h-6 rounded-full transition-all duration-300 ml-auto
          ${isSelected ? 'bg-blue-500 scale-100 opacity-100' : 'bg-transparent border border-white/20 scale-90 opacity-0'}
        `}>
          <Check className="w-4 h-4 text-white" strokeWidth={3} />
        </div>
      </div>

      <div className="flex flex-col mt-1">
        <h3 className={`text-xl font-bold mb-1 transition-colors duration-300 ${isSelected ? 'text-white' : 'text-slate-100'}`}>
          {title}
        </h3>
        {description && (
          <p className="text-sm md:text-base text-slate-300 font-medium leading-relaxed">
            {description}
          </p>
        )}
      </div>
    </button>
  );
};

export default GlassCard;
