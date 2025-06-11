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

    // Convert to contract format
    const contractPayload =
      validatedArgs.payload.type === "Ecdsa"
        ? { Ecdsa: validatedArgs.payload.hash }
        : { Eddsa: validatedArgs.payload.message }

    // Make the signature request
    const _result = await this.account.functionCall({
      contractId: this.contractId,
      methodName: "sign",
      args: {
        path: validatedArgs.path,
        payload_v2: contractPayload,
        domain_id: validatedArgs.domain_id,
      },
      gas: 300000000000000n, // 300 TGas
      attachedDeposit: 0n,
    })

    // Parse result and handle potential errors
    // TODO: Implement proper result parsing based on actual response format
    // This will need to be updated once we test with a real account

    throw new Error("Sign method implementation pending - requires test account setup")
  }

  /**
   * Create and validate a signature request for ECDSA payload
   */
  static createECDSARequest(path: string, hash: string, domainId = 0): SignRequestArgs {
    return SignRequestArgsSchema.parse({
      path,
      payload: { type: "Ecdsa", hash },
      domain_id: domainId,
    })
  }

  /**
   * Create and validate a signature request for EDDSA payload
   */
  static createEDDSARequest(path: string, message: string, domainId = 0): SignRequestArgs {
    return SignRequestArgsSchema.parse({
      path,
      payload: { type: "Eddsa", message },
      domain_id: domainId,
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
