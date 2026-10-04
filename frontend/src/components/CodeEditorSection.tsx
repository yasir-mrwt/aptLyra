import React, { useState, useEffect, useRef } from "react";
import MonacoEditor from "@monaco-editor/react";
import { SUPPORTED_LANGUAGES } from "../constants/interview";
import CustomSelect from "./CustomSelect";

interface CodeEditorSectionProps {
    language: string;
    code: string;
    isQuestionLocked: boolean;
    setLanguage: (lang: string) => void;
    updateCode: (code: string | undefined) => void;
}

const CodeEditorSection: React.FC<CodeEditorSectionProps> = ({
    language,
    code,
    isQuestionLocked,
    setLanguage,
    updateCode
}) => {
    // Local state for immediate feedback
    const [localCode, setLocalCode] = useState(code);
    const debounceTimerRef = useRef<number | null>(null);

    // Update local state when the prop changes (e.g. navigation between questions)
    useEffect(() => {
        setLocalCode(code);
    }, [code]);

    const handleCodeChange = (newVal: string | undefined) => {
        if (isQuestionLocked) return;
        
        // 1. Update local state immediately for zero-latency typing
        setLocalCode(newVal ?? "");

        // 2. Clear existing timer
        if (debounceTimerRef.current !== null) {
            window.clearTimeout(debounceTimerRef.current);
        }

        // 3. Set a new timer to update parent state (and localStorage) after 500ms
        debounceTimerRef.current = window.setTimeout(() => {
            updateCode(newVal);
        }, 500);
    };

    // Cleanup timer on unmount
    useEffect(() => {
        return () => {
            if (debounceTimerRef.current !== null) {
                window.clearTimeout(debounceTimerRef.current);
            }
        };
    }, []);

    return (
        <div className="bg-surface-900 rounded-[2.5rem] group/form h-125 flex flex-col border border-white/5 relative overflow-visible">
            <div className="flex justify-between items-center px-8 py-3 bg-white/5 border-b border-white/5 overflow-visible rounded-t-[2.5rem] z-20">
                <span className="text-[10px] font-black text-surface-500 uppercase tracking-widest">Workspace</span>
                <div className="w-48">
                    <CustomSelect 
                        label="" 
                        name="language" 
                        options={SUPPORTED_LANGUAGES} 
                        value={language} 
                        onChange={(_, val) => setLanguage(String(val))} 
                    />
                </div>
            </div>
            <div className="flex-1 opacity-90 overflow-visible relative z-10">
                <MonacoEditor
                    height="100%"
                    language={language}
                    theme="vs-dark"
                    value={localCode}
                    onChange={handleCodeChange}
                    options={{
                        minimap: { enabled: false },
                        fontSize: 13,
                        scrollBeyondLastLine: false,
                        readOnly: isQuestionLocked,
                        domReadOnly: isQuestionLocked,
                        automaticLayout: true,
                    }}
                />
            </div>
        </div>
    );
};

export default CodeEditorSection;
