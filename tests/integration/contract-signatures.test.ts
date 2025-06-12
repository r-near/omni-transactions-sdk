/**
 * Comprehensive integration tests for NEAR Chain Signatures (MPC) Contract
 *
 * Tests both ECDSA and EDDSA signature workflows end-to-end with real testnet account
 */

import { beforeAll, describe, expect, test } from "bun:test"
import os from "node:os"
import path from "node:path"
import { Account } from "@near-js/accounts"
import { getSignerFromKeystore } from "@near-js/client"
import { UnencryptedFileSystemKeyStore } from "@near-js/keystores-node"
import { JsonRpcProvider } from "@near-js/providers"
import { hexToBytes } from "@noble/curves/abstract/utils"
import { ed25519 } from "@noble/curves/ed25519"
import { secp256k1 } from "@noble/curves/secp256k1"
import { base58 } from "@scure/base"
import { Contract, type MPCSignature } from "../../src/contract.js"

// Test Configuration
const TEST_CONFIG = {
  accountId: "omni-sdk-test.testnet",
  networkId: "testnet" as const,
  contractId: "v1.signer-prod.testnet",
  rpcUrl: "https://rpc.testnet.near.org",
  credentialsPath: path.join(os.homedir(), ".near-credentials"),
  timeout: 30000, // 30 second timeout for network operations
}

// Test Vectors
const TEST_VECTORS = {
  ecdsa: {
    hash: "a0b1c2d3e4f5061728394a5b6c7d8e9f0a1b2c3d4e5f6071829304a5b6c7d8e9",
    path: "ethereum-test",
    expectedDomain: 0,
  },
  eddsa: {
    message: "deadbeef".repeat(16), // 64 chars = 32 bytes
    path: "solana-test",
    expectedDomain: 1,
  },
  paths: [
    "ethereum-1",
    "bitcoin-main",
    "solana-devnet",
    "cosmos-hub",
    "special/path/with/slashes",
    `test-${Date.now()}`, // Unique path to avoid conflicts
  ],
}

// Global test state
let testAccount: Account
let testProvider: JsonRpcProvider
let testContract: Contract

// Test Utilities
async function createTestAccount(): Promise<Account> {
  const keyStore = new UnencryptedFileSystemKeyStore(TEST_CONFIG.credentialsPath)
  const signer = await getSignerFromKeystore(TEST_CONFIG.accountId, TEST_CONFIG.networkId, keyStore)
  const provider = new JsonRpcProvider({ url: TEST_CONFIG.rpcUrl })
  return new Account(TEST_CONFIG.accountId, provider, signer)
}

function createTestContract(account: Account, provider: JsonRpcProvider): Contract {
  return new Contract(account, {
    networkId: TEST_CONFIG.networkId,
    contractId: TEST_CONFIG.contractId,
    provider,
  })
}

function expectValidECDSASignature(
  signature: MPCSignature,
): asserts signature is InstanceType<typeof secp256k1.Signature> {
  expect(signature).toBeInstanceOf(secp256k1.Signature)
  const ecdsaSig = signature as InstanceType<typeof secp256k1.Signature>
  expect(ecdsaSig.r).toBeGreaterThan(0n)
  expect(ecdsaSig.s).toBeGreaterThan(0n)
  expect(typeof ecdsaSig.recovery).toBe("number")
  expect(ecdsaSig.recovery).toBeGreaterThanOrEqual(0)
  expect(ecdsaSig.recovery).toBeLessThanOrEqual(3)
}

function expectValidEDDSASignature(signature: MPCSignature): asserts signature is Uint8Array {
  expect(signature).toBeInstanceOf(Uint8Array)
  const eddsaSig = signature as Uint8Array
  expect(eddsaSig.length).toBe(64) // Ed25519 signatures are always 64 bytes
}

async function verifyECDSASignature(
  signature: InstanceType<typeof secp256k1.Signature>,
  hash: string,
  contract: Contract,
  path: string,
): Promise<boolean> {
  try {
    // Get derived public key from contract
    const derivedKeyStr = await contract.getDerivedPublicKey(TEST_CONFIG.accountId, path, 0)
    if (!derivedKeyStr || !derivedKeyStr.startsWith("secp256k1:")) {
      throw new Error(`Invalid derived key format: ${derivedKeyStr}`)
    }
    const pubKeyStr = derivedKeyStr.replace("secp256k1:", "")
    const pubKeyBytes = base58.decode(pubKeyStr)

    // Verify signature
    const hashBytes = hexToBytes(hash)
    return secp256k1.verify(signature, hashBytes, pubKeyBytes)
  } catch (error) {
    console.error("ECDSA verification error:", error)
    return false
  }
}

async function verifyEDDSASignature(
  signature: Uint8Array,
  message: string,
  contract: Contract,
  path: string,
): Promise<boolean> {
  try {
    // Get derived Ed25519 public key from contract
    const derivedKeyStr = await contract.getDerivedPublicKey(TEST_CONFIG.accountId, path, 1)
    if (!derivedKeyStr || !derivedKeyStr.startsWith("ed25519:")) {
      throw new Error(`Invalid derived key format: ${derivedKeyStr}`)
    }
    const pubKeyStr = derivedKeyStr.replace("ed25519:", "")
    const pubKeyBytes = base58.decode(pubKeyStr)

    // Verify signature
    const messageBytes = hexToBytes(message)
    return ed25519.verify(signature, messageBytes, pubKeyBytes)
  } catch (error) {
    console.error("EDDSA verification error:", error)
    return false
  }
}

