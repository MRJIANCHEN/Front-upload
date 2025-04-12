/**
 * 实现一个大文件上传方法
 *
 * 支持功能以下功能：
 *  - 支持分片上传
 *  - 支持控制分片最大并发数
 *
 * 尽可能的符合以下要求：
 *  - 支持上传进度回调
 *  - 支持断点续传
 *  - 支持上传失败重试
 */

interface UploadBigFile {
  (payload: {
    /**
     * 模拟文件，一个单位为一个chunk
     */
    file: File;
    /**
     * 最大并发数
     */
    maxConcurrent: number;
    /**
     * 总的上传回调
     */
    onProgress: (progress: number) => void;
    /**
     * 任意一片上传失败即为失败
     */
    onFail: (error: Error) => void;
    /**
     * 上传成功
     */
    onSucceed: () => void;
    /**
     * 单片上传失败重试次数
     */
    retryTimes?: number;
  }): {
    start: () => void;
    stop: () => void;
    continue: () => void;
    cancel: () => void;
  };
}

/**
 *
 * const instance = uploadBigFile({})
 *
 * instance.start() // 开始上传
 * instance.stop() // 暂停上传
 * instance.continue() // 继续上传
 * instance.cancel() // 取消上传
 */

/**
 * upload big file Function
 */
const uploadBigFile: UploadBigFile = (options) => {
  const {
    file,
    maxConcurrent,
    onProgress,
    onFail,
    onSucceed,
    retryTimes = 0,
  } = options;

  /**
   * Define chunk size
   */
  const chunkSize = 5 * 1024 * 1024;

  /**
   * Define path to storage the loaded file data
   */
  const fileName = encodeURIComponent(file.name + file.size);

  /**
   * Define isPaused
   */
  let isPaused = false;

  /**
   * Define isCancel
   */
  let isCancel = false;

  /**
   * Get the loaded chunk data Function
   */
  const getUploadedChunks = () => {
    const data = localStorage.getItem(fileName);
    return data ? JSON.parse(data) : [];
  };

  /**
   * Get the loaded chunk data
   */
  const loadedChunk = getUploadedChunks();
 
  /**
   * Create chunk data array
   */
  const createChunk = () => {
    const chunks: Array<{index:number;blob:any}> = [];
    let start = 0;
    let index = 0;

    while (start < file.size) {
      const end = Math.min(file.size, start + chunkSize);
      if (!loadedChunk.includes(index)) {
        chunks.push({
          index,
          blob: file.slice(start, end),
        });
      }
      start = end;
      index++;
    }
    return chunks;
  };

  /**
   * storage uploaded chunk data
   */
  const uploadedChunks: unknown[] = [];
  const saveUploadedChunk = (index: number) => {
    uploadedChunks.push(index);
    localStorage.setItem(fileName, JSON.stringify(uploadedChunks));
  };

  /**
   * total chunk number
   */
  const totalChunks = Math.ceil(file.size / chunkSize) as any;
  let current = 0;

  /**
   * upload file
   */
  const controller = new AbortController();

  const uploadChunk = async (chunk, retryCount = 0) => {
    const formData = new FormData();
    formData.append("file", chunk.blob);
    formData.append("fileName", fileName);
    formData.append("chunkIndex", chunk.index);
    formData.append("totalChunks", totalChunks);

    try {
      const res: unknown = await fetch("www.abc.com", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        onFail(new Error("Bad network!"));
      }

      if (isCancel) {
        onFail(new Error("cancel uploading!"));
        return;
      }

      saveUploadedChunk(chunk.index);
      onProgress((uploadedChunks.length / totalChunks) * 100);
    } catch (err) {
      if (retryCount < retryTimes) {
        await uploadChunk(chunk, retryCount + 1);
      } else {
        onFail(new Error(`failed after ${retryTimes} times`));
      }
    }
  };

  /**
   * file upload Function
   */
  const startUpload = async () => {
    const fileChunk = createChunk();
    const pool = new Array(maxConcurrent).fill(null).map(async () => {
      while (current < totalChunks) {
        if (isPaused) {
          return;
        }
        const chunkIndex = current++;
        const data = fileChunk[chunkIndex];
        await uploadChunk(data);
      }
    });
    await Promise.all(pool);
    onSucceed();
  };

  /**
   * Pause uploading
   */
  const pauseUpload = () => {
    isPaused = true;
  };

  /**
   * Define continue function
   */
  const continueUpload = () => {
    isPaused = false;
    startUpload();
  };

  /**
   * Define cancel Function
   */
  const cancelUpload = () => {
    isCancel = true;
    isPaused = false;
    controller.abort();
    localStorage.removeItem(fileName);
  };

  return {
    start: startUpload,
    stop: pauseUpload,
    continue: continueUpload,
    cancel: cancelUpload,
  };
};

export default uploadBigFile;
