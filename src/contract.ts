/**
 * NEAR Chain Signatures (MPC) contract interface
 *
 * This module provides a TypeScript interface for interacting with NEAR's MPC
 * smart contract to request signatures for transactions on multiple blockchains.
 */

import type { Account } from "@near-js/accounts"
import { bytesToNumberBE, hexToBytes } from "@noble/curves/abstract/utils"
import { secp256k1 } from "@noble/curves/secp256k1"
import {
  type ContractConfig,
  type ECDSAHash,
  ECDSAHashSchema,
  type EDDSAMessage,
  EDDSAMessageSchema,
  type MPCECDSASignatureResponse,
  type MPCEDDSASignatureResponse,
  type MPCSignatureResponse,
  MPCSignatureResponseSchema,
  type SignRequestArgs,
  SignRequestArgsSchema,
} from "./contract-types.js"

/**
 * Union type for all supported signature types
 */
export type MPCSignature = InstanceType<typeof secp256k1.Signature> | Uint8Array // Ed25519 signatures are raw bytes

/**
 * Default contract addresses for different networks
 */
export const DEFAULT_CONTRACT_IDS = {
  mainnet: "v1.signer",
  testnet: "v1.signer-prod.testnet",
} as const

/**
 * NEAR Chain Signatures (MPC) contract client
 *
 * Provides methods to interact with NEAR's MPC smart contract for requesting
 * signatures on transactions for multiple blockchain networks.
 */
export class Contract {
  private readonly account: Account
  private readonly contractId: string

  constructor(account: Account, config: ContractConfig) {
    this.account = account
    this.contractId = config.contractId ?? DEFAULT_CONTRACT_IDS[config.networkId]
  }

  /**
   * Get the root public key from the MPC contract
   */
  async getPublicKey(): Promise<string> {
    return (await this.account.viewFunction({
      contractId: this.contractId,
      methodName: "public_key",
      args: {},
    })) as string
  }

  /**
   * Get a derived public key for the given predecessor and path
   */
  async getDerivedPublicKey(predecessor: string, path: string, domainId = 0): Promise<string> {
    return (await this.account.viewFunction({
      contractId: this.contractId,
      methodName: "derived_public_key",
      args: { predecessor, path, domain_id: domainId },
    })) as string
  }

  /**
   * Get the latest key version (domain ID)
   */
  async getLatestKeyVersion(): Promise<number> {
    return (await this.account.viewFunction({
      contractId: this.contractId,
      methodName: "latest_key_version",
      args: {},
    })) as number
  }

  /**
   * Check which signature types this MPC contract supports by testing available domains
   */
  async getSupportedSignatureTypes(): Promise<{ ecdsa: boolean; eddsa: boolean }> {
    const support = { ecdsa: false, eddsa: false }

    try {
      // Test domain 0 (typically ECDSA/secp256k1)
      await this.account.viewFunction({
        contractId: this.contractId,
        methodName: "public_key",
        args: { domain_id: 0 },
      })
      support.ecdsa = true
    } catch {
      // Domain 0 not available
    }

    try {
      // Test domain 1 (typically EDDSA/Ed25519)
      await this.account.viewFunction({
        contractId: this.contractId,
        methodName: "public_key",
        args: { domain_id: 1 },
      })
      support.eddsa = true
    } catch {
      // Domain 1 not available
    }

    return support
  }

