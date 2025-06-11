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
 * Universal secp256k1 public key that can be represented in different blockchain formats
 * and supports hierarchical key derivation using NEAR MPC recovery scheme
 */
export class OmniPublicKey {
  constructor(private readonly point: ProjPointType<bigint>) {}

  /**
   * Create from NEAR protocol format: "secp256k1:base58..."
   */
  static fromNEAR(nearPublicKey: string): OmniPublicKey {
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

    return new OmniPublicKey(point)
  }

  /**
   * Create from raw secp256k1 point
   */
  static fromPoint(point: ProjPointType<bigint>): OmniPublicKey {
    return new OmniPublicKey(point)
  }

  /**
   * Create from uncompressed bytes (64 bytes: x + y coordinates)
   */
  static fromBytes(bytes: Uint8Array): OmniPublicKey {
    if (bytes.length === 64) {
      return new OmniPublicKey(secp256k1.Point.fromBytes(new Uint8Array([0x04, ...bytes])))
    }

    // Try parsing it anyway and see if we get something
    return new OmniPublicKey(secp256k1.Point.fromBytes(bytes))
  }

  /**
   * Derive a child key using NEAR MPC recovery derivation scheme
   * Formula: child_pubkey = tweak * G + parent_pubkey
   * Where tweak = SHA3-256(prefix + predecessor_id + "," + path)
   */
  derive(predecessorId: string, path: string): OmniPublicKey {
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

    return new OmniPublicKey(childPoint)
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
  equals(other: OmniPublicKey): boolean {
    return this.point.equals(other.point)
  }

  /**
   * Get a string representation for debugging
   */
  toString(): string {
    return `OmniPublicKey(${this.hex.slice(0, 16)}...)`
  }
}

/**
 * Secp256k1 secret key for testing NEAR Chain Signatures locally
 * WARNING: This is for testing purposes only! Never use in production.
 * Uses the same NEAR MPC recovery derivation scheme as OmniPublicKey
 */
export class OmniSecretKey {
  constructor(private readonly scalar: bigint) {}

  /**
   * Create from raw 32-byte private key
   */
  static fromBytes(bytes: Uint8Array): OmniSecretKey {
    if (bytes.length !== 32) {
      throw new Error(`Secret key must be exactly 32 bytes, got ${bytes.length}`)
    }
    const scalar = bytesToNumberBE(bytes)
    if (scalar >= secp256k1.CURVE.n) {
      throw new Error("Secret key scalar must be less than curve order")
    }
    return new OmniSecretKey(scalar)
  }

  /**
   * Create from hex string (with or without 0x prefix)
   */
  static fromHex(hex: string): OmniSecretKey {
    const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex
    if (cleanHex.length !== 64) {
      throw new Error(`Secret key hex must be 64 characters, got ${cleanHex.length}`)
    }
    const bytes = new Uint8Array(32)
    for (let i = 0; i < 32; i++) {
      bytes[i] = Number.parseInt(cleanHex.slice(i * 2, i * 2 + 2), 16)
    }
    return OmniSecretKey.fromBytes(bytes)
  }

  /**
   * Generate a random secret key for testing
   */
  static random(): OmniSecretKey {
    const randomBytes = secp256k1.utils.randomPrivateKey()
    return OmniSecretKey.fromBytes(randomBytes)
  }

  /**
   * Derive a child secret key using NEAR MPC recovery derivation scheme
   * Formula: child_secret = (epsilon + parent_secret) mod n
   * Where epsilon = SHA3-256(prefix + predecessor_id + "," + path)
   */
  derive(predecessorId: string, path: string): OmniSecretKey {
    // Create derivation path following NEAR's format (same as public key)
    const derivationPath = `${TWEAK_DERIVATION_PREFIX}${predecessorId}${ACCOUNT_DATA_SEPARATOR}${path}`
    // Hash to get epsilon
    const hash = sha3_256(new TextEncoder().encode(derivationPath))

    // Convert hash to scalar (might throw if not valid, but extremely rare)
    let epsilon: bigint
    try {
      epsilon = secp256k1.CURVE.Fp.create(bytesToNumberBE(hash))
    } catch (error) {
      throw new Error(`Derived epsilon is not a valid scalar: ${error}`)
    }

    // Calculate: (epsilon + parent_secret) mod n
    const childScalar = secp256k1.CURVE.Fp.create(epsilon + this.scalar)

    return new OmniSecretKey(childScalar)
  }

  /**
   * Get the corresponding public key
   */
  get publicKey(): OmniPublicKey {
    const point = secp256k1.Point.BASE.multiply(this.scalar)
    return OmniPublicKey.fromPoint(point)
  }

  /**
   * Get the raw scalar value
   */
  get scalar_value(): bigint {
    return this.scalar
  }

