import type { ProjPointType } from "@noble/curves/abstract/weierstrass"
import { secp256k1 } from "@noble/curves/secp256k1"
import { bytesToHex, bytesToNumberBE, numberToBytesBE } from "@noble/curves/utils"
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
 * Universal secp256k1 key for NEAR Chain Signatures
 *
 * Can operate in two modes:
 * - Production mode: Only public key, can derive addresses and child keys
 * - Testing mode: Includes secret key, can sign transactions to mock MPC behavior
 *
 * Uses NEAR MPC recovery derivation scheme for hierarchical key derivation
 */
export class OmniKey {
  constructor(
    private readonly point: ProjPointType<bigint>,
    private readonly secret?: bigint,
  ) {}

  // Static constructors for production (public key only)

  /**
   * Create from NEAR protocol format: "secp256k1:base58..."
   */
  static fromNEAR(nearPublicKey: string): OmniKey {
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
    return new OmniKey(point)
  }

  /**
   * Create from raw secp256k1 point
   */
  static fromPoint(point: ProjPointType<bigint>): OmniKey {
    return new OmniKey(point)
  }

  /**
   * Create from uncompressed bytes (64 bytes: x + y coordinates)
   */
  static fromBytes(bytes: Uint8Array): OmniKey {
    if (bytes.length === 64) {
      return new OmniKey(secp256k1.Point.fromBytes(new Uint8Array([0x04, ...bytes])))
    }
    return new OmniKey(secp256k1.Point.fromBytes(bytes))
  }

  // Static constructors for testing (with secret key)

  /**
   * Create from secret key scalar (testing only)
   */
  static fromSecretKey(secretScalar: bigint): OmniKey {
    if (secretScalar >= secp256k1.CURVE.n) {
      throw new Error("Secret key scalar must be less than curve order")
    }
    const point = secp256k1.Point.BASE.multiply(secretScalar)
    return new OmniKey(point, secretScalar)
  }

  /**
   * Create from raw 32-byte secret key (testing only)
   */
  static fromSecretBytes(bytes: Uint8Array): OmniKey {
    if (bytes.length !== 32) {
      throw new Error(`Secret key must be exactly 32 bytes, got ${bytes.length}`)
    }
    const scalar = bytesToNumberBE(bytes)
    return OmniKey.fromSecretKey(scalar)
  }

  /**
   * Create from hex string secret key (testing only)
   */
  static fromSecretHex(hex: string): OmniKey {
    const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex
    if (cleanHex.length !== 64) {
      throw new Error(`Secret key hex must be 64 characters, got ${cleanHex.length}`)
    }
    const bytes = new Uint8Array(32)
    for (let i = 0; i < 32; i++) {
      bytes[i] = Number.parseInt(cleanHex.slice(i * 2, i * 2 + 2), 16)
    }
    return OmniKey.fromSecretBytes(bytes)
  }

  /**
   * Generate a random key with secret (testing only)
   */
  static random(): OmniKey {
    const randomBytes = secp256k1.utils.randomPrivateKey()
    return OmniKey.fromSecretBytes(randomBytes)
  }

  // Key derivation (always available)

  /**
   * Derive a child key using NEAR MPC recovery derivation scheme
   * Formula: child_pubkey = tweak * G + parent_pubkey
   * Where tweak = SHA3-256(prefix + predecessor_id + "," + path)
   */
  derive(predecessorId: string, path: string): OmniKey {
    const derivationPath = `${TWEAK_DERIVATION_PREFIX}${predecessorId}${ACCOUNT_DATA_SEPARATOR}${path}`
    const hash = sha3_256(new TextEncoder().encode(derivationPath))

    let tweak: bigint
    try {
      tweak = secp256k1.CURVE.Fp.create(bytesToNumberBE(hash))
    } catch (error) {
      throw new Error(`Derived tweak is not a valid scalar: ${error}`)
    }

    // Public key derivation: child_pubkey = tweak * G + parent_pubkey
    const tweakPoint = secp256k1.Point.BASE.multiply(tweak)
    const childPoint = this.point.add(tweakPoint)

    // Secret key derivation (if available): child_secret = (tweak + parent_secret) mod n
    const childSecret =
      this.secret !== undefined ? secp256k1.CURVE.Fp.create(tweak + this.secret) : undefined

    return new OmniKey(childPoint, childSecret)
  }

  // Chain-specific address getters (always available)

  /**
   * NEAR protocol format: "secp256k1:base58..."
   */
  get near(): string {
    const uncompressed = this.point.toBytes(false).slice(1)
    return SECP256K1_PREFIX + base58.encode(uncompressed)
  }

  /**
   * Ethereum address: "0x..." (last 20 bytes of Keccak-256 hash)
   */
  get ethereum(): string {
    const uncompressed = this.point.toBytes(false).slice(1)
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

  // Public key properties (always available)

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

  // Secret key properties and methods (testing only)

  /**
   * Check if this key can sign (has secret key)
   */
  canSign(): boolean {
    return this.secret !== undefined
  }

  /**
   * Get the raw secret key scalar (testing only)
   * @throws Error if no secret key available
   */
  get secretKey(): bigint {
    if (this.secret === undefined) {
      throw new Error("No secret key available - key was created from public key only")
    }
    return this.secret
  }

  /**
   * Get the secret key as 32 bytes (testing only)
   * @throws Error if no secret key available
   */
  get secretBytes(): Uint8Array {
    return numberToBytesBE(this.secretKey, 32)
  }

  /**
   * Get the secret key as hex string (testing only)
   * @throws Error if no secret key available
   */
  get secretHex(): string {
    return bytesToHex(this.secretBytes)
  }

  // Utility methods

  /**
   * Check if this key equals another key (compares public keys)
   */
  equals(other: OmniKey): boolean {
    return this.point.equals(other.point)
  }

  /**
   * Get a string representation for debugging
   */
  toString(): string {
    const mode = this.canSign() ? "with-secret" : "public-only"
    return `OmniKey(${this.hex.slice(0, 16)}..., ${mode})`
  }
}
