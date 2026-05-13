import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useApi } from "../../src/shared/useApi";

describe("useApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts in loading state", () => {
    const fetcher = vi.fn(() => new Promise<string>(() => undefined));
    const { result } = renderHook(() => useApi(fetcher));
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("sets data on successful fetch", async () => {
    const fetcher = vi.fn(() => Promise.resolve({ id: "1", name: "Tech" }));
    const { result } = renderHook(() => useApi(fetcher));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({ id: "1", name: "Tech" });
    expect(result.current.error).toBeNull();
  });

  it("sets error on failed fetch", async () => {
    const fetcher = vi.fn(() => Promise.reject(new Error("Network error")));
    const { result } = renderHook(() => useApi(fetcher));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe("Network error");
  });

  it("handles non-Error thrown values", async () => {
    const fetcher = vi.fn(() => Promise.reject("string error"));
    const { result } = renderHook(() => useApi(fetcher));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Unknown error");
  });

  it("refetch triggers a new data load", async () => {
    let callCount = 0;
    const fetcher = vi.fn(() => Promise.resolve(++callCount));
    const { result } = renderHook(() => useApi(fetcher));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBe(1);

    result.current.refetch();
    await waitFor(() => expect(result.current.data).toBe(2));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
