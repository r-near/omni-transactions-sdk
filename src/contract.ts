/**
 * NEAR Chain Signatures (MPC) contract interface
 *
 * This module provides a TypeScript interface for interacting with NEAR's MPC
 * smart contract to request signatures for transactions on multiple blockchains.
 */

import type { Account } from "@near-js/accounts"
import {
  type ContractConfig,
  type ECDSAHash,
  ECDSAHashSchema,
  type ECDSASignature,
  type EDDSAMessage,
  EDDSAMessageSchema,
  type MPCSignatureResponse,
  MPCSignatureResponseSchema,
  type SignRequestArgs,
  SignRequestArgsSchema,
} from "./contract-types.js"

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
  async getDerivedPublicKey(predecessor: string, path: string): Promise<string> {
    return (await this.account.viewFunction({
      contractId: this.contractId,
      methodName: "derived_public_key",
      args: { predecessor, path },
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
   * Request a signature for the given payload
   *
   * @param args Signature request arguments (validated with Zod)
   * @returns Promise that resolves when signature is available
   */
  async sign(args: SignRequestArgs): Promise<ECDSASignature> {
    // Validate input with Zod
    const validatedArgs = SignRequestArgsSchema.parse(args)

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

    // Convert MPC format to standard ECDSA format
    return this.convertMPCToECDSA(mpcResponse)
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

  /**
   * Convert MPC signature format to standard ECDSA format
   */
  private convertMPCToECDSA(mpcResponse: MPCSignatureResponse): ECDSASignature {
    // Extract R from compressed point (remove "02" prefix and ensure 32 bytes)
    const rHex = mpcResponse.big_r.affine_point.slice(2).padStart(64, "0")

    // S scalar is already in correct format, just ensure 32 bytes
    const sHex = mpcResponse.s.scalar.padStart(64, "0")

    return {
      r: rHex,
      s: sHex,
      recovery_id: mpcResponse.recovery_id,
    }
  }

  /**
   * Create and validate a signature request for ECDSA payload
   */
  static createECDSARequest(path: string, hash: string, domainId = 0): SignRequestArgs {
    return SignRequestArgsSchema.parse({
      request: {
        domain_id: domainId,
        path,
        payload_v2: { type: "Ecdsa", hash },
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
        payload_v2: { type: "Eddsa", message },
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
