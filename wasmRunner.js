 //Optional (Alternate for in browser fallback): Use YoWASP Clang/LLD WebAssembly compiler to compile C++17 code to WebAssembly and execute in browser with WASI support. This is a fallback when Judge0 API is unavailable or unreachable.


// ===================================================================
// CodeBench - WebAssembly (WASM) C++ Execution Runner
// Real in-browser C++ compilation and execution fallback using:
// ===================================================================

// Defensive polyfill for global language identifier
if (typeof globalThis !== "undefined" && !("language" in globalThis)) {
  Object.defineProperty(globalThis, "language", {
    get() {
      if (typeof document !== "undefined") {
        return document.getElementById("languageSelect")?.value || "cpp";
      }
      return "cpp";
    },
    configurable: true,
    enumerable: false
  });
}

// Cached Clang module reference
let clangModulePromise = null;

// Default execution timeout (5 seconds)
const EXECUTION_TIMEOUT_MS = 5000;

// Virtual C++ exception stubs allowing C++17 STL compilation without -fno-exceptions
const EXCEPTION_STUBS_CPP = `
extern "C" {
  void* __cxa_allocate_exception(unsigned long size) { return (void*)0; }
  void __cxa_throw(void* thrown, void* tinfo, void* dest) { __builtin_trap(); }
  void __cxa_free_exception(void* thrown) {}
  void* __cxa_begin_catch(void* exc) { return (void*)0; }
  void __cxa_end_catch() {}
}
`;

/**
 * Loads the YoWASP Clang compiler toolchain.
 * Tries local package, browser CDN import, or Blob/Data URL fallback without deprecated escaping.
 */
