import type { ChangeEvent, SyntheticEvent } from "react";

/**
 * Universal event type for form change handlers, supporting both native
 * HTML events and custom object-based updates (from CustomSelect).
 */
export type FormChangeEvent =
    | ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
    | { target: { name: string; value: string | number } };

/**
 * Props for the New Interview creation form.
 */
export interface NewInterviewFormProps {
    formData: {
        role: string;
        level: string;
        interviewType: string;
        count: number;
        company?: string;
        companyTrack?: string;
        resumeId?: string;
    };
    onChange: (e: FormChangeEvent) => void;
    onSubmit: (e: SyntheticEvent) => void;
    isProcessing: boolean;
}
