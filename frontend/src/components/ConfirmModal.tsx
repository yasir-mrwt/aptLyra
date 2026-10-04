import React from 'react';
import type { ConfirmModalProps } from '../types/components';

const ConfirmModal: React.FC<ConfirmModalProps> = ({
    isOpen,
    title,
    message,
    onConfirm,
    onCancel,
    confirmText = "Confirm",
    cancelText = "Cancel",
    isDanger = false
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4 sm:p-6">
            {/* Backdrop */}
            <div 
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300" 
                onClick={onCancel}
            />
            
            {/* Modal Content */}
            <div className="bg-white w-full max-w-md rounded-4xl shadow-2xl relative z-10 overflow-hidden animate-in zoom-in-95 duration-300 border border-slate-100">
                <div className="p-8 sm:p-10 text-center">
                    <div className={`w-20 h-20 rounded-4xl mx-auto mb-6 flex items-center justify-center text-3xl ${isDanger ? 'bg-red-50 text-red-500' : 'bg-violet-50 text-violet-600'}`}>
                        {isDanger ? (
                            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                        )}
                    </div>
                    
                    <h3 className="text-xl sm:text-2xl font-black text-slate-900 mb-2 leading-tight tracking-tight">
                        {title}
                    </h3>
                    <p className="text-slate-500 font-medium text-sm sm:text-base px-2">
                        {message}
                    </p>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-3 p-8 sm:p-10 pt-0">
                    <button
                        onClick={onCancel}
                        className="flex-1 py-4 px-6 font-bold text-slate-500 bg-slate-50 hover:bg-slate-100 rounded-2xl transition-all active:scale-[0.98] cursor-pointer"
                    >
                        {cancelText}
                    </button>
                    <button
                        onClick={onConfirm}
                        className={`flex-1 py-4 px-6 font-bold text-white rounded-2xl shadow-lg transition-all active:scale-[0.98] cursor-pointer ${isDanger ? 'bg-red-500 hover:bg-red-600 shadow-red-100' : 'bg-violet-500 hover:bg-violet-600 shadow-violet-100'}`}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmModal;
