// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import apiClient from "../services/apiClient";
import ShareInterviewExperience from "./ShareInterviewExperience";

vi.mock("../services/apiClient", () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }));

describe("ShareInterviewExperience", () => {
  beforeEach(() => { vi.mocked(apiClient.get).mockResolvedValue({ data: [] } as never); vi.mocked(apiClient.post).mockResolvedValue({} as never); });

  it("requires both permissions and submits an authenticated quarantine request", async () => {
    render(<ShareInterviewExperience />);
    const submit = screen.getByRole("button", { name: "Submit for review" });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Topics remembered, one per line"), { target: { value: "SQL indexing" } });
    fireEvent.click(screen.getByLabelText(/consent to use this submission/i));
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(/right to share/i));
    expect((submit as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(submit);
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith("/content-intelligence/submissions", expect.objectContaining({
      role: "Software Engineer", topics: ["SQL indexing"], practiceConsent: true, rightToShare: true,
      aiProcessingConsent: false,
    })));
    expect((await screen.findByRole("status")).textContent).toContain("quarantined");
  });
});