// Setup
beforeAll(async () => {
  console.log(`Setting up integration tests with account: ${TEST_CONFIG.accountId}`)
  testProvider = new JsonRpcProvider({ url: TEST_CONFIG.rpcUrl })
  testAccount = await createTestAccount()
  testContract = createTestContract(testAccount, testProvider)

  // Verify account has sufficient balance
  const state = await testAccount.state()
  console.log(`Account balance: ${state.amount} yoctoNEAR`)
  expect(BigInt(state.amount)).toBeGreaterThan(1000000000000000000n) // At least 0.001 NEAR
})

describe("MPC Contract View Methods", () => {
  test(
    "should get root public key",
    async () => {
      const publicKey = await testContract.getPublicKey()
      expect(publicKey).toBeDefined()
      expect(typeof publicKey).toBe("string")
      expect(publicKey).toMatch(/^secp256k1:/)
    },
    TEST_CONFIG.timeout,
  )

  test(
    "should get derived public keys for different domain IDs",
    async () => {
      const path = TEST_VECTORS.paths[0] as string

      // Test domain 0 (ECDSA)
      const derivedKeyECDSA = await testContract.getDerivedPublicKey(TEST_CONFIG.accountId, path, 0)
      expect(derivedKeyECDSA).toBeDefined()
      expect(derivedKeyECDSA).toMatch(/^secp256k1:/)

      // Test domain 1 (EDDSA)
      const derivedKeyEDDSA = await testContract.getDerivedPublicKey(TEST_CONFIG.accountId, path, 1)
      expect(derivedKeyEDDSA).toBeDefined()
      expect(derivedKeyEDDSA).toMatch(/^ed25519:/)

      // Keys should be different
      expect(derivedKeyECDSA).not.toBe(derivedKeyEDDSA)
    },
    TEST_CONFIG.timeout,
  )

  test(
    "should get latest key version",
    async () => {
      const keyVersion = await testContract.getLatestKeyVersion()
      expect(typeof keyVersion).toBe("number")
      expect(keyVersion).toBeGreaterThanOrEqual(0)
    },
    TEST_CONFIG.timeout,
  )
})

describe("ECDSA (secp256k1) Signatures", () => {
  test(
    "should sign ECDSA hash with default parameters",
    async () => {
      const signature = await testContract.sign(TEST_VECTORS.ecdsa.path, TEST_VECTORS.ecdsa.hash)

      expectValidECDSASignature(signature)

      // Verify signature is cryptographically valid
      const isValid = await verifyECDSASignature(
        signature,
        TEST_VECTORS.ecdsa.hash,
        testContract,
        TEST_VECTORS.ecdsa.path,
      )
      expect(isValid).toBe(true)
    },
    TEST_CONFIG.timeout,
  )

  test(
    "should sign ECDSA hash with explicit parameters",
    async () => {
      const signature = await testContract.sign(
        TEST_VECTORS.ecdsa.path,
        TEST_VECTORS.ecdsa.hash,
        "ecdsa",
        0,
      )

      expectValidECDSASignature(signature)

      // Should behave same as default
      const defaultSignature = await testContract.sign(
        TEST_VECTORS.ecdsa.path,
        TEST_VECTORS.ecdsa.hash,
      )
      expect(signature.r).toBe((defaultSignature as InstanceType<typeof secp256k1.Signature>).r)
      expect(signature.s).toBe((defaultSignature as InstanceType<typeof secp256k1.Signature>).s)
    },
    TEST_CONFIG.timeout,
  )

  test(
    "should produce cryptographically valid ECDSA signatures",
    async () => {
      const testPath = `ecdsa-verify-${Date.now()}`
      const signature = await testContract.sign(testPath, TEST_VECTORS.ecdsa.hash, "ecdsa")

      expectValidECDSASignature(signature)

      // Verify against derived public key
      const isValid = await verifyECDSASignature(
        signature,
        TEST_VECTORS.ecdsa.hash,
        testContract,
        testPath,
      )
      expect(isValid).toBe(true)
    },
    TEST_CONFIG.timeout,
  )

  test("should validate ECDSA hash format", async () => {
    // Invalid hex string
    await expect(testContract.sign("test", "invalid")).rejects.toThrow()

    // Wrong length (not 32 bytes)
    await expect(testContract.sign("test", "a0b1c2")).rejects.toThrow()

    // Empty values
    await expect(testContract.sign("", TEST_VECTORS.ecdsa.hash)).rejects.toThrow()
    await expect(testContract.sign("test", "")).rejects.toThrow()
  })
})