  /**
   * Request a signature for the given payload
   *
   * @param args Signature request arguments (validated with Zod)
   * @returns Promise that resolves when signature is available
   */
  async sign(args: SignRequestArgs): Promise<MPCSignature> {
    // Validate input with Zod
    const validatedArgs = SignRequestArgsSchema.parse(args)

    // Detect payload type
    const payload = validatedArgs.request.payload_v2
    const isECDSA = "Ecdsa" in payload
    const isEDDSA = "Eddsa" in payload

    if (!isECDSA && !isEDDSA) {
      throw new Error("Unknown payload type - must be Ecdsa or Eddsa")
    }

    // Note: Signature type is determined by domain_id parameter:
    // domain_id 0 = ECDSA (secp256k1), domain_id 1 = EDDSA (Ed25519)

    try {
      // Make the signature request (args are already in correct format)
      const result = await this.account.functionCall({
        contractId: this.contractId,
        methodName: "sign",
        args: validatedArgs,
        gas: 300000000000000n, // 300 TGas
        attachedDeposit: 1n, // Required 1 yoctoNEAR deposit
      })

      // Parse the response from the transaction result
      const mpcResponse = this.parseSignatureResponse(result)

      // Convert MPC format to appropriate @noble/curves Signature
      if (mpcResponse.scheme === "Secp256k1") {
        return this.convertMPCToECDSASignature(mpcResponse)
      }
      if (mpcResponse.scheme === "Ed25519") {
        return this.convertMPCToEDDSASignature(mpcResponse)
      }
      throw new Error(
        `Unsupported signature scheme: ${(mpcResponse as { scheme?: string }).scheme || "unknown"}`,
      )
    } catch (error) {
      // Provide helpful error messages for common issues
      const errorMsg = (error as Error).message
      if (errorMsg.includes("Payload is not Ecdsa")) {
        throw new Error(
          `EDDSA payload rejected for domain_id ${validatedArgs.request.domain_id}. This domain may only support ECDSA signatures. Try domain_id 1 for EDDSA.`,
        )
      }
      if (errorMsg.includes("Payload is not EdDSA")) {
        throw new Error(
          `ECDSA payload rejected for domain_id ${validatedArgs.request.domain_id}. This domain may only support EDDSA signatures. Try domain_id 0 for ECDSA.`,
        )
      }
      throw error
    }
  }

  /**
   * Parse the signature response from NEAR transaction result
   */
  private parseSignatureResponse(result: unknown): MPCSignatureResponse {
    // The signature is in the SuccessValue of the transaction status
    const res = result as { status?: { SuccessValue?: string } }
    if (!res?.status?.SuccessValue) {
      throw new Error("No success value in transaction result")
    }

    try {
      // Decode base64 and parse JSON
      const decoded = Buffer.from(res.status.SuccessValue, "base64").toString("utf8")
      const parsed = JSON.parse(decoded)

      // Debug logging for Ed25519 responses
      if (parsed.scheme === "Ed25519") {
        console.log("Raw Ed25519 MPC Response:", JSON.stringify(parsed, null, 2))
      }

      // Validate with Zod schema
      return MPCSignatureResponseSchema.parse(parsed)
    } catch (error) {
      throw new Error(`Failed to parse MPC signature response: ${(error as Error).message}`)
    }
  }

  /**
   * Convert MPC signature format to secp256k1 Signature (ECDSA)
   */
  private convertMPCToECDSASignature(
    mpcResponse: MPCECDSASignatureResponse,
  ): InstanceType<typeof secp256k1.Signature> {
    // Extract R from compressed point (remove "02" prefix) and convert to bigint
    const rBytes = hexToBytes(mpcResponse.big_r.affine_point.slice(2))
    const sBytes = hexToBytes(mpcResponse.s.scalar)

    const r = bytesToNumberBE(rBytes)
    const s = bytesToNumberBE(sBytes)

    // Create signature with recovery bit
    return new secp256k1.Signature(r, s, mpcResponse.recovery_id)
  }

  /**
   * Convert MPC signature format to Ed25519 signature bytes (EDDSA)
   */
  private convertMPCToEDDSASignature(mpcResponse: MPCEDDSASignatureResponse): Uint8Array {
    // Convert the signature array (64 bytes) to Uint8Array
    return new Uint8Array(mpcResponse.signature)
  }

  /**
   * Create and validate a signature request for ECDSA payload
   */
  static createECDSARequest(path: string, hash: string, domainId = 0): SignRequestArgs {
    return SignRequestArgsSchema.parse({
      request: {
        domain_id: domainId,
        path,
        payload_v2: { Ecdsa: hash },
      },
    })
  }

  /**
   * Create and validate a signature request for EDDSA payload
   */
  static createEDDSARequest(path: string, message: string, domainId = 0): SignRequestArgs {
    return SignRequestArgsSchema.parse({
      request: {
        domain_id: domainId,
        path,
        payload_v2: { Eddsa: message },
      },
    })
  }
}

/**
 * Create a Contract instance with default configuration
 */
export function createContract(account: Account, networkId: "mainnet" | "testnet"): Contract {
  return new Contract(account, { networkId })
}

/**
 * Validate and parse an ECDSA hash
 */
export function validateECDSAHash(hash: string): ECDSAHash {
  return ECDSAHashSchema.parse(hash)
}

/**
 * Validate and parse an EDDSA message
 */
export function validateEDDSAMessage(message: string): EDDSAMessage {
  return EDDSAMessageSchema.parse(message)
}
