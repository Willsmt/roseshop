// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BfcacheReload } from "./bfcache-reload";

const reload = vi.fn();

const pageshow = (persisted: boolean) =>
  window.dispatchEvent(
    typeof PageTransitionEvent === "function"
      ? new PageTransitionEvent("pageshow", { persisted })
      : Object.assign(new Event("pageshow"), { persisted }),
  );

beforeEach(() => {
  reload.mockClear();
  vi.stubGlobal("location", { ...window.location, reload });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("BfcacheReload (US4-3, R8, C2)", () => {
  it("pageshow com persisted=true recarrega a página uma vez", () => {
    render(<BfcacheReload />);
    pageshow(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("pageshow com persisted=false não recarrega", () => {
    render(<BfcacheReload />);
    pageshow(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("depois de desmontar, o listener é removido", () => {
    const { unmount } = render(<BfcacheReload />);
    unmount();
    pageshow(true);
    expect(reload).not.toHaveBeenCalled();
  });

  it("não renderiza nada", () => {
    const { container } = render(<BfcacheReload />);
    expect(container).toBeEmptyDOMElement();
  });
});
