import "@testing-library/jest-dom/vitest";

// jsdom lacks ResizeObserver; cmdk (CommandDialog) requires it.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// jsdom also lacks scrollIntoView; cmdk scrolls the selected item into view.
Element.prototype.scrollIntoView ??= () => {};
window.ResizeObserver ??= ResizeObserverStub;
