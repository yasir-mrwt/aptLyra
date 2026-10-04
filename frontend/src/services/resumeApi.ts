import apiClient from "./apiClient";

const resumeApi = apiClient;

export const uploadResume = async (file: File, jdText?: string) => {
    const formData = new FormData();
    formData.append("resume", file);
    if (jdText) {
        formData.append("jdText", jdText);
    }

    const response = await resumeApi.post("/resume/upload", formData, {
        headers: {
            "Content-Type": "multipart/form-data",
        },
    });
    return response.data;
};

export const getUserResumes = async (page = 1, limit = 20) => {
    const response = await resumeApi.get(`/resume/?page=${page}&limit=${limit}`);
    const payload = response.data;
    return {
        data: payload?.data ?? payload,
        hasMore: payload?.hasMore ?? false,
        total: payload?.total ?? 0,
    };
};

export const getResume = async (id: string) => {
    const response = await resumeApi.get(`/resume/${id}`);
    // Backend wraps in { success, data: resumeDoc } — unwrap it
    return response.data?.data ?? response.data;
};

export const getResumeStatus = async (id: string) => {
    const response = await resumeApi.get(`/resume/${id}/status`);
    return response.data?.data ?? response.data;
};

export const deleteResume = async (id: string) => {
    const response = await resumeApi.delete(`/resume/${id}`);
    return response.data;
};

export default resumeApi;

