import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import uploadBigFile from "./Upload";

const createMockFile = (size: number, name = "test.txt"): File => {
  const blob = new Blob([new Array(size).fill("a").join("")]);
  return new File([blob], name);
};

describe("uploadBigFile", () => {
  const mockFetch = vi.fn();
  const mockSetItem = vi.spyOn(window.localStorage.__proto__, "setItem");
  const mockGetItem = vi.spyOn(window.localStorage.__proto__, "getItem");
  const mockRemoveItem = vi.spyOn(window.localStorage.__proto__, "removeItem");

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockSetItem.mockClear();
    mockGetItem.mockClear().mockReturnValue(null);
    mockRemoveItem.mockClear();
    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should call onSucceed when all chunks uploaded successfully", async () => {
    const file = createMockFile(1024 * 1024 * 10);
    const onProgress = vi.fn();
    const onFail = vi.fn();
    const onSucceed = vi.fn();

    mockFetch.mockResolvedValue({ ok: true });

    const instance = uploadBigFile({
      file,
      maxConcurrent: 2,
      onProgress,
      onFail,
      onSucceed,
      retryTimes: 2,
    });

    await instance.start();

    expect(mockFetch).toHaveBeenCalled();
    expect(onFail).not.toHaveBeenCalled();
    expect(onSucceed).toHaveBeenCalled();
    expect(onProgress).toHaveBeenCalled();
  });

  it("should retry on failure and eventually call onFail", async () => {
    const file = createMockFile(1024 * 1024 * 5); 
    const onProgress = vi.fn();
    const onFail = vi.fn();
    const onSucceed = vi.fn();

    mockFetch.mockImplementation(() =>
      Promise.reject(new Error("Upload failed"))
    );

    const instance = uploadBigFile({
      file,
      maxConcurrent: 1,
      onProgress,
      onFail,
      onSucceed,
      retryTimes: 2, 
    });

    await instance.start();

    // 等待上传及重试逻辑执行完成
    await new Promise((r) => setTimeout(r, 100));

    expect(onFail).toHaveBeenCalled();
    expect(onSucceed).not.toHaveBeenCalled();
  });

  it('should cancel upload and clear localStorage', async () => {
    const file = createMockFile(1024 * 1024 * 5)
    const onProgress = vi.fn()
    const onFail = vi.fn()
    const onSucceed = vi.fn()

    mockFetch.mockImplementation(() => new Promise(() => {}))

    const instance = uploadBigFile({
      file,
      maxConcurrent: 1,
      onProgress,
      onFail,
      onSucceed,
    })

    instance.start()
    await new Promise((r) => setTimeout(r, 10))
    instance.cancel()

    expect(mockRemoveItem).toHaveBeenCalled()
  })

  it('should pause and continue upload correctly', async () => {
    const file = createMockFile(1024 * 1024 * 10) // 10MB
    const onProgress = vi.fn()
    const onFail = vi.fn()
    const onSucceed = vi.fn()

    let resolveFetch: () => void
    const fetchPromise = new Promise<void>((resolve) => {
      resolveFetch = resolve
    })

    mockFetch.mockImplementation(() => fetchPromise.then(() => ({ ok: true })))

    const instance = uploadBigFile({
      file,
      maxConcurrent: 2,
      onProgress,
      onFail,
      onSucceed,
    })

    instance.start()

    await new Promise((r) => setTimeout(r, 20))

    instance.stop()

    const callCountBefore = mockFetch.mock.calls.length

    await new Promise((r) => setTimeout(r, 30))

    const callCountAfter = mockFetch.mock.calls.length
    expect(callCountAfter).toBe(callCountBefore)

    resolveFetch!()

    instance.continue()

    await new Promise((r) => setTimeout(r, 50))

    expect(mockFetch.mock.calls.length).toBeGreaterThan(callCountBefore)
  })
});
