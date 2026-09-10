import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
// jsdom lacks ResizeObserver; cmdk (CommandDialog) requires it.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// jsdom also lacks scrollIntoView; cmdk scrolls the selected item into view.
Element.prototype.scrollIntoView ??= () => {};
window.ResizeObserver ??= ResizeObserverStub;
// jsdom lacks pointer-capture APIs; Radix Select requires them.
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.setPointerCapture ??= () => {};
Element.prototype.releasePointerCapture ??= () => {};
