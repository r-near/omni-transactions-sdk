import type { ProjPointType } from "@noble/curves/abstract/weierstrass"
import { secp256k1 } from "@noble/curves/secp256k1"
import { bytesToHex, bytesToNumberBE } from "@noble/curves/utils"
import { keccak_256, sha3_256 } from "@noble/hashes/sha3"
import { base58 } from "@scure/base"
import { p2pkh, p2wpkh } from "@scure/btc-signer"

const SECP256K1_PREFIX = "secp256k1:"
const SECP256K1_PUBLIC_KEY_BYTES = 64
const ETHEREUM_ADDRESS_BYTES = 20

// NEAR MPC recovery derivation constants
const TWEAK_DERIVATION_PREFIX = "near-mpc-recovery v0.1.0 epsilon derivation:"
const ACCOUNT_DATA_SEPARATOR = ","

/**
 * Secp256k1 public key for NEAR Chain Signatures that can be represented in different blockchain formats
 * and supports hierarchical key derivation using NEAR MPC recovery scheme
 */
export class ChainSignatureKey {
  constructor(private readonly point: ProjPointType<bigint>) {}

  /**
   * Create from NEAR protocol format: "secp256k1:base58..."
   */
  static fromNEAR(nearPublicKey: string): ChainSignatureKey {
    if (!nearPublicKey.startsWith(SECP256K1_PREFIX)) {
      throw new Error("Must start with 'secp256k1:'")
    }

    const base58Part = nearPublicKey.slice(SECP256K1_PREFIX.length)
    const decoded = base58.decode(base58Part)

    if (decoded.length !== SECP256K1_PUBLIC_KEY_BYTES) {
      throw new Error(
        `Public key must be exactly ${SECP256K1_PUBLIC_KEY_BYTES} bytes, got ${decoded.length}`,
      )
    }

    const point = secp256k1.Point.fromBytes(new Uint8Array([0x04, ...decoded]))

    return new ChainSignatureKey(point)
  }

  /**
   * Create from raw secp256k1 point
   */
  static fromPoint(point: ProjPointType<bigint>): ChainSignatureKey {
    return new ChainSignatureKey(point)
  }

  /**
   * Create from uncompressed bytes (64 bytes: x + y coordinates)
   */
  static fromBytes(bytes: Uint8Array): ChainSignatureKey {
    if (bytes.length === 64) {
      return new ChainSignatureKey(secp256k1.Point.fromBytes(new Uint8Array([0x04, ...bytes])))
    }

    // Try parsing it anyway and see if we get something
    return new ChainSignatureKey(secp256k1.Point.fromBytes(bytes))
  }

  /**
   * Derive a child key using NEAR MPC recovery derivation scheme
   * Formula: child_pubkey = tweak * G + parent_pubkey
   * Where tweak = SHA3-256(prefix + predecessor_id + "," + path)
   */
  derive(predecessorId: string, path: string): ChainSignatureKey {
    // Create derivation path following NEAR's format
    const derivationPath = `${TWEAK_DERIVATION_PREFIX}${predecessorId}${ACCOUNT_DATA_SEPARATOR}${path}`
    // Hash to get tweak
    const hash = sha3_256(new TextEncoder().encode(derivationPath))

    // Convert hash to scalar (might throw if not valid, but extremely rare)
    let tweak: bigint
    try {
      tweak = secp256k1.CURVE.Fp.create(bytesToNumberBE(hash))
    } catch (error) {
      throw new Error(`Derived tweak is not a valid scalar: ${error}`)
    }
    console.log(tweak)

    // Calculate: tweak * G + parent_pubkey
    const tweakPoint = secp256k1.Point.BASE.multiply(tweak)
    const childPoint = this.point.add(tweakPoint)

    return new ChainSignatureKey(childPoint)
  }

  // Chain-specific getters

  /**
   * NEAR protocol format: "secp256k1:base58..."
   */
  get near(): string {
    const uncompressed = this.point.toBytes(false).slice(1) // Remove 0x04 prefix
    return SECP256K1_PREFIX + base58.encode(uncompressed)
  }

  /**
   * Ethereum address: "0x..." (last 20 bytes of Keccak-256 hash)
   */
  get ethereum(): string {
    const uncompressed = this.point.toBytes(false).slice(1) // Remove 0x04 prefix
    const hash = keccak_256(uncompressed)
    const addressBytes = hash.slice(-ETHEREUM_ADDRESS_BYTES)
    return `0x${bytesToHex(addressBytes)}`
  }

  /**
   * Bitcoin P2PKH address (legacy format, starts with "1")
   */
  get bitcoinP2PKH(): string {
    return p2pkh(this.point.toBytes(true)).address
  }

  /**
   * Bitcoin Bech32 address (modern format, starts with "bc1")
   */
  get bitcoinBech32(): string {
    return p2wpkh(this.point.toBytes(true)).address
  }

  /**
   * Bitcoin address (defaults to modern Bech32 format)
   */
  get bitcoin(): string {
    return this.bitcoinBech32
  }

  /**
   * Raw secp256k1 point
   */
  get rawPoint(): ProjPointType<bigint> {
    return this.point
  }

  /**
   * Uncompressed public key bytes (65 bytes: prefix + x + y coordinates)
   */
  get bytes(): Uint8Array {
    return this.point.toBytes(false)
  }

  /**
   * Compressed public key bytes (33 bytes: prefix + x coordinate)
   */
  get compressed(): Uint8Array {
    return this.point.toBytes(true)
  }

  /**
   * Hex representation of uncompressed public key
   */
  get hex(): string {
    return this.point.toHex(false)
  }

  /**
   * Check if this key equals another key
   */
  equals(other: ChainSignatureKey): boolean {
    return this.point.equals(other.point)
  }

  /**
   * Get a string representation for debugging
   */
  toString(): string {
    return `ChainSignatureKey(${this.hex.slice(0, 16)}...)`
  }
}

// Usage examples
const testKey =
  "secp256k1:3tFRbMqmoa6AAALMrEFAYCEoHcqKxeW38YptwowBVBtXK1vo36HDbUWuR6EZmoK4JcH6HDkNMGGqP1ouV7VZUWya"

// Create root key
const rootKey = ChainSignatureKey.fromNEAR(testKey)

// Derive child keys
const childKey1 = rootKey.derive("alice.near", "path/to/key1")
const childKey2 = rootKey.derive("alice.near", "path/to/key2")

console.log("\nChild key 1:")
console.log("  NEAR:", childKey1.near)
console.log("  Ethereum:", childKey1.ethereum)
console.log("  Bitcoin P2PKH:", childKey1.bitcoinP2PKH)
console.log("  Bitcoin Bech32:", childKey1.bitcoinBech32)

console.log("\nChild key 2:")
console.log("  NEAR:", childKey2.near)
console.log("  Ethereum:", childKey2.ethereum)
console.log("  Bitcoin P2PKH:", childKey2.bitcoinP2PKH)
console.log("  Bitcoin Bech32:", childKey2.bitcoinBech32)