async function getClangCompiler() {
  if (clangModulePromise) return clangModulePromise;

  clangModulePromise = (async () => {
    // 1. Try local @yowasp/clang package import
    try {
      const localClang = await import("@yowasp/clang");
      if (localClang && typeof localClang.runClang === "function") {
        return localClang;
      }
    } catch {}

    // 2. Try native browser ESM import from CDN
    const CDN_URL = "https://cdn.jsdelivr.net/npm/@yowasp/clang@22.0.0-git20542-10/gen/bundle.js";
    try {
      const cdnClang = await import(CDN_URL);
      if (cdnClang && typeof cdnClang.runClang === "function") {
        return cdnClang;
      }
    } catch {}

    // 3. Fetch and import via Blob URL (browser) or Base64 Data URL (Node.js)
    try {
      const res = await fetch(CDN_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      let text = await res.text();
      // Ensure relative asset URLs resolve to CDN and use fetch even in Node environments
      text = text.replaceAll('url.protocol === "file:"', 'false');
      text = text.replaceAll('new URL("./llvm', 'new URL("https://cdn.jsdelivr.net/npm/@yowasp/clang@22.0.0-git20542-10/gen/llvm');
      text = text.replaceAll('new URL("./llvm-resources.tar', 'new URL("https://cdn.jsdelivr.net/npm/@yowasp/clang@22.0.0-git20542-10/gen/llvm-resources.tar');

      let moduleUrl;
      const isNodeEnv = typeof process !== "undefined" && process.versions?.node;
      if (!isNodeEnv && typeof Blob !== "undefined" && typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
        const blob = new Blob([text], { type: "application/javascript" });
        moduleUrl = URL.createObjectURL(blob);
      } else if (typeof Buffer !== "undefined") {
        moduleUrl = "data:text/javascript;base64," + Buffer.from(text, "utf8").toString("base64");
      } else {
        moduleUrl = "data:text/javascript;charset=utf-8," + encodeURIComponent(text);
      }

      const dataMod = await import(moduleUrl);
      if (dataMod && typeof dataMod.runClang === "function") {
        return dataMod;
      }
    } catch (dataErr) {
      clangModulePromise = null;
      throw new Error(`Failed to load YoWASP Clang compiler: ${dataErr.message}`);
    }

    clangModulePromise = null;
    throw new Error("Unable to initialize YoWASP Clang compiler");
  })();

  return clangModulePromise;
}

/**
 * Standard WASI (wasi_snapshot_preview1) implementation for browser execution.
 * Handles standard streams (stdin, stdout, stderr), environment, args, and linear memory.
 */
class BrowserWASI {
  constructor({ args = ["main.wasm"], env = {}, stdin = "" } = {}) {
    this.args = args;
    this.env = env;
    this.stdinBytes = new TextEncoder().encode(stdin);
    this.stdinOffset = 0;
    this.stdoutChunks = [];
    this.stderrChunks = [];
    this.exitCode = 0;
    this.instance = null;
  }

  get stdout() {
    return new TextDecoder().decode(this.concatUint8(this.stdoutChunks));
  }

  get stderr() {
    return new TextDecoder().decode(this.concatUint8(this.stderrChunks));
  }

  concatUint8(arrays) {
    const total = arrays.reduce((acc, a) => acc + a.length, 0);
    const result = new Uint8Array(total);
    let offset = 0;
    for (const arr of arrays) {
      result.set(arr, offset);
      offset += arr.length;
    }
    return result;
  }

  getMemoryView() {
    if (!this.instance || !this.instance.exports.memory) {
      throw new Error("WASM memory export not available");
    }
    return new DataView(this.instance.exports.memory.buffer);
  }

  getMemoryBytes() {
    if (!this.instance || !this.instance.exports.memory) {
      throw new Error("WASM memory export not available");
    }
    return new Uint8Array(this.instance.exports.memory.buffer);
  }

  getImports() {
    return {
      args_sizes_get: (argcPtr, argvBufSizePtr) => {
        const view = this.getMemoryView();
        view.setUint32(argcPtr, this.args.length, true);
        const totalBufSize = this.args.reduce(
          (acc, arg) => acc + new TextEncoder().encode(arg).length + 1,
          0
        );
        view.setUint32(argvBufSizePtr, totalBufSize, true);
        return 0; // Success
      },

      args_get: (argvPtr, argvBufPtr) => {
        const view = this.getMemoryView();
        const mem = this.getMemoryBytes();
        let currentBufPtr = argvBufPtr;

        for (let i = 0; i < this.args.length; i++) {
          view.setUint32(argvPtr + i * 4, currentBufPtr, true);
          const encoded = new TextEncoder().encode(this.args[i]);
          mem.set(encoded, currentBufPtr);
          mem[currentBufPtr + encoded.length] = 0; // Null terminator
          currentBufPtr += encoded.length + 1;
        }
        return 0;
      },

      environ_sizes_get: (countPtr, bufSizePtr) => {
        const view = this.getMemoryView();
        const entries = Object.entries(this.env);
        view.setUint32(countPtr, entries.length, true);
        const total = entries.reduce(
          (acc, [k, v]) => acc + new TextEncoder().encode(`${k}=${v}`).length + 1,
          0
        );
        view.setUint32(bufSizePtr, total, true);
        return 0;
      },

      environ_get: (environPtr, environBufPtr) => {
        const view = this.getMemoryView();
        const mem = this.getMemoryBytes();
        const entries = Object.entries(this.env);
        let currentBufPtr = environBufPtr;

        for (let i = 0; i < entries.length; i++) {
          view.setUint32(environPtr + i * 4, currentBufPtr, true);
          const str = `${entries[i][0]}=${entries[i][1]}`;
          const encoded = new TextEncoder().encode(str);
          mem.set(encoded, currentBufPtr);
          mem[currentBufPtr + encoded.length] = 0;
          currentBufPtr += encoded.length + 1;
        }
        return 0;
      },

      clock_time_get: (clockId, precision, timePtr) => {
        const view = this.getMemoryView();
        const nowNs = BigInt(Math.floor(performance.now() * 1e6));
        view.setBigUint64(timePtr, nowNs, true);
        return 0;
      },

      fd_fdstat_get: (fd, statPtr) => {
        const view = this.getMemoryView();
        // Filetype: 2 = Character device (stdin/stdout/stderr)
        view.setUint8(statPtr, 2);
        view.setUint16(statPtr + 2, 0, true);
        view.setBigUint64(statPtr + 8, -1n, true);
        view.setBigUint64(statPtr + 16, -1n, true);
        return 0;
      },

      fd_prestat_get: () => 8, // __WASI_ERRNO_BADF
      fd_prestat_dir_name: () => 8,
      fd_close: () => 0,
      fd_seek: () => 70, // __WASI_ERRNO_SPIPE

      fd_read: (fd, iovsPtr, iovsLen, nreadPtr) => {
        if (fd !== 0) return 8; // Bad file descriptor
        const view = this.getMemoryView();
        const mem = this.getMemoryBytes();
        let totalRead = 0;

        for (let i = 0; i < iovsLen; i++) {
          const bufPtr = view.getUint32(iovsPtr + i * 8, true);
          const bufLen = view.getUint32(iovsPtr + i * 8 + 4, true);

          const remainingStdin = this.stdinBytes.length - this.stdinOffset;
          if (remainingStdin <= 0) break;

          const toRead = Math.min(bufLen, remainingStdin);
          mem.set(this.stdinBytes.subarray(this.stdinOffset, this.stdinOffset + toRead), bufPtr);
          this.stdinOffset += toRead;
          totalRead += toRead;
        }

        view.setUint32(nreadPtr, totalRead, true);
        return 0;
      },

      fd_write: (fd, iovsPtr, iovsLen, nwrittenPtr) => {
        const view = this.getMemoryView();
        const mem = this.getMemoryBytes();
        let totalWritten = 0;

        for (let i = 0; i < iovsLen; i++) {
          const bufPtr = view.getUint32(iovsPtr + i * 8, true);
          const bufLen = view.getUint32(iovsPtr + i * 8 + 4, true);

          if (bufLen > 0) {
            const chunk = mem.slice(bufPtr, bufPtr + bufLen);
            if (fd === 1) {
              this.stdoutChunks.push(chunk);
            } else if (fd === 2) {
              this.stderrChunks.push(chunk);
            }
            totalWritten += bufLen;
          }
        }

        view.setUint32(nwrittenPtr, totalWritten, true);
        return 0;
      },

      proc_exit: (code) => {
        this.exitCode = code;
        throw new Error(`WASI_EXIT_${code}`);
      },

      sched_yield: () => 0,

      random_get: (bufPtr, bufLen) => {
        const mem = this.getMemoryBytes();
        const slice = mem.subarray(bufPtr, bufPtr + bufLen);
        if (typeof crypto !== "undefined" && crypto.getRandomValues) {
          crypto.getRandomValues(slice);
        } else {
          for (let i = 0; i < bufLen; i++) slice[i] = Math.floor(Math.random() * 256);
        }
        return 0;
      }
    };
  }

  async start(instance) {
    this.instance = instance;
    try {
      if (typeof instance.exports._start === "function") {
        instance.exports._start();
      } else if (typeof instance.exports.main === "function") {
        instance.exports.main();
      } else {
        throw new Error("No _start or main function exported in WebAssembly module");
      }
    } catch (err) {
      if (err.message && err.message.startsWith("WASI_EXIT_")) {
        // Normal exit triggered via proc_exit
        return;
      }
      throw err;
    }
  }
}

/**
 * Direct in-thread execution fallback.
 */
async function executeDirect(wasmBinary, stdin = "") {
  const wasi = new BrowserWASI({ stdin: stdin || "" });
  const startTime = performance.now();
  let wasmInstance = null;
  try {
    const wasmModule = await WebAssembly.compile(wasmBinary);
    wasmInstance = await WebAssembly.instantiate(wasmModule, {
      wasi_snapshot_preview1: wasi.getImports()
    });
    await wasi.start(wasmInstance);
    const execTimeSec = ((performance.now() - startTime) / 1000).toFixed(3);
    const memoryKB = wasmInstance.exports.memory?.buffer
      ? Math.round(wasmInstance.exports.memory.buffer.byteLength / 1024)
      : null;

    return {
      success: wasi.exitCode === 0,
      stdout: wasi.stdout,
      stderr: wasi.stderr,
      exitCode: wasi.exitCode,
      time: execTimeSec,
      memory: memoryKB
    };
  } catch (err) {
    const execTimeSec = ((performance.now() - startTime) / 1000).toFixed(3);
    const memoryKB = wasmInstance?.exports?.memory?.buffer
      ? Math.round(wasmInstance.exports.memory.buffer.byteLength / 1024)
      : null;

    return {
      success: false,
      error: err.message || String(err),
      stdout: wasi.stdout,
      stderr: wasi.stderr,
      exitCode: wasi.exitCode || 1,
      time: execTimeSec,
      memory: memoryKB
    };
  }
}

/**
 * Executes WebAssembly in a Web Worker (browser) or Worker Thread (Node.js) with strict timeout.
 * Terminating the worker aborts infinite loops without freezing the main thread.
 */
async function executeWasmWithTimeout(wasmBinary, stdin = "", timeoutMs = EXECUTION_TIMEOUT_MS) {
  const isNode = typeof process !== "undefined" && Boolean(process.versions?.node);
  const isBrowser = !isNode && (typeof window !== "undefined" || (typeof Worker !== "undefined" && typeof Blob !== "undefined"));

  if (isBrowser) {
    return new Promise((resolve) => {
      let worker = null;
      let blobUrl = null;
      let timer = null;
      let finished = false;

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        if (worker) {
          try { worker.terminate(); } catch {}
          worker = null;
        }
        if (blobUrl) {
          try { URL.revokeObjectURL(blobUrl); } catch {}
          blobUrl = null;
        }
      };

      try {
        const workerScript = `
${BrowserWASI.toString()}

self.onmessage = async (e) => {
  const { wasmBinary, stdin } = e.data;
  const wasi = new BrowserWASI({ stdin: stdin || "" });
  const startTime = performance.now();
  let wasmInstance = null;
  try {
    const wasmModule = await WebAssembly.compile(wasmBinary);
    wasmInstance = await WebAssembly.instantiate(wasmModule, {
      wasi_snapshot_preview1: wasi.getImports()
    });
    await wasi.start(wasmInstance);
    const execTimeSec = ((performance.now() - startTime) / 1000).toFixed(3);
    const memoryKB = wasmInstance.exports.memory?.buffer
      ? Math.round(wasmInstance.exports.memory.buffer.byteLength / 1024)
      : null;
    self.postMessage({
      success: wasi.exitCode === 0,
      stdout: wasi.stdout,
      stderr: wasi.stderr,
      exitCode: wasi.exitCode,
      time: execTimeSec,
      memory: memoryKB
    });
  } catch (err) {
    const execTimeSec = ((performance.now() - startTime) / 1000).toFixed(3);
    const memoryKB = wasmInstance?.exports?.memory?.buffer
      ? Math.round(wasmInstance.exports.memory.buffer.byteLength / 1024)
      : null;
    self.postMessage({
      success: false,
      error: err.message || String(err),
      stdout: wasi.stdout,
      stderr: wasi.stderr,
      exitCode: wasi.exitCode || 1,
      time: execTimeSec,
      memory: memoryKB
    });
  }
};
`;
        const blob = new Blob([workerScript], { type: "application/javascript" });
        blobUrl = URL.createObjectURL(blob);
        worker = new Worker(blobUrl);

        timer = setTimeout(() => {
          if (finished) return;
          finished = true;
          cleanup();
          resolve({
            timedOut: true,
            time: (timeoutMs / 1000).toFixed(3)
          });
        }, timeoutMs);

        worker.onmessage = (e) => {
          if (finished) return;
          finished = true;
          cleanup();
          resolve(e.data);
        };

        worker.onerror = (err) => {
          if (finished) return;
          finished = true;
          cleanup();
          resolve({
            success: false,
            error: err.message || "Worker execution error",
            exitCode: 1,
            time: "0.000",
            memory: null
          });
        };

        worker.postMessage({ wasmBinary, stdin });
      } catch (workerErr) {
        cleanup();
        resolve(executeDirect(wasmBinary, stdin));
      }
    });
  } else if (isNode) {
    return new Promise(async (resolve) => {
      let worker = null;
      let timer = null;
      let finished = false;

      const cleanup = async () => {
        if (timer) clearTimeout(timer);
        if (worker) {
          try { await worker.terminate(); } catch {}
          worker = null;
        }
      };

      try {
        const { Worker: NodeWorker } = await import("node:worker_threads");
        const nodeScript = `
import { parentPort } from "node:worker_threads";
${BrowserWASI.toString()}

parentPort.on("message", async (data) => {
  const { wasmBinary, stdin } = data;
  const wasi = new BrowserWASI({ stdin: stdin || "" });
  const startTime = performance.now();
  let wasmInstance = null;
  try {
    const wasmModule = await WebAssembly.compile(wasmBinary);
    wasmInstance = await WebAssembly.instantiate(wasmModule, {
      wasi_snapshot_preview1: wasi.getImports()
    });
    await wasi.start(wasmInstance);
    const execTimeSec = ((performance.now() - startTime) / 1000).toFixed(3);
    const memoryKB = wasmInstance.exports.memory?.buffer
      ? Math.round(wasmInstance.exports.memory.buffer.byteLength / 1024)
      : null;
    parentPort.postMessage({
      success: wasi.exitCode === 0,
      stdout: wasi.stdout,
      stderr: wasi.stderr,
      exitCode: wasi.exitCode,
      time: execTimeSec,
      memory: memoryKB
    });
  } catch (err) {
    const execTimeSec = ((performance.now() - startTime) / 1000).toFixed(3);
    const memoryKB = wasmInstance?.exports?.memory?.buffer
      ? Math.round(wasmInstance.exports.memory.buffer.byteLength / 1024)
      : null;
    parentPort.postMessage({
      success: false,
      error: err.message || String(err),
      stdout: wasi.stdout,
      stderr: wasi.stderr,
      exitCode: wasi.exitCode || 1,
      time: execTimeSec,
      memory: memoryKB
    });
  }
});
`;
        worker = new NodeWorker(nodeScript, { eval: true });

        timer = setTimeout(async () => {
          if (finished) return;
          finished = true;
          await cleanup();
          resolve({
            timedOut: true,
            time: (timeoutMs / 1000).toFixed(3)
          });
        }, timeoutMs);

        worker.on("message", async (data) => {
          if (finished) return;
          finished = true;
          await cleanup();
          resolve(data);
        });

        worker.on("error", async (err) => {
          if (finished) return;
          finished = true;
          await cleanup();
          resolve({
            success: false,
            error: err.message || "Worker error",
            exitCode: 1,
            time: "0.000",
            memory: null
          });
        });

        worker.postMessage({ wasmBinary, stdin });
      } catch (nodeErr) {
        await cleanup();
        resolve(executeDirect(wasmBinary, stdin));
      }
    });
  } else {
    return executeDirect(wasmBinary, stdin);
  }
}

