import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { LambdaGuideCard } from "./LambdaGuideCard";
import { renderWithProviders } from "@/test/utils";

const mockCreateDemo = vi.fn();

vi.mock("@/hooks/use-lambda", () => ({
  useLambdaActions: () => ({
    createDemo: mockCreateDemo,
    removeFunction: vi.fn(),
  }),
}));

describe("LambdaGuideCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateDemo.mockResolvedValue("demo-hello");
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("renders empty state header, action buttons, and snippet preview", () => {
    renderWithProviders(<LambdaGuideCard onOpenGuide={vi.fn()} />);

    expect(screen.getByText("No Lambda functions")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /quick demo function/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /full guide/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/awslocal lambda create-function/i),
    ).toBeInTheDocument();
  });

  it("switches snippet tabs and copies snippet", () => {
    renderWithProviders(<LambdaGuideCard onOpenGuide={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "TypeScript / Node.js" }));
    expect(screen.getByText(/CreateFunctionCommand/i)).toBeInTheDocument();

    const copyBtn = screen.getByRole("button", { name: "Copy snippet" });
    fireEvent.click(copyBtn);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("CreateFunctionCommand"),
    );
  });

  it("calls createDemo and onFunctionCreated when clicking Quick demo function", async () => {
    const onFunctionCreated = vi.fn();
    renderWithProviders(
      <LambdaGuideCard
        onOpenGuide={vi.fn()}
        onFunctionCreated={onFunctionCreated}
      />,
    );

    const demoBtn = screen.getByRole("button", { name: /quick demo function/i });
    fireEvent.click(demoBtn);

    expect(mockCreateDemo).toHaveBeenCalledWith("demo-hello");
    // wait for promise to resolve
    await vi.waitFor(() => {
      expect(onFunctionCreated).toHaveBeenCalledWith("demo-hello");
    });
  });

  it("triggers onOpenGuide when clicking Full guide", () => {
    const onOpenGuide = vi.fn();
    renderWithProviders(<LambdaGuideCard onOpenGuide={onOpenGuide} />);

    fireEvent.click(screen.getByRole("button", { name: /full guide/i }));
    expect(onOpenGuide).toHaveBeenCalledOnce();
  });
});