  /**
   * Get the secret key as 32 bytes
   */
  get bytes(): Uint8Array {
    return numberToBytesBE(this.scalar, 32)
  }

  /**
   * Get the secret key as hex string (without 0x prefix)
   */
  get hex(): string {
    return bytesToHex(this.bytes)
  }

  /**
   * Get a string representation for debugging (does not expose the secret)
   */
  toString(): string {
    return "OmniSecretKey(***hidden***)"
  }

  /**
   * Check if this key equals another key (constant time)
   */
  equals(other: OmniSecretKey): boolean {
    return this.scalar === other.scalar
  }
}

// Test fixtures and usage examples

/**
 * Standard test fixtures for development and testing
 */
export const TEST_FIXTURES = {
  // Test root public key from NEAR format
  NEAR_PUBLIC_KEY:
    "secp256k1:3tFRbMqmoa6AAALMrEFAYCEoHcqKxeW38YptwowBVBtXK1vo36HDbUWuR6EZmoK4JcH6HDkNMGGqP1ouV7VZUWya",

  // Corresponding test secret key (for testing only!)
  TEST_SECRET_KEY:
    "ed25519:43DJ5H2gzJoHKqUj1LC3sJYZc7C2EEAcfRUCk2nwC9T82LCnBCe1P5n4LqBhLSGrKmTnN3JLmnRk3MQqgAEVxRF4",

  // Test account and paths for derivation
  PREDECESSOR_ID: "alice.near",
  TEST_PATHS: ["ethereum-1", "bitcoin-1", "test-key-1", "path/to/key"],
} as const

// Example usage with public keys only (typical production usage)
function examplePublicKeyUsage() {
  console.log("=== Public Key Usage Example ===")

  // Create root key from NEAR format
  const rootKey = OmniPublicKey.fromNEAR(TEST_FIXTURES.NEAR_PUBLIC_KEY)
  console.log("Root key NEAR format:", rootKey.near)
  console.log("Root key Ethereum:", rootKey.ethereum)
  console.log("Root key Bitcoin:", rootKey.bitcoin)

  // Derive child keys for different purposes
  const ethKey = rootKey.derive(TEST_FIXTURES.PREDECESSOR_ID, "ethereum-1")
  const btcKey = rootKey.derive(TEST_FIXTURES.PREDECESSOR_ID, "bitcoin-1")

  console.log("\nEthereum child key:")
  console.log("  Address:", ethKey.ethereum)
  console.log("  NEAR format:", ethKey.near)

  console.log("\nBitcoin child key:")
  console.log("  Bech32:", btcKey.bitcoinBech32)
  console.log("  P2PKH:", btcKey.bitcoinP2PKH)
}

// Example usage with secret keys (testing only)
function exampleSecretKeyUsage() {
  console.log("\n=== Secret Key Usage Example (TESTING ONLY) ===")

  // Generate a random test secret key
  const rootSecret = OmniSecretKey.random()
  const rootPublic = rootSecret.publicKey

  console.log("Root public key (from secret):", rootPublic.near)
  console.log("Root public Ethereum:", rootPublic.ethereum)

  // Derive child secret and verify it matches public derivation
  const childSecret = rootSecret.derive(TEST_FIXTURES.PREDECESSOR_ID, "test-key-1")
  const childPublic = childSecret.publicKey
  const childPublicDirect = rootPublic.derive(TEST_FIXTURES.PREDECESSOR_ID, "test-key-1")

  console.log("\nChild key derivation verification:")
  console.log("  From secret derivation:", childPublic.ethereum)
  console.log("  From public derivation:", childPublicDirect.ethereum)
  console.log("  Keys match:", childPublic.equals(childPublicDirect))
}

// Example demonstrating cross-chain addresses
function exampleCrossChainAddresses() {
  console.log("\n=== Cross-Chain Address Example ===")

  const rootKey = OmniPublicKey.fromNEAR(TEST_FIXTURES.NEAR_PUBLIC_KEY)

  TEST_FIXTURES.TEST_PATHS.forEach((path, i) => {
    const derivedKey = rootKey.derive(TEST_FIXTURES.PREDECESSOR_ID, path)

    console.log(`\nDerived key ${i + 1} (path: ${path}):`)
    console.log("  NEAR:", derivedKey.near)
    console.log("  Ethereum:", derivedKey.ethereum)
    console.log("  Bitcoin Bech32:", derivedKey.bitcoinBech32)
    console.log("  Bitcoin P2PKH:", derivedKey.bitcoinP2PKH)
  })
}

// Run examples if this file is executed directly
if (import.meta.main) {
  examplePublicKeyUsage()
  exampleSecretKeyUsage()
  exampleCrossChainAddresses()
}
