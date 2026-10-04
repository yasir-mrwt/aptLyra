import React, { useState, useEffect } from "react";
import { ROLES, LEVELS, TYPES, COUNTS } from "../constants/interview";
import CustomSelect from "./CustomSelect";
import { COMPANIES } from "../constants/companies";
import type { NewInterviewFormProps } from "../types/forms";
import type { ResumeData } from "../features/resume/types";
import { getUserResumes } from "../services/resumeApi";
import { toast } from "react-toastify";

const NewInterviewForm: React.FC<NewInterviewFormProps> = ({
    formData,
    onChange,
    onSubmit,
    isProcessing,
}) => {
    const handleCustomChange = (name: string, value: string | number) => {
        onChange({ target: { name, value } });
    };

    const [resumes, setResumes] = useState<ResumeData[]>([]);

    useEffect(() => {
        const fetchResumes = async () => {
            try {
                const { data } = await getUserResumes();
                // Filter only completed resumes that have text/analysis
                setResumes(data.filter((r: ResumeData) => r.status === 'completed' || r.parsedData));
            } catch (error) {
                console.error("Failed to fetch resumes:", error);
                toast.error("Failed to load your resumes. Please try again later.");
            }
        };
        fetchResumes();
    }, []);

    const resumeOptions = [
        { label: "None (Standard Interview)", value: "" },
        ...resumes.map(r => ({ label: r.originalFilename || "Unnamed Resume", value: r._id }))
    ];

    const companyOptions = Object.values(COMPANIES).map(c => ({
        label: c.name,
        value: c.id
    }));

    const selectedCompany = COMPANIES[formData.company || "general"];
    const trackOptions = selectedCompany?.tracks.map(t => ({
        label: t.name,
        value: t.id
    })) || [{ label: "General", value: "general" }];

    return (
        <div className="glass-card rounded-3xl relative group/form z-10 transform-gpu overflow-hidden">
            <div className="bg-white/[0.02] px-10 py-6 border-b border-white/[0.06] flex items-center justify-between rounded-t-3xl">
                <h2 className="text-xl font-black text-white flex items-center gap-4 font-display">
                    <span className="bg-white w-1.5 h-6 rounded-full shadow-[0_0_15px_rgba(255,255,255,0.3)]"></span>
                    Initiate <span className="text-surface-500">Session</span>
                </h2>
                <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-rose-500/70"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-400/70"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-400/70"></div>
                </div>
            </div>
            <form onSubmit={onSubmit} className="p-8 sm:p-10 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                <CustomSelect
                    label="Professional Role"
                    name="role"
                    options={ROLES}
                    value={formData.role}
                    onChange={handleCustomChange}
                />

                <CustomSelect
                    label="Experience Level"
                    name="level"
                    options={LEVELS}
                    value={formData.level}
                    onChange={handleCustomChange}
                />

                <CustomSelect
                    label="Question Count"
                    name="count"
                    options={COUNTS.map(c => ({ label: `${c} Questions`, value: c }))}
                    value={formData.count}
                    onChange={handleCustomChange}
                />

                <CustomSelect
                    label="Interview Type"
                    name="interviewType"
                    options={TYPES}
                    value={formData.interviewType}
                    onChange={handleCustomChange}
                />

                <CustomSelect
                    label="Target Company"
                    name="company"
                    options={companyOptions}
                    value={formData.company || "general"}
                    onChange={(_, value) => {
                        handleCustomChange("company", value);
                        // Reset track when company changes
                        const companyObj = COMPANIES[value as string];
                        if (companyObj && companyObj.tracks.length > 0) {
                            handleCustomChange("companyTrack", companyObj.tracks[0].id);
                        } else {
                            handleCustomChange("companyTrack", "general");
                        }
                    }}
                />

                <CustomSelect
                    label="Company Track"
                    name="companyTrack"
                    options={trackOptions}
                    value={formData.companyTrack || "general"}
                    onChange={handleCustomChange}
                />

                <CustomSelect
                    label="Resume (Optional)"
                    name="resumeId"
                    options={resumeOptions}
                    value={formData.resumeId || ""}
                    onChange={handleCustomChange}
                />
                </div>

                {/* Footer — helper note left, primary action right */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-5 border-t border-white/5 pt-7">
                    <p className="text-[12px] text-surface-500 font-medium text-center sm:text-left">
                        Company and track selections are saved with the interview. {formData.interviewType === "company-specific" ? "Both are required for this mode. " : "They are optional in other modes. "}
                        Ava will build <span className="text-surface-300 font-bold">{formData.count} questions</span> tailored to a{" "}
                        <span className="text-surface-300 font-bold">{formData.level} {formData.role}</span>
                        {formData.resumeId ? <> — grounded in <span className="text-primary-300 font-bold">your resume</span></> : null}.
                    </p>
                    <button
                        type="submit"
                        disabled={isProcessing}
                        className={`w-full sm:w-auto h-14 px-10 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 transition-all active:scale-[0.98] shrink-0 ${isProcessing ? 'bg-surface-800 text-surface-500 cursor-not-allowed' : 'bg-white hover:bg-zinc-200 text-black shadow-lg shadow-black/40 cursor-pointer hover:-translate-y-0.5'}`}
                    >
                        {isProcessing ? (
                            <>
                                <span className="animate-spin h-4 w-4 border-2 border-surface-500 border-t-transparent rounded-full"></span>
                                Preparing questions…
                            </>
                        ) : (
                            <>
                                Launch Prep
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
                            </>
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default NewInterviewForm;
