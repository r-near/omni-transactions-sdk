import { describe, expect, test } from "bun:test"
import { OmniKey } from "../../src/omni-key.js"

// FastNEAR view-only RPC API endpoints (using mainnet MPC for testing)
const FASTNEAR_BASE_URL = "https://rpc.web4.near.page/account/v1.signer/view"

// Test cases for MPC integration
const TEST_CASES = {
  PREDECESSOR_ID: "test.near",
  PATHS: ["ethereum-1", "bitcoin-1", "test-key"],
} as const

async function fetchMpcPublicKey(): Promise<string> {
  const response = await fetch(`${FASTNEAR_BASE_URL}/public_key`)
  if (!response.ok) {
    throw new Error(`Failed to fetch public key: ${response.statusText}`)
  }
  return response.json() as Promise<string>
}

async function fetchMpcDerivedKey(path: string, predecessor: string): Promise<string> {
  const url = `${FASTNEAR_BASE_URL}/derived_public_key?path=${encodeURIComponent(path)}&predecessor=${encodeURIComponent(predecessor)}`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch derived key: ${response.statusText}`)
  }
  return (await response.json()) as string
}

describe("NEAR MPC Integration Tests", () => {
  test("should get root public key from MPC contract", async () => {
    const mpcRootKey = await fetchMpcPublicKey()

    expect(mpcRootKey).toBeDefined()
    expect(typeof mpcRootKey).toBe("string")
    expect(mpcRootKey).toMatch(/^secp256k1:/)

    // Should be able to create OmniKey from MPC root key
    const omniKey = OmniKey.fromNEAR(mpcRootKey)
    expect(omniKey).toBeDefined()
    expect(omniKey.near).toBe(mpcRootKey)
  })

  test("should get derived public keys from MPC contract", async () => {
    for (const path of TEST_CASES.PATHS) {
      const mpcDerivedKey = await fetchMpcDerivedKey(path, TEST_CASES.PREDECESSOR_ID)

      expect(mpcDerivedKey).toBeDefined()
      expect(typeof mpcDerivedKey).toBe("string")
      expect(mpcDerivedKey).toMatch(/^secp256k1:/)

      // Should be able to create OmniKey from derived key
      const omniKey = OmniKey.fromNEAR(mpcDerivedKey)
      expect(omniKey).toBeDefined()
      expect(omniKey.near).toBe(mpcDerivedKey)
    }
  })

  test("should match local derivation with MPC contract derivation", async () => {
    // Get root key from MPC
    const mpcRootKey = await fetchMpcPublicKey()

    // Create local OmniKey from MPC root
    const localRootKey = OmniKey.fromNEAR(mpcRootKey)

    // Test each derivation path
    for (const path of TEST_CASES.PATHS) {
      // Get derived key from MPC contract
      const mpcDerivedKey = await fetchMpcDerivedKey(path, TEST_CASES.PREDECESSOR_ID)

      // Derive key locally using our implementation
      const localDerivedKey = localRootKey.derive(TEST_CASES.PREDECESSOR_ID, path)

      // They should match exactly
      expect(localDerivedKey.near).toBe(mpcDerivedKey)

      // Also verify other address formats match
      const mpcDerivedOmniKey = OmniKey.fromNEAR(mpcDerivedKey)
      expect(localDerivedKey.ethereum).toBe(mpcDerivedOmniKey.ethereum)
      expect(localDerivedKey.bitcoinBech32).toBe(mpcDerivedOmniKey.bitcoinBech32)
      expect(localDerivedKey.bitcoinP2PKH).toBe(mpcDerivedOmniKey.bitcoinP2PKH)
    }
  })

  test("should handle different predecessor IDs consistently", async () => {
    const mpcRootKey = await fetchMpcPublicKey()
    const localRootKey = OmniKey.fromNEAR(mpcRootKey)
    const testPredecessors = ["alice.near", "bob.near", "test.testnet"]
    const testPath = "ethereum-1"

    for (const predecessor of testPredecessors) {
      const mpcDerivedKey = await fetchMpcDerivedKey(testPath, predecessor)
      const localDerivedKey = localRootKey.derive(predecessor, testPath)

      expect(localDerivedKey.near).toBe(mpcDerivedKey)
    }
  })
})
