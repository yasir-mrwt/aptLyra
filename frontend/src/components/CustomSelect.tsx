import React, { useState, useRef, useEffect } from "react";
import type { Option, CustomSelectProps } from "../types/components";

const CustomSelect: React.FC<CustomSelectProps> = ({
    options,
    value,
    onChange,
    name,
    label,
    placeholder
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const normalizedOptions: Option[] = options.map(opt => {
        if (typeof opt === 'object') return opt;
        return { label: String(opt), value: opt };
    });

    const selectedOption = normalizedOptions.find(opt => opt.value === value) || normalizedOptions[0];

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSelect = (val: string | number) => {
        onChange(name, val);
        setIsOpen(false);
    };

    return (
        <div className={`relative ${isOpen ? 'z-50' : 'z-10'}`} ref={containerRef}>
            {label && <label className="text-[10px] font-black text-surface-500 uppercase tracking-[0.2em] ml-1 block mb-3">{label}</label>}
            
            <div className="relative">
                <div 
                    onClick={() => setIsOpen(!isOpen)}
                    className={`w-full bg-white/1 overflow-hidden border border-white/10 rounded-xl p-2.5 px-6 text-xs font-bold text-white cursor-pointer transition-all hover:bg-white/10 flex items-center justify-between ${isOpen ? 'ring-2 ring-primary-500/50 border-primary-500/50' : ''}`}
                >
                <span className="truncate">{selectedOption?.label || placeholder}</span>
                <div className={`absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-surface-500 transition-transform duration-300 ${isOpen ? 'rotate-180 text-primary-400' : ''}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"></path></svg>
                </div>
            </div>

            {isOpen && (
                <div className="absolute z-50 top-[calc(100%+8px)] left-0 w-full glass-card bg-surface-950/95 backdrop-blur-xl border-white/10 rounded-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 shadow-2xl">
                    <div className="max-h-60 overflow-y-auto py-2 scrollbar-thin scrollbar-thumb-white/10">
                        {normalizedOptions.map((opt) => (
                            <div
                                key={opt.value}
                                onClick={() => handleSelect(opt.value)}
                                className={`px-5 py-3 text-xs font-bold cursor-pointer transition-colors ${opt.value === value ? 'bg-primary-500/20 text-primary-400' : 'text-surface-300 hover:bg-white/5 hover:text-white'}`}
                            >
                                {opt.label}
                            </div>
                        ))}
                    </div>
                </div>
            )}
            </div>
        </div>
    );
};

export default CustomSelect;
