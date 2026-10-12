// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import apiClient from "../services/apiClient";
import ShareInterviewExperience from "./ShareInterviewExperience";

vi.mock("../services/apiClient", () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }));

describe("ShareInterviewExperience", () => {
  beforeEach(() => { vi.mocked(apiClient.get).mockResolvedValue({ data: [] } as never); vi.mocked(apiClient.post).mockResolvedValue({} as never); });

  it("submits one question with optional AI consent and simple confirmation", async () => {
    render(<ShareInterviewExperience />);
    const submit = screen.getByRole("button", { name: "Submit" });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Question"), { target: { value: "What is a SQL index?" } });
    fireEvent.click(screen.getByLabelText(/right to share/i));
    expect((submit as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(submit);
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith("/content-intelligence/submissions", expect.objectContaining({
      question: "What is a SQL index?", rightToShare: true,
      aiProcessingConsent: false,
    })));
    expect((await screen.findByRole("status")).textContent).toContain("Question submitted for review.");
  });
});
