/**
 * NEAR Chain Signatures (MPC) contract interface
 *
 * This module provides a TypeScript interface for interacting with NEAR's MPC
 * smart contract to request signatures for transactions on multiple blockchains.
 */

import type { Account } from "@near-js/accounts"
import type { Provider } from "@near-js/providers"
import { actionCreators } from "@near-js/transactions"
import { bytesToNumberBE, hexToBytes } from "@noble/curves/abstract/utils"
import { secp256k1 } from "@noble/curves/secp256k1"
import {
  type ContractConfig,
  ECDSAHashSchema,
  EDDSAMessageSchema,
  type MPCSignatureResponse,
  MPCSignatureResponseSchema,
  type SignRequest,
  SignRequestSchema,
  SignatureType,
} from "./types.js"

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
  private readonly provider: Provider
  private readonly contractId: string

  constructor(account: Account, config: ContractConfig) {
    this.account = account
    this.provider = config.provider
    this.contractId = config.contractId ?? DEFAULT_CONTRACT_IDS[config.networkId]
  }

  /**
   * Get the root public key from the MPC contract
   */
  async getPublicKey(): Promise<string> {
    return (await this.provider.callFunction(this.contractId, "public_key", {})) as string
  }

  /**
   * Get a derived public key for the given predecessor and path
   */
  async getDerivedPublicKey(predecessor: string, path: string, domainId = 0): Promise<string> {
    return (await this.provider.callFunction(this.contractId, "derived_public_key", {
      predecessor,
      path,
      domain_id: domainId,
    })) as string
  }

  /**
   * Get the latest key version (domain ID)
   */
  async getLatestKeyVersion(): Promise<number> {
    return (await this.provider.callFunction(this.contractId, "latest_key_version", {})) as number
  }

  /**
   * Sign a message or hash using NEAR Chain Signatures (MPC)
   *
   * @param request Sign request parameters
   * @returns Promise that resolves to the signature
   */
  async sign(request: SignRequest): Promise<MPCSignature> {
    // Validate inputs using Zod schema
    const validatedRequest = SignRequestSchema.parse(request)

    // Auto-detect domain_id based on signature type
    const finalDomainId =
      validatedRequest.domainId ?? (validatedRequest.signatureType === SignatureType.ECDSA ? 0 : 1)

    // Validate message format based on signature type
    if (validatedRequest.signatureType === SignatureType.ECDSA) {
      ECDSAHashSchema.parse(validatedRequest.message) // Validates 32-byte hex hash
    } else {
      EDDSAMessageSchema.parse(validatedRequest.message) // Validates 32-1232 byte hex message
    }

    // Build MPC contract request
    const mpcRequest = {
      request: {
        domain_id: finalDomainId,
        path: validatedRequest.path,
        payload_v2:
          validatedRequest.signatureType === SignatureType.ECDSA
            ? { Ecdsa: validatedRequest.message }
            : { Eddsa: validatedRequest.message },
      },
    }

    // Make the signature request
    const result = await this.account.signAndSendTransaction({
      receiverId: this.contractId,
      actions: [actionCreators.functionCall("sign", mpcRequest, BigInt(10 * 10 ** 12), BigInt(1))],
      waitUntil: "EXECUTED_OPTIMISTIC",
    })

    // Parse and convert the response
    const mpcResponse = this.parseSignatureResponse(result)

    // Convert MPC format to appropriate signature type
    if (mpcResponse.scheme === "Secp256k1") {
      // Extract R from compressed point (remove "02" prefix) and convert to bigint
      const rBytes = hexToBytes(mpcResponse.big_r.affine_point.slice(2))
      const sBytes = hexToBytes(mpcResponse.s.scalar)
      const r = bytesToNumberBE(rBytes)
      const s = bytesToNumberBE(sBytes)
      return new secp256k1.Signature(r, s, mpcResponse.recovery_id)
    }
    if (mpcResponse.scheme === "Ed25519") {
      return new Uint8Array(mpcResponse.signature)
    }
    throw new Error(
      `Unsupported signature scheme: ${(mpcResponse as { scheme?: string }).scheme || "unknown"}`,
    )
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

      // Validate with Zod schema
      return MPCSignatureResponseSchema.parse(parsed)
    } catch (error) {
      throw new Error(`Failed to parse MPC signature response: ${(error as Error).message}`)
    }
  }
}
