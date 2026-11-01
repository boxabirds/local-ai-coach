import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { ComponentProps } from "react";
import type { CopilotChatView } from "@copilotkit/react-core/v2";

vi.mock("@copilotkit/react-core/v2", () => ({
  CopilotChatView: (props: ComponentProps<typeof CopilotChatView>) => <>
    <input aria-label="Message" value={props.inputValue} onChange={(event) => props.onInputChange?.(event.target.value)} />
    <button onClick={() => props.onSubmitMessage?.(props.inputValue ?? "")}>Send</button>
    <button onClick={() => props.onSelectSuggestion?.({ title: "Read Priya's story", message: "Read Priya's story", isLoading: false }, 0)}>Starter</button>
  </>,
}));

const submit = vi.fn();
const select = vi.fn();

/** COACH_STUB is read when the module loads, so each case imports it fresh. */
async function mount(flag: string | undefined) {
  vi.resetModules();
  if (flag === undefined) vi.stubEnv("NEXT_PUBLIC_COACH_STUB", "");
  else vi.stubEnv("NEXT_PUBLIC_COACH_STUB", flag);
  const { ProviderKeysProvider, useProviderKeys } = await import("./provider-keys");
  const { KeyGatedChatView, StubBadge } = await import("./key-gated-chat-view");
  function Harness() {
    const { keysOpen } = useProviderKeys();
    return <>
      <StubBadge />
      <KeyGatedChatView onSubmitMessage={submit} onSelectSuggestion={select} />
      {keysOpen && <div role="dialog">keys</div>}
    </>;
  }
  render(<ProviderKeysProvider><Harness /></ProviderKeysProvider>);
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

it("TC-58 with the stub flag on, sends without keys and shows the banner", async () => {
  await mount("1");
  expect(screen.getByTestId("coach-stub-banner")).toHaveTextContent("Stub coach, no model");
  fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Find my number" } });
  fireEvent.click(screen.getByText("Send"));
  expect(submit).toHaveBeenCalledExactlyOnceWith("Find my number");
  fireEvent.click(screen.getByText("Starter"));
  expect(select).toHaveBeenCalledOnce();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it.each([undefined, "0", "true"])("TC-59 with the flag %j, keeps the upstream gate and no banner", async (flag) => {
  await mount(flag);
  expect(screen.queryByTestId("coach-stub-banner")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Find my number" } });
  fireEvent.click(screen.getByText("Send"));
  expect(submit).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});
