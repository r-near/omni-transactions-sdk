import { beforeAll, describe, expect, test } from "bun:test"
import type { Account } from "@near-js/accounts"
import { JsonRpcProvider } from "@near-js/providers"
import { Contract } from "../../src/contract.js"
import { MPCKey } from "../../src/mpc-key.js"

// Test configuration for view-only operations (no account needed)
const TEST_CONFIG = {
  networkId: "mainnet" as const,
  contractId: "v1.signer", // mainnet MPC contract
} as const

// Test cases for MPC integration
const TEST_CASES = {
  PREDECESSOR_ID: "test.near",
  PATHS: ["ethereum-1", "bitcoin-1", "test-key"],
} as const

let contract: Contract

beforeAll(() => {
  // Create a provider for view calls only
  const provider = new JsonRpcProvider({ url: "https://rpc.mainnet.near.org" })

  // Create contract instance with mock account (only provider is needed for view calls)
  const mockAccount = {} as Account // We only need provider for view calls
  contract = new Contract(mockAccount, {
    ...TEST_CONFIG,
    provider,
  })
})

describe("Contract View Methods", () => {
  test("should get root public key from MPC contract", async () => {
    const mpcRootKey = await contract.getPublicKey()

    expect(mpcRootKey).toBeDefined()
    expect(typeof mpcRootKey).toBe("string")
    expect(mpcRootKey).toMatch(/^secp256k1:/)

    // Should be able to create MPCKey from MPC root key
    const mpcKey = MPCKey.fromNEAR(mpcRootKey)
    expect(mpcKey).toBeDefined()
    expect(mpcKey.near).toBe(mpcRootKey)
  })

  test("should get derived public keys from MPC contract", async () => {
    for (const path of TEST_CASES.PATHS) {
      const mpcDerivedKey = await contract.getDerivedPublicKey(TEST_CASES.PREDECESSOR_ID, path)

      expect(mpcDerivedKey).toBeDefined()
      expect(typeof mpcDerivedKey).toBe("string")
      expect(mpcDerivedKey).toMatch(/^secp256k1:/)

      // Should be able to create MPCKey from derived key
      const mpcKey = MPCKey.fromNEAR(mpcDerivedKey)
      expect(mpcKey).toBeDefined()
      expect(mpcKey.near).toBe(mpcDerivedKey)
    }
  })

  test("should match local derivation with MPC contract derivation", async () => {
    // Get root key from MPC using Contract class
    const mpcRootKey = await contract.getPublicKey()

    // Create local MPCKey from MPC root
    const localRootKey = MPCKey.fromNEAR(mpcRootKey)

    // Test each derivation path
    for (const path of TEST_CASES.PATHS) {
      // Get derived key from MPC contract using Contract class
      const mpcDerivedKey = await contract.getDerivedPublicKey(TEST_CASES.PREDECESSOR_ID, path)

      // Derive key locally using our implementation
      const localDerivedKey = localRootKey.derive(TEST_CASES.PREDECESSOR_ID, path)

      // They should match exactly
      expect(localDerivedKey.near).toBe(mpcDerivedKey)

      // Also verify other address formats match
      const mpcDerivedMPCKey = MPCKey.fromNEAR(mpcDerivedKey)
      expect(localDerivedKey.ethereum).toBe(mpcDerivedMPCKey.ethereum)
      expect(localDerivedKey.bitcoinBech32).toBe(mpcDerivedMPCKey.bitcoinBech32)
      expect(localDerivedKey.bitcoinP2PKH).toBe(mpcDerivedMPCKey.bitcoinP2PKH)
    }
  })

  test("should handle different predecessor IDs consistently", async () => {
    const mpcRootKey = await contract.getPublicKey()
    const localRootKey = MPCKey.fromNEAR(mpcRootKey)
    const testPredecessors = ["alice.near", "bob.near", "test.testnet"]
    const testPath = "ethereum-1"

    for (const predecessor of testPredecessors) {
      const mpcDerivedKey = await contract.getDerivedPublicKey(predecessor, testPath)
      const localDerivedKey = localRootKey.derive(predecessor, testPath)

      expect(localDerivedKey.near).toBe(mpcDerivedKey)
    }
  })

  test("should get latest key version", async () => {
    const latestVersion = await contract.getLatestKeyVersion()

    expect(typeof latestVersion).toBe("number")
    expect(latestVersion).toBeGreaterThanOrEqual(0)
  })
})
