const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const { WASI } = require('wasi');
const { WebAssembly } = require('wasm');
const logger = require('./logger');

// Configuration
const WASM_DIR = path.join(__dirname, 'wasm-cache');
const MAX_EXECUTION_TIME = 5000; // 5 seconds timeout

// Ensure WASM cache directory exists
if (!fs.existsSync(WASM_DIR)) {
  fs.mkdirSync(WASM_DIR, { recursive: true });
}

class WASMRuntime {
  constructor() {
    this.modules = new Map();
    this.wasi = new WASI({
      args: process.argv,
      env: process.env,
      preopens: {
        '/tmp': '/tmp'
      }
    });
  }

  async compileModule(wasmBuffer, moduleId) {
    try {
      const module = await WebAssembly.compile(wasmBuffer);
      this.modules.set(moduleId, module);
      logger.info(`Compiled WASM module ${moduleId}`);
      return true;
    } catch (err) {
      logger.error(`Compilation failed for ${moduleId}: ${err}`);
      return false;
    }
  }

  async execute(moduleId, input) {
    if (!this.modules.has(moduleId)) {
      throw new Error(`Module ${moduleId} not loaded`);
    }

    const module = this.modules.get(moduleId);
    const importObject = { wasi_snapshot_preview1: this.wasi.wasiImport };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Execution timeout for module ${moduleId}`));
      }, MAX_EXECUTION_TIME);

      try {
        const instance = new WebAssembly.Instance(module, importObject);
        
        // Allocate memory for input
        const inputStr = JSON.stringify(input);
        const encoder = new TextEncoder();
        const inputBytes = encoder.encode(inputStr);
        
        // Get WASM memory exports
        const memory = instance.exports.memory;
        const alloc = instance.exports.alloc || instance.exports.malloc;
        const dealloc = instance.exports.dealloc || instance.exports.free;
        const processFn = instance.exports.process;

        if (!memory || !alloc || !processFn) {
          throw new Error('Missing required WASM exports');
        }

        // Allocate memory in WASM
        const inputPtr = alloc(inputBytes.length);
        if (inputPtr === 0) {
          throw new Error('Memory allocation failed');
        }

        // Write input to WASM memory
        const wasmMemory = new Uint8Array(memory.buffer, inputPtr, inputBytes.length);
        wasmMemory.set(inputBytes);

        // Execute WASM function
        const outputPtr = processFn(inputPtr, inputBytes.length);
        
        // Read output from WASM memory
        const outputSize = new Uint32Array(memory.buffer, outputPtr, 1)[0];
        const outputBytes = new Uint8Array(memory.buffer, outputPtr + 4, outputSize);
        const decoder = new TextDecoder();
        const outputStr = decoder.decode(outputBytes);
        const output = JSON.parse(outputStr);

        // Free allocated memory
        dealloc(inputPtr, inputBytes.length);
        dealloc(outputPtr, outputSize + 4);

        clearTimeout(timeout);
        resolve(output);
      } catch (err) {
        clearTimeout(timeout);
        reject(err);
      }
    });
  }
}

// Main runtime process
const runtime = new WASMRuntime();

// Handle messages from main thread
parentPort.on('message', async (message) => {
  try {
    switch (message.type) {
      case 'LOAD':
        const wasmBuffer = Buffer.from(message.wasmBytes);
        const success = await runtime.compileModule(wasmBuffer, message.moduleId);
        parentPort.postMessage({
          type: 'LOAD_RESULT',
          moduleId: message.moduleId,
          success
        });
        break;

      case 'EXECUTE':
        const result = await runtime.execute(message.moduleId, message.input);
        parentPort.postMessage({
          type: 'EXECUTION_RESULT',
          executionId: message.executionId,
          result
        });
        break;

      default:
        throw new Error(`Unknown message type: ${message.type}`);
    }
  } catch (error) {
    parentPort.postMessage({
      type: 'ERROR',
      error: error.message,
      stack: error.stack
    });
  }
});

// Optional logger
function createLogger() {
  return {
    info: (msg) => console.log(`[INFO] ${new Date().toISOString()} ${msg}`),
    error: (msg) => console.error(`[ERROR] ${new Date().toISOString()} ${msg}`)
  };
}

const logger = createLogger();