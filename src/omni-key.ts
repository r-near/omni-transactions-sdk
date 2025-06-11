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
 * Uses NEAR MPC additive key derivation scheme:
 * 1. ε = SHA3-256("near-mpc-recovery v0.1.0 epsilon derivation:" + account + "," + path)
 * 2. child_secret = (ε + parent_secret) mod n
 * 3. child_public = ε × G + parent_public
 *
 * Key insight: This ensures child_secret × G = child_public (cryptographic consistency)
 * because (ε + parent_secret) × G = ε × G + parent_secret × G = ε × G + parent_public
 *
 * This differs from BIP32's multiplicative derivation and allows the MPC network
 * to derive child keys without knowing the parent secret key.
 */
export class OmniKey {
  constructor(
    private readonly publicKey: ProjPointType<bigint>,
    private readonly _secretKey?: bigint,
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

    const publicKey = secp256k1.Point.fromBytes(new Uint8Array([0x04, ...decoded]))
    return new OmniKey(publicKey)
  }

  /**
   * Create from raw secp256k1 public key point
   */
  static fromPoint(publicKey: ProjPointType<bigint>): OmniKey {
    return new OmniKey(publicKey)
  }

  /**
   * Create from uncompressed public key bytes (64 bytes: x + y coordinates)
   */
  static fromBytes(bytes: Uint8Array): OmniKey {
    if (bytes.length === 64) {
      const publicKey = secp256k1.Point.fromBytes(new Uint8Array([0x04, ...bytes]))
      return new OmniKey(publicKey)
    }
    const publicKey = secp256k1.Point.fromBytes(bytes)
    return new OmniKey(publicKey)
  }

  // Static constructors for testing (with secret key)

  /**
   * Create from secret key scalar (testing only)
   * Generates the corresponding public key: publicKey = secretKey × G
   */
  static fromSecretKey(secretKeyScalar: bigint): OmniKey {
    if (secretKeyScalar >= secp256k1.CURVE.n) {
      throw new Error("Secret key scalar must be less than curve order")
    }
    const publicKey = secp256k1.Point.BASE.multiply(secretKeyScalar)
    return new OmniKey(publicKey, secretKeyScalar)
  }

  /**
   * Create from raw 32-byte secret key (testing only)
   * Generates the corresponding public key: publicKey = secretKey × G
   */
  static fromSecretBytes(bytes: Uint8Array): OmniKey {
    if (bytes.length !== 32) {
      throw new Error(`Secret key must be exactly 32 bytes, got ${bytes.length}`)
    }
    const secretKeyScalar = bytesToNumberBE(bytes)
    return OmniKey.fromSecretKey(secretKeyScalar)
  }

  /**
   * Create from hex string secret key (testing only)
   * Generates the corresponding public key: publicKey = secretKey × G
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
   * Generates the corresponding public key: publicKey = secretKey × G
   */
  static random(): OmniKey {
    const randomBytes = secp256k1.utils.randomPrivateKey()
    return OmniKey.fromSecretBytes(randomBytes)
  }

  // Key derivation (always available)

  /**
   * Derive a child key using NEAR MPC additive derivation scheme
   *
   * Math:
   * - ε = SHA3-256("near-mpc-recovery v0.1.0 epsilon derivation:" + predecessorId + "," + path)
   * - child_secret = (ε + parent_secret) mod n
   * - child_public = ε × G + parent_public
   *
   * Ensures: child_secret × G = child_public (cryptographic consistency)
   */
  derive(predecessorId: string, path: string): OmniKey {
    const derivationPath = `${TWEAK_DERIVATION_PREFIX}${predecessorId}${ACCOUNT_DATA_SEPARATOR}${path}`
    const hash = sha3_256(new TextEncoder().encode(derivationPath))

    let epsilon: bigint
    try {
      epsilon = secp256k1.CURVE.Fp.create(bytesToNumberBE(hash))
    } catch (error) {
      throw new Error(`Derived epsilon is not a valid scalar: ${error}`)
    }

    // Public key derivation: child_public = ε × G + parent_public
    const epsilonPoint = secp256k1.Point.BASE.multiply(epsilon)
    const childPublicKey = this.publicKey.add(epsilonPoint)

    // Secret key derivation (if available): child_secret = (ε + parent_secret) mod n
    const childSecretKey =
      this._secretKey !== undefined ? (epsilon + this._secretKey) % secp256k1.CURVE.n : undefined

    return new OmniKey(childPublicKey, childSecretKey)
  }

  // Chain-specific address getters (always available)

  /**
   * NEAR protocol format: "secp256k1:base58..."
   */
  get near(): string {
    const uncompressed = this.publicKey.toBytes(false).slice(1)
    return SECP256K1_PREFIX + base58.encode(uncompressed)
  }

  /**
   * Ethereum address: "0x..." (last 20 bytes of Keccak-256 hash)
   */
  get ethereum(): string {
    const uncompressed = this.publicKey.toBytes(false).slice(1)
    const hash = keccak_256(uncompressed)
    const addressBytes = hash.slice(-ETHEREUM_ADDRESS_BYTES)
    return `0x${bytesToHex(addressBytes)}`
  }

  /**
   * Bitcoin P2PKH address (legacy format, starts with "1")
   */
  get bitcoinP2PKH(): string {
    return p2pkh(this.publicKey.toBytes(true)).address
  }

  /**
   * Bitcoin Bech32 address (modern format, starts with "bc1")
   */
  get bitcoinBech32(): string {
    return p2wpkh(this.publicKey.toBytes(true)).address
  }

  /**
   * Bitcoin address (defaults to modern Bech32 format)
   */
  get bitcoin(): string {
    return this.bitcoinBech32
  }

  // Public key properties (always available)

  /**
   * Raw secp256k1 public key point
   */
  get rawPoint(): ProjPointType<bigint> {
    return this.publicKey
  }

  /**
   * Uncompressed public key bytes (65 bytes: prefix + x + y coordinates)
   */
  get bytes(): Uint8Array {
    return this.publicKey.toBytes(false)
  }

  /**
   * Compressed public key bytes (33 bytes: prefix + x coordinate)
   */
  get compressed(): Uint8Array {
    return this.publicKey.toBytes(true)
  }

  /**
   * Hex representation of uncompressed public key
   */
  get hex(): string {
    return this.publicKey.toHex(false)
  }

  // Secret key properties and methods (testing only)

  /**
   * Check if this key can sign (has secret key)
   */
  canSign(): boolean {
    return this._secretKey !== undefined
  }

  /**
   * Get the raw secret key scalar (testing only)
   * @throws Error if no secret key available
   */
  get secretKey(): bigint {
    if (this._secretKey === undefined) {
      throw new Error("No secret key available - key was created from public key only")
    }
    return this._secretKey
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
    return this.publicKey.equals(other.publicKey)
  }

  /**
   * Get a string representation for debugging
   */
  toString(): string {
    const mode = this.canSign() ? "with-secret" : "public-only"
    return `OmniKey(${this.hex.slice(0, 16)}..., ${mode})`
  }
}
