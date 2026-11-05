/*
 * JavaScript port of the NumPy SeedSequence and PCG64 bitstream algorithms.
 * Reference sources:
 * https://github.com/numpy/numpy/blob/main/numpy/random/bit_generator.pyx
 * https://github.com/numpy/numpy/blob/main/numpy/random/_pcg64.pyx
 * https://github.com/numpy/numpy/blob/main/numpy/random/src/pcg64/pcg64.h
 * SeedSequence is derived from Melissa E. O'Neill's std::seed_seq implementation.
 * Copyright (c) 2015 Melissa E. O'Neill
 * Copyright (c) 2019 NumPy Developers
 * PCG implementation based on Copyright (c) 2014 Melissa E. O'Neill and
 * Copyright (c) 2015 Robert Kern. All cited PCG source is available under MIT.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
(function attachNumpyPCG64(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.NumpyPCG64 = api.NumpyPCG64;
})(typeof window !== 'undefined' ? window : globalThis, function createNumpyPCG64() {
  const INIT_A = 0x43b0d7e5;
  const MULT_A = 0x931e8875;
  const INIT_B = 0x8b51f9dd;
  const MULT_B = 0x58f38ded;
  const MIX_MULT_L = 0xca01f9dd;
  const MIX_MULT_R = 0x4973f715;
  const MASK32 = 0xffffffff;
  const MASK64 = (1n << 64n) - 1n;
  const MASK128 = (1n << 128n) - 1n;
  const TWO_53 = 9007199254740992;
  const PCG64_MULTIPLIER = (2549297995355413924n << 64n) | 4865540595714422341n;

  function seedToUint32Words(seed) {
    if (typeof seed === 'number' && !Number.isSafeInteger(seed)) {
      throw new TypeError('The seed must be an exact integer.');
    }
    if (!['bigint', 'number', 'string'].includes(typeof seed)) {
      throw new TypeError('The seed must be an integer.');
    }
    let value;
    try {
      value = BigInt(seed);
    } catch {
      throw new TypeError('The seed must be an integer.');
    }
    if (value < 0n) throw new RangeError('The seed must be non-negative.');
    if (value === 0n) return [0];
    const words = [];
    while (value > 0n) {
      words.push(Number(value & BigInt(MASK32)));
      value >>= 32n;
    }
    return words;
  }

  function hashMix(value, hashState) {
    let mixed = (value ^ hashState.value) >>> 0;
    hashState.value = Math.imul(hashState.value, MULT_A) >>> 0;
    mixed = Math.imul(mixed, hashState.value) >>> 0;
    return (mixed ^ (mixed >>> 16)) >>> 0;
  }

  function mix(left, right) {
    const product = (Math.imul(MIX_MULT_L, left) - Math.imul(MIX_MULT_R, right)) >>> 0;
    return (product ^ (product >>> 16)) >>> 0;
  }

  function seedSequencePool(seed) {
    const entropy = seedToUint32Words(seed);
    const pool = new Uint32Array(4);
    const hashState = { value: INIT_A };
    for (let index = 0; index < pool.length; index += 1) {
      pool[index] = hashMix(index < entropy.length ? entropy[index] : 0, hashState);
    }
    for (let source = 0; source < pool.length; source += 1) {
      for (let destination = 0; destination < pool.length; destination += 1) {
        if (source !== destination) {
          pool[destination] = mix(pool[destination], hashMix(pool[source], hashState));
        }
      }
    }
    for (let source = pool.length; source < entropy.length; source += 1) {
      for (let destination = 0; destination < pool.length; destination += 1) {
        pool[destination] = mix(pool[destination], hashMix(entropy[source], hashState));
      }
    }
    return pool;
  }

  function seedSequenceGenerateState(seed, wordCount) {
    const pool = seedSequencePool(seed);
    const hashState = { value: INIT_B };
    const words = new Uint32Array(wordCount * 2);
    for (let index = 0; index < words.length; index += 1) {
      let value = (pool[index % pool.length] ^ hashState.value) >>> 0;
      hashState.value = Math.imul(hashState.value, MULT_B) >>> 0;
      value = Math.imul(value, hashState.value) >>> 0;
      words[index] = (value ^ (value >>> 16)) >>> 0;
    }
    const uint64Words = [];
    for (let index = 0; index < words.length; index += 2) {
      uint64Words.push(BigInt(words[index]) | (BigInt(words[index + 1]) << 32n));
    }
    return uint64Words;
  }

  class NumpyPCG64 {
    constructor(seed = 12345) {
      this.seed = seed;
      this.reset(seed);
    }

    reset(seed = this.seed) {
      this.seed = seed;
      const generated = seedSequenceGenerateState(seed, 4);
      const initialState = (generated[0] << 64n) | generated[1];
      const initialSequence = (generated[2] << 64n) | generated[3];
      this.increment = ((initialSequence << 1n) | 1n) & MASK128;
      this.state = 0n;
      this._step();
      this.state = (this.state + initialState) & MASK128;
      this._step();
    }

    _step() {
      this.state = (this.state * PCG64_MULTIPLIER + this.increment) & MASK128;
    }

    nextUint64() {
      this._step();
      const mixed = ((this.state >> 64n) ^ (this.state & MASK64)) & MASK64;
      const rotation = Number(this.state >> 122n);
      const rotateRight = (mixed >> BigInt(rotation)) | (mixed << BigInt((-rotation) & 63));
      return rotateRight & MASK64;
    }

    random() {
      return Number(this.nextUint64() >> 11n) / TWO_53;
    }

    getState() {
      return Object.freeze({ state: this.state, inc: this.increment });
    }
  }

  return Object.freeze({ NumpyPCG64 });
});
