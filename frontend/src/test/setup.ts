import '@testing-library/jest-dom/vitest'

// jsdom には Intersection Observer / matchMedia などが無いため、
// Recharts などが参照する API を最小限スタブする。
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver =
  ResizeObserverStub as unknown as typeof ResizeObserver
