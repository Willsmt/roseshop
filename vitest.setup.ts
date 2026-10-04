import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// "server-only" lança fora da condição `react-server`; nos testes vira no-op.
vi.mock("server-only", () => ({}));
