import { mod } from "@noble/curves/abstract/modular"
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
 * Supports both production (public-only) and testing (with secret) modes
 */
export class OmniKey {
  constructor(
    readonly publicKey: ProjPointType<bigint>,
    private readonly _secretKey?: bigint,
  ) {}

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

  static fromPoint(publicKey: ProjPointType<bigint>): OmniKey {
    return new OmniKey(publicKey)
  }

  static fromBytes(bytes: Uint8Array): OmniKey {
    if (bytes.length === 64) {
      const publicKey = secp256k1.Point.fromBytes(new Uint8Array([0x04, ...bytes]))
      return new OmniKey(publicKey)
    }
    const publicKey = secp256k1.Point.fromBytes(bytes)
    return new OmniKey(publicKey)
  }

  // Testing constructors
  static fromSecret(secretKey: bigint | string | Uint8Array): OmniKey {
    const cleanedKey =
      typeof secretKey === "string" && secretKey.startsWith("0x") ? secretKey.slice(2) : secretKey
    const secretKeyScalar = secp256k1.utils.normPrivateKeyToScalar(cleanedKey)
    const publicKey = secp256k1.Point.BASE.multiply(secretKeyScalar)
    return new OmniKey(publicKey, secretKeyScalar)
  }

  static random(): OmniKey {
    const randomBytes = secp256k1.utils.randomPrivateKey()
    return OmniKey.fromSecret(randomBytes)
  }

  // NEAR MPC additive key derivation
  derive(predecessorId: string, path: string): OmniKey {
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
    const childSecretKey =
      this._secretKey !== undefined ? mod(epsilon + this._secretKey, secp256k1.CURVE.n) : undefined

    return new OmniKey(childPublicKey, childSecretKey)
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

  // Secret key access (testing only)
  canSign(): boolean {
    return this._secretKey !== undefined
  }

  get secretKey(): bigint {
    if (this._secretKey === undefined) {
      throw new Error("No secret key available - key was created from public key only")
    }
    return this._secretKey
  }

  get secretBytes(): Uint8Array {
    return numberToBytesBE(this.secretKey, 32)
  }

  get secretHex(): string {
    return bytesToHex(numberToBytesBE(this.secretKey, 32))
  }

  toString(): string {
    const mode = this.canSign() ? "with-secret" : "public-only"
    return `OmniKey(${this.hex.slice(0, 16)}..., ${mode})`
  }
}