describe("EDDSA (Ed25519) Signatures", () => {
  test(
    "should sign EDDSA message with explicit type",
    async () => {
      const signature = await testContract.sign(
        TEST_VECTORS.eddsa.path,
        TEST_VECTORS.eddsa.message,
        "eddsa",
      )

      expectValidEDDSASignature(signature)

      // Verify signature is cryptographically valid
      const isValid = await verifyEDDSASignature(
        signature,
        TEST_VECTORS.eddsa.message,
        testContract,
        TEST_VECTORS.eddsa.path,
      )
      expect(isValid).toBe(true)
    },
    TEST_CONFIG.timeout,
  )

  test(
    "should auto-route EDDSA to domain 1",
    async () => {
      const testPath = `eddsa-domain-${Date.now()}`
      const signature = await testContract.sign(testPath, TEST_VECTORS.eddsa.message, "eddsa")

      expectValidEDDSASignature(signature)

      // Should use domain 1 automatically
      const isValid = await verifyEDDSASignature(
        signature,
        TEST_VECTORS.eddsa.message,
        testContract,
        testPath,
      )
      expect(isValid).toBe(true)
    },
    TEST_CONFIG.timeout,
  )

  test(
    "should produce cryptographically valid EDDSA signatures",
    async () => {
      const testPath = `eddsa-verify-${Date.now()}`
      const signature = await testContract.sign(testPath, TEST_VECTORS.eddsa.message, "eddsa")

      expectValidEDDSASignature(signature)

      // Verify against derived Ed25519 public key
      const isValid = await verifyEDDSASignature(
        signature,
        TEST_VECTORS.eddsa.message,
        testContract,
        testPath,
      )
      expect(isValid).toBe(true)
    },
    TEST_CONFIG.timeout,
  )

  test("should validate EDDSA message format", async () => {
    // Invalid hex string
    await expect(testContract.sign("test", "invalid_hex", "eddsa")).rejects.toThrow()

    // Too short (< 32 bytes)
    await expect(testContract.sign("test", "short", "eddsa")).rejects.toThrow()

    // Too long (> 1232 bytes) - 2464 hex chars
    const tooLongMessage = "a".repeat(2465)
    await expect(testContract.sign("test", tooLongMessage, "eddsa")).rejects.toThrow()
  })
})

describe("Multi-Signature Support", () => {
  test(
    "should handle same path with different signature types",
    async () => {
      const sharedPath = `multi-sig-${Date.now()}`

      // Sign with ECDSA
      const ecdsaSignature = await testContract.sign(sharedPath, TEST_VECTORS.ecdsa.hash, "ecdsa")
      expectValidECDSASignature(ecdsaSignature)

      // Sign with EDDSA
      const eddsaSignature = await testContract.sign(
        sharedPath,
        TEST_VECTORS.eddsa.message,
        "eddsa",
      )
      expectValidEDDSASignature(eddsaSignature)

      // Both should be valid
      const ecdsaValid = await verifyECDSASignature(
        ecdsaSignature,
        TEST_VECTORS.ecdsa.hash,
        testContract,
        sharedPath,
      )
      const eddsaValid = await verifyEDDSASignature(
        eddsaSignature,
        TEST_VECTORS.eddsa.message,
        testContract,
        sharedPath,
      )

      expect(ecdsaValid).toBe(true)
      expect(eddsaValid).toBe(true)
    },
    TEST_CONFIG.timeout,
  )

  test(
    "should properly isolate domains",
    async () => {
      const testPath = `domain-isolation-${Date.now()}`

      // Get derived keys for both domains
      const domain0Key = await testContract.getDerivedPublicKey(TEST_CONFIG.accountId, testPath, 0)
      const domain1Key = await testContract.getDerivedPublicKey(TEST_CONFIG.accountId, testPath, 1)

      // Keys should be different
      expect(domain0Key).not.toBe(domain1Key)
      expect(domain0Key).toMatch(/^secp256k1:/)
      expect(domain1Key).toMatch(/^ed25519:/)
    },
    TEST_CONFIG.timeout,
  )
})

describe("Error Scenarios", () => {
  test("should handle invalid paths", async () => {
    // Empty path
    await expect(testContract.sign("", TEST_VECTORS.ecdsa.hash)).rejects.toThrow()

    // Whitespace only path
    await expect(testContract.sign("   ", TEST_VECTORS.ecdsa.hash)).rejects.toThrow()
  })

  test("should handle malformed messages", async () => {
    // Non-hex string
    await expect(testContract.sign("test", "not-hex")).rejects.toThrow()

    // Mixed case with invalid chars
    await expect(testContract.sign("test", "gggggggg")).rejects.toThrow()
  })

  test("should handle unsupported signature types", async () => {
    // @ts-expect-error Testing invalid signature type
    await expect(testContract.sign("test", TEST_VECTORS.ecdsa.hash, "rsa")).rejects.toThrow()
  })

  test("should provide helpful error messages", async () => {
    try {
      await testContract.sign("", TEST_VECTORS.ecdsa.hash)
      expect.unreachable("Should have thrown")
    } catch (error) {
      expect((error as Error).message).toContain("Path is required")
    }

    try {
      await testContract.sign("test", "")
      expect.unreachable("Should have thrown")
    } catch (error) {
      expect((error as Error).message).toContain("Message is required")
    }
  })
})
