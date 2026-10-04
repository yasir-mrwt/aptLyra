export const formatDuration = (start: string | number | Date | undefined, end: string | number | Date | undefined) => {
    if (!start || !end) return 'N/A';
    const diff = Math.abs(new Date(end).getTime() - new Date(start).getTime());
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    const h = hours;
    const m = minutes % 60;
    const s = seconds % 60;

    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
};

export const sanitizeQuestionText = (text: string | undefined) => {
    if (!text) return '';
    return text.replace(/^\d+[\s. )]+/, '').trim();
};

export const formatIdealAnswer = (text: string | undefined) => {
    try {
        if (!text) return 'Pending Evaluation';

        let cleanText = text.trim();

        if (cleanText.startsWith('```json')) {
            cleanText = cleanText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
        }

        if (cleanText.startsWith('{') && cleanText.endsWith('}')) {
            const parsed = JSON.parse(cleanText);

            if (parsed.verbalAnswer || parsed.idealAnswer || parsed.ideal_answer) {
                return parsed.verbalAnswer || parsed.idealAnswer || parsed.ideal_answer;
            }

            const explanation = parsed.explanation || parsed.understanding || "";
            const code = parsed.code || parsed.codeExample || parsed.example || "";

            if (explanation || code) {
                let formattedCode = typeof code === 'string' ? code.trim() : JSON.stringify(code, null, 2);
                if (formattedCode && !formattedCode.startsWith('```')) {
                    formattedCode = `\`\`\`\n${formattedCode}\n\`\`\``;
                }
                return `${explanation}${formattedCode ? `\n\n${formattedCode}` : ''}`.trim();
            }
        }

        return text;
    } catch {
        return text;
    }
};