/**
 * Executes C++ source code via YoWASP Clang and in-browser WebAssembly runtime.
 * Fallback invoked when Judge0 API fails or is unreachable.
 * 
 * @param {string} sourceCode - Actual C++ source code including problem test harness.
 * @param {string} stdin - Standard input to pass to the program.
 * @param {string} language - Target language ("cpp").
 * @returns {Promise<Object>} Judge0-compatible execution result.
 */
export async function runWithWasm(sourceCode, stdin = "", language = "cpp") {
  console.info("Judge0 unavailable. Compiling & executing C++ via YoWASP WebAssembly fallback...");

  let compileErrors = "";
  const files = {
    "solution.cpp": sourceCode,
    "stubs.cc": EXCEPTION_STUBS_CPP
  };

  try {
    // 1. Obtain YoWASP Clang toolchain
    const { runClang } = await getClangCompiler();

    // 2. Compile C++ to WebAssembly with C++17 support and full libc++ STL
    // Note: -fno-exceptions is removed; exception symbol stubs provide unwinding fallbacks
    const resultFiles = await runClang(
      ["clang++", "-O2", "-std=c++17", "solution.cpp", "stubs.cc", "-o", "main.wasm"],
      files,
      {
        stderr: (bytes) => {
          if (bytes) {
            compileErrors += new TextDecoder().decode(bytes);
          }
        },
        stdout: () => {}
      }
    );

    const wasmBinary = resultFiles && resultFiles["main.wasm"];
    if (!wasmBinary) {
      return {
        compile_output: compileErrors || "Compilation failed: main.wasm binary was not generated.",
        stdout: null,
        stderr: null,
        time: "0.000",
        memory: null,
        status: { id: 6, description: "Compilation Error" },
        message: "Compilation error via Clang WebAssembly compiler"
      };
    }

    // 3. Execute with timeout in worker thread to prevent freezing on infinite loops
    const execResult = await executeWasmWithTimeout(wasmBinary, stdin || "", EXECUTION_TIMEOUT_MS);

    // 4. Handle Time Limit Exceeded (Judge0 status 5)
    if (execResult.timedOut) {
      return {
        stdout: null,
        stderr: `Time Limit Exceeded (${(EXECUTION_TIMEOUT_MS / 1000).toFixed(3)}s)`,
        compile_output: null,
        time: execResult.time || (EXECUTION_TIMEOUT_MS / 1000).toFixed(3),
        memory: null,
        status: { id: 5, description: "Time Limit Exceeded" },
        message: "Time Limit Exceeded"
      };
    }

    // 5. Handle Runtime Errors: WebAssembly traps or Non-Zero Exit Code (Judge0 status 11)
    if (!execResult.success || (execResult.exitCode !== 0 && execResult.exitCode !== undefined)) {
      const errorDesc = execResult.error
        ? `Runtime Error: ${execResult.error}`
        : `Process exited with code ${execResult.exitCode}`;
      const stderr = execResult.stderr
        ? (execResult.error ? `${execResult.stderr}\n${execResult.error}` : execResult.stderr)
        : (execResult.error || `Process exited with code ${execResult.exitCode}`);

      return {
        stdout: execResult.stdout || null,
        stderr: stderr,
        compile_output: null,
        time: execResult.time || "0.000",
        // Report measured linear memory in KB without claiming cgroup enforcement
        memory: execResult.memory || null,
        status: { id: 11, description: "Runtime Error" },
        message: errorDesc
      };
    }

    // 6. Successful execution matching Judge0 return contract (Judge0 status 3)
    return {
      stdout: execResult.stdout || "",
      stderr: execResult.stderr || null,
      compile_output: null,
      time: execResult.time || "0.000",
      // Report measured linear memory in KB without claiming cgroup enforcement
      memory: execResult.memory || null,
      status: { id: 3, description: "Accepted" },
      message: "Executed via in-browser YoWASP Clang WebAssembly runtime"
    };

  } catch (err) {
    // If compilation error occurred (runClang exited with status != 0)
    if (compileErrors || (err.code !== undefined && err.code !== 0)) {
      return {
        compile_output: compileErrors || err.message,
        stdout: null,
        stderr: null,
        time: "0.000",
        memory: null,
        status: { id: 6, description: "Compilation Error" },
        message: "Compilation error via Clang WebAssembly compiler"
      };
    }

    // General runtime or loading exception
    console.error("WASM Runner execution error:", err);
    return {
      stdout: null,
      stderr: err.message,
      compile_output: null,
      time: "0.000",
      memory: null,
      status: { id: 11, description: "Runtime Error" },
      message: err.message
    };
  }
}
