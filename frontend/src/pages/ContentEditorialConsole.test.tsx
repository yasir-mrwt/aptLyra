import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { store } from "../app/store";
import { clearRole } from "../features/auth/roleSlice";
import ContentEditorialConsole from "./ContentEditorialConsole";
import { editorialQueryCache } from "../services/editorialQueryCache";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("../services/apiClient", () => ({ default: { get, post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));

const questionHash = "a".repeat(64);
const renderConsole = () => render(<Provider store={store}><MemoryRouter><ContentEditorialConsole /></MemoryRouter></Provider>);
const sectionNav = () => within(screen.getByRole("navigation", { name: "Editorial sections" }));
const baseline = { question_version_id: "baseline-version", question_text: "Explain how a database index helps a query.",
  category: "conceptual-oral", difficulty: "standard", primary_competency: "dbms-sql.queries", topic: "SQL queries",
  inventory_class: "TRUSTED_BASELINE", origin: "Aptlyra starter", display_status: "Ready for interviews" };
const bankData = { starterQuestions: 48, approvedNewQuestions: 0, totalAvailable: 48, questions: [baseline] };

beforeEach(() => {
  vi.clearAllMocks();
  editorialQueryCache.clear();
  store.dispatch(clearRole());
  store.dispatch({ type: "role/fetchCurrent/fulfilled", payload: { userId: "editor", role: "reviewer", reviewerLinked: true } });
  get.mockImplementation((path: string) => {
    if (path === "/content-intelligence/interview-bank") return Promise.resolve({ data: bankData });
    if (path === "/content-intelligence/review/candidates") return Promise.resolve({ data: [] });
    if (path === "/content-intelligence/review-queue") return Promise.resolve({ data: [] });
    return Promise.resolve({ data: [] });
  });
});
afterEach(() => { cleanup(); store.dispatch(clearRole()); });

describe("simplified editorial workflow", () => {
  it("keeps primary navigation to the bank and review queue and reuses cached bank data", async () => {
    renderConsole();
    await waitFor(() => expect(get).toHaveBeenCalledWith("/content-intelligence/interview-bank"));
    const nav = sectionNav();
    expect(nav.getByRole("button", { name: "Interview Bank" })).toBeTruthy();
    expect(nav.getByRole("button", { name: /Review Queue/ })).toBeTruthy();
    expect(nav.queryByRole("button", { name: "Evidence" })).toBeNull();
    expect(nav.queryByRole("button", { name: "Scoring" })).toBeNull();
    expect(nav.queryByRole("button", { name: "Sources" })).toBeNull();

    fireEvent.click(nav.getByRole("button", { name: /Review Queue/ }));
    await waitFor(() => expect(get).toHaveBeenCalledWith("/content-intelligence/review/candidates"));
    const bankFetches = get.mock.calls.filter(([path]) => path === "/content-intelligence/interview-bank").length;
    fireEvent.click(nav.getByRole("button", { name: "Interview Bank" }));
    await waitFor(() => expect(screen.getByText("Starter Questions")).toBeTruthy());
    expect(get.mock.calls.filter(([path]) => path === "/content-intelligence/interview-bank")).toHaveLength(bankFetches);
  });

  it("shows the trusted starter inventory and keeps full hashes out of the normal bank view", async () => {
    renderConsole();
    await waitFor(() => expect(screen.getByText("Starter Questions")).toBeTruthy());
    expect(screen.getAllByText("48")).toHaveLength(2);
    expect(screen.getByText("Approved New Questions")).toBeTruthy();
    expect(screen.getByText("Total Available")).toBeTruthy();
    expect(screen.getByText(baseline.question_text)).toBeTruthy();
    expect(screen.getByText("Ready for interviews")).toBeTruthy();
    expect(screen.queryByText(questionHash)).toBeNull();
    expect(screen.getByText(/Advanced \/ Baseline audit/)).toBeTruthy();
  });

  it("reports a failed dynamic question request instead of showing a false zero", async () => {
    get.mockImplementation((path: string) => path === "/content-intelligence/review/candidates"
      ? Promise.reject(new Error("temporary failure"))
      : path === "/content-intelligence/interview-bank" ? Promise.resolve({ data: bankData }) : Promise.resolve({ data: [] }));
    renderConsole();
    fireEvent.click(sectionNav().getByRole("button", { name: /Review Queue/ }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Questions could not be loaded"));
    expect(sectionNav().getByRole("button", { name: /Review Queue · Error/ })).toBeTruthy();
    expect(sectionNav().queryByRole("button", { name: /Review Queue · 0/ })).toBeNull();
  });

  it("offers optional AI and an independent manual decision for a new question", async () => {
    const candidate = { candidate_id: "dynamic-candidate", state: "review_required", content_hash: questionHash,
      specification: { text: "What does an index change about a database query?" }, source_name: "Practice submission", source_type: "user_submission",
      permission_status: "permitted", review_status: "approved", company_label: null, role: "Backend Developer", occurred_on: null,
      round_type: "technical", topics: ["SQL"], normalized_text: "A user submitted this practice question.", duplicate_links: [],
      derivation_type: "direct", confidence: null, extraction_metadata: {}, ai_review: null, ai_processing_consent: true, model_processing_allowed: true };
    get.mockImplementation((path: string) => {
      if (path === "/content-intelligence/interview-bank") return Promise.resolve({ data: bankData });
      if (path === "/content-intelligence/review/candidates") return Promise.resolve({ data: [candidate] });
      return Promise.resolve({ data: [] });
    });
    renderConsole();
    fireEvent.click(sectionNav().getByRole("button", { name: /Review Queue/ }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Backend Developer" })).toBeTruthy());
    expect(screen.getAllByText("What does an index change about a database query?").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Review with AI" })).toBeTruthy();
    expect(screen.getByText("Optional. You can review and decide manually without AI.")).toBeTruthy();
    fireEvent.click(screen.getByText("Review manually · edit, approve or reject"));
    expect(screen.getByRole("button", { name: "Approve manually" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit and approve" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reject" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Publish source record/ })).toBeNull();
  });
});
