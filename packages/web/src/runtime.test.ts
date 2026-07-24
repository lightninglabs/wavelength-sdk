import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, it, mock } from 'node:test';
import type { WavelengthPerformanceEvent } from '@lightninglabs/wavelength-core';
import { instantiateCompressedWasm } from './runtime.ts';

const savedFetch = globalThis.fetch;
const savedInstantiate = WebAssembly.instantiate;
const savedInstantiateStreaming = WebAssembly.instantiateStreaming;

function stubGlobal(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, {
    value,
    configurable: true,
    writable: true,
  });
}

function stubWebAssembly(name: string, value: unknown): void {
  Object.defineProperty(WebAssembly, name, {
    value,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  stubGlobal('fetch', savedFetch);
  stubWebAssembly('instantiate', savedInstantiate);
  stubWebAssembly('instantiateStreaming', savedInstantiateStreaming);
});

describe('instantiateCompressedWasm', { concurrency: false }, () => {
  it('uses native streaming when the host serves gzip as wasm', async () => {
    const response = new Response(new Uint8Array([1, 2, 3]), {
      headers: { 'Content-Type': 'application/wasm' },
    });
    stubGlobal('fetch', mock.fn(async () => response));
    const instantiateStreaming = mock.fn(async () => ({
      instance: {} as WebAssembly.Instance,
      module: {} as WebAssembly.Module,
    }));
    stubWebAssembly('instantiateStreaming', instantiateStreaming);
    stubWebAssembly('instantiate', mock.fn(async () => {
      throw new Error('buffered instantiation should not run');
    }));
    const samples: WavelengthPerformanceEvent[] = [];

    await instantiateCompressedWasm(
      {},
      'https://runtime.example/',
      (sample) => samples.push(sample),
    );

    assert.equal(instantiateStreaming.mock.callCount(), 1);
    assert.deepEqual(samples.at(-1)?.detail, {
      path: 'gzip',
      streaming: true,
      decompression: 'http',
    });
  });

  it('keeps buffered decompression for application/gzip hosts', async () => {
    const wasmBytes = new Uint8Array([0, 97, 115, 109]);
    const response = new Response(gzipSync(wasmBytes), {
      headers: { 'Content-Type': 'application/gzip' },
    });
    stubGlobal('fetch', mock.fn(async () => response));
    let instantiatedBytes = 0;
    const instantiate = mock.fn(async (bytes: BufferSource) => {
      instantiatedBytes = bytes.byteLength;

      return {
        instance: {} as WebAssembly.Instance,
        module: {} as WebAssembly.Module,
      };
    });
    stubWebAssembly('instantiate', instantiate);
    stubWebAssembly('instantiateStreaming', mock.fn(async () => {
      throw new Error('streaming instantiation should not run');
    }));
    const samples: WavelengthPerformanceEvent[] = [];

    await instantiateCompressedWasm(
      {},
      'https://runtime.example/',
      (sample) => samples.push(sample),
    );

    assert.equal(instantiate.mock.callCount(), 1);
    assert.equal(instantiatedBytes, wasmBytes.byteLength);
    assert.deepEqual(
      samples.find((sample) => sample.phase === 'wasmDecompress')?.detail,
      {
        path: 'gzip',
        bytes: wasmBytes.byteLength,
        streaming: false,
      },
    );
  });
});
