import { mod } from "@noble/curves/abstract/modular"
import type { ProjPointType, RecoveredSignatureType } from "@noble/curves/abstract/weierstrass"
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
 * Production secp256k1 key for NEAR Chain Signatures (MPC)
 * Public key only - used for address derivation and transaction construction
 */
export class MPCKey {
  constructor(readonly publicKey: ProjPointType<bigint>) {}

  static fromNEAR(nearPublicKey: string): MPCKey {
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
    return new MPCKey(publicKey)
  }

  static fromPoint(publicKey: ProjPointType<bigint>): MPCKey {
    return new MPCKey(publicKey)
  }

  static fromBytes(bytes: Uint8Array): MPCKey {
    if (bytes.length === 64) {
      const publicKey = secp256k1.Point.fromBytes(new Uint8Array([0x04, ...bytes]))
      return new MPCKey(publicKey)
    }
    const publicKey = secp256k1.Point.fromBytes(bytes)
    return new MPCKey(publicKey)
  }

  // NEAR MPC additive key derivation
  derive(predecessorId: string, path: string): MPCKey {
    const derivationPath = `${TWEAK_DERIVATION_PREFIX}${predecessorId}${ACCOUNT_DATA_SEPARATOR}${path}`
    const hash = sha3_256(new TextEncoder().encode(derivationPath))

    let epsilon: bigint
    try {
      epsilon = secp256k1.CURVE.Fp.create(bytesToNumberBE(hash))
    } catch (error) {
      throw new Error(`Derived epsilon is not a valid scalar: ${error}`)
    }

    const epsilonPoint = secp256k1.Point.BASE.multiply(epsilon)
    const childPublicKey = this.publicKey.add(epsilonPoint)

    return new MPCKey(childPublicKey)
  }

  // Address getters
  get near(): string {
    const uncompressed = this.publicKey.toBytes(false).slice(1)
    return SECP256K1_PREFIX + base58.encode(uncompressed)
  }

  get ethereum(): string {
    const uncompressed = this.publicKey.toBytes(false).slice(1)
    const hash = keccak_256(uncompressed)
    const addressBytes = hash.slice(-ETHEREUM_ADDRESS_BYTES)
    return `0x${bytesToHex(addressBytes)}`
  }

  get bitcoinP2PKH(): string {
    return p2pkh(this.publicKey.toBytes(true)).address
  }

  get bitcoinBech32(): string {
    return p2wpkh(this.publicKey.toBytes(true)).address
  }

  get bitcoin(): string {
    return this.bitcoinBech32
  }

  // Public key properties

  get bytes(): Uint8Array {
    return this.publicKey.toBytes(false)
  }

  get compressed(): Uint8Array {
    return this.publicKey.toBytes(true)
  }

  get hex(): string {
    return this.publicKey.toHex(false)
  }

  toString(): string {
    return `MPCKey(${this.hex.slice(0, 16)}...)`
  }
}

/**
 * Testing secp256k1 key for NEAR Chain Signatures (MPC)
 * Includes secret key for local signing - used for testing without MPC network calls
 */
export class MockMPCKey extends MPCKey {
  constructor(
    publicKey: ProjPointType<bigint>,
    private readonly _secretKey: bigint,
  ) {
    super(publicKey)
  }

  static fromSecret(secretKey: bigint | string | Uint8Array): MockMPCKey {
    const cleanedKey =
      typeof secretKey === "string" && secretKey.startsWith("0x") ? secretKey.slice(2) : secretKey
    const secretKeyScalar = secp256k1.utils.normPrivateKeyToScalar(cleanedKey)
    const publicKey = secp256k1.Point.BASE.multiply(secretKeyScalar)
    return new MockMPCKey(publicKey, secretKeyScalar)
  }

  static random(): MockMPCKey {
    const randomBytes = secp256k1.utils.randomPrivateKey()
    return MockMPCKey.fromSecret(randomBytes)
  }

  // Override derive to return MockMPCKey with derived secret
  override derive(predecessorId: string, path: string): MockMPCKey {
    const derivationPath = `${TWEAK_DERIVATION_PREFIX}${predecessorId}${ACCOUNT_DATA_SEPARATOR}${path}`
    const hash = sha3_256(new TextEncoder().encode(derivationPath))

    let epsilon: bigint
    try {
      epsilon = secp256k1.CURVE.Fp.create(bytesToNumberBE(hash))
    } catch (error) {
      throw new Error(`Derived epsilon is not a valid scalar: ${error}`)
    }

    const epsilonPoint = secp256k1.Point.BASE.multiply(epsilon)
    const childPublicKey = this.publicKey.add(epsilonPoint)
    const childSecretKey = mod(epsilon + this._secretKey, secp256k1.CURVE.n)

    return new MockMPCKey(childPublicKey, childSecretKey)
  }

  // Secret key access
  get secretKey(): bigint {
    return this._secretKey
  }

  get secretBytes(): Uint8Array {
    return numberToBytesBE(this._secretKey, 32)
  }

  get secretHex(): string {
    return bytesToHex(numberToBytesBE(this._secretKey, 32))
  }

  sign(messageHash: Uint8Array): RecoveredSignatureType {
    return secp256k1.sign(messageHash, this._secretKey)
  }

  override toString(): string {
    return `MockMPCKey(${this.hex.slice(0, 16)}..., with-secret)`
  }
}
