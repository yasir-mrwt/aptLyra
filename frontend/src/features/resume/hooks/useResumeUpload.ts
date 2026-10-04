import { useState, useRef } from "react";
import { toast } from "react-toastify";
import axios from "axios";
import { uploadResume } from "../../../services/resumeApi";

interface UseResumeUploadProps {
  onUploadStart: () => void;
  onUploadSuccess: () => void;
  onUploadError: () => void;
}

export const useResumeUpload = ({
  onUploadStart,
  onUploadSuccess,
  onUploadError,
}: UseResumeUploadProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [jdText, setJdText] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const f = e.dataTransfer.files[0];
      const ext = f.name.split(".").pop()?.toLowerCase();
      if (["pdf", "docx", "txt"].includes(ext || "")) {
        setFile(f);
      } else {
        toast.error("Unsupported format. Use PDF, DOCX, or TXT.");
      }
    }
  };

  const handleUpload = async () => {
    if (!file) return toast.error("Please select a file first");
    
    onUploadStart();
    
    try {
      await uploadResume(file, jdText);
      toast.info("Resume uploaded. AI is starting analysis...");
      onUploadSuccess();
    } catch (error: unknown) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message || error.message
        : "Upload failed";
      toast.error(message);
      onUploadError();
    }
  };

  const handleReset = () => {
    setFile(null);
    setJdText("");
  };

  return {
    file,
    jdText,
    setJdText,
    dragActive,
    fileInputRef,
    handleFileChange,
    handleDrag,
    handleDrop,
    handleUpload,
    handleReset,
  };
};
