import React, { useState } from "react";
import { Excalidraw, exportToBlob } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { motion } from "framer-motion";
import { X, Check } from "lucide-react";
import { toast } from "react-toastify";
interface WhiteboardModalProps {
  onClose: () => void;
  onSubmit: (blob: Blob, elements: readonly unknown[]) => void;
  initialElements?: readonly unknown[];
}

interface ExcalidrawAPIRef {
  getSceneElements: () => readonly unknown[];
  getAppState: () => Record<string, unknown>;
  getFiles: () => Record<string, unknown>;
}

const WhiteboardModal: React.FC<WhiteboardModalProps> = ({ onClose, onSubmit, initialElements }) => {
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawAPIRef | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const handleSubmit = async () => {
    if (!excalidrawAPI) return;

    const elements = excalidrawAPI.getSceneElements();
    if (!elements || !elements.length) {
      toast.warning("Please draw something before submitting.");
      return;
    }

    setIsExporting(true);

    try {

      const blob = await exportToBlob({
        elements,
        mimeType: "image/png",
        appState: {
          ...excalidrawAPI.getAppState(),
          exportWithDarkMode: true,
          exportBackground: true,
        },
        files: excalidrawAPI.getFiles(),
      });

      if (blob && blob.size > 10 * 1024 * 1024) {
        toast.error("Diagram image is too large. Max size is 10MB.");
        setIsExporting(false);
        return;
      }

      onSubmit(blob, elements);
    } catch (err) {
      console.error("Error exporting whiteboard:", err);
      toast.error("Failed to export whiteboard diagram.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-6xl h-[85vh] flex flex-col bg-surface-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl"
      >
        <div className="flex justify-between items-center p-4 border-b border-white/5 bg-surface-800">
          <h2 className="text-lg font-black uppercase tracking-widest text-white">System Design Whiteboard</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 text-surface-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 relative w-full h-full custom-excalidraw">
          <Excalidraw
            initialData={initialElements && initialElements.length > 0 ? { elements: initialElements as never } : undefined}
            excalidrawAPI={(api: unknown) => setExcalidrawAPI(api as ExcalidrawAPIRef)}
            theme="dark"
            UIOptions={{
              canvasActions: {
                loadScene: false,
                saveToActiveFile: false,
                export: false,
              }
            }}
          />
        </div>

        <div className="p-4 border-t border-white/5 bg-surface-800 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-full text-xs font-black uppercase tracking-widest text-surface-300 hover:text-white bg-white/5 hover:bg-white/10 transition-colors"
            disabled={isExporting}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isExporting}
            className="px-6 py-2.5 rounded-full text-xs font-black uppercase tracking-widest text-white bg-primary-600 hover:bg-primary-500 transition-colors flex items-center gap-2"
          >
            {isExporting ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Check size={16} />
            )}
            {isExporting ? 'Saving...' : 'Save Diagram'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default WhiteboardModal;
