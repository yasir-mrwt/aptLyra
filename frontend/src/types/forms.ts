import type { ChangeEvent } from "react";

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
    preferredRole?: string;
    onCreated: (planId: string) => void;
}
