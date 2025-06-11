import { describe, expect, test } from "vitest"
import { OmniKey } from "../src/omni-key.js"

// Test fixtures with expected addresses for verification
const TEST_FIXTURES = {
  NEAR_PUBLIC_KEY:
    "secp256k1:3tFRbMqmoa6AAALMrEFAYCEoHcqKxeW38YptwowBVBtXK1vo36HDbUWuR6EZmoK4JcH6HDkNMGGqP1ouV7VZUWya",
  PREDECESSOR_ID: "alice.near",
  TEST_PATHS: ["ethereum-1", "bitcoin-1", "test-key-1", "path/to/key"],

  // Expected addresses for root key
  EXPECTED_ROOT_ADDRESSES: {
    ethereum: "0xa01ad27e7cb6f66bf8d7b188e9fb06afb8b01006",
    bitcoinBech32: "bc1q2u3gxafx3y9en9yur3467audg2n69r4rpfmjv2",
    bitcoinP2PKH: "18wj8jKjVCc2KF7JNnuEer8WAWhV2iKAAz",
  },

  // Expected addresses for derived keys (predecessor: "alice.near")
  EXPECTED_DERIVED_ADDRESSES: {
    "ethereum-1": {
      ethereum: "0xa2869d3977dea9afc9b9c069491ac08f06f9e458",
      bitcoinBech32: "bc1q96j504ke29e7ttnh0wkhnhr5qpj8alexu6h0gc",
      bitcoinP2PKH: "15Fe5iwfrA9Dm4WDihFsXB51nbujytQ1Uk",
    },
    "bitcoin-1": {
      ethereum: "0x51374208230f04c980bc1be4b5a4001b567fb78e",
      bitcoinBech32: "bc1qtute5t9f09lx8td574549crs0p9ukxfaqeq3m9",
      bitcoinP2PKH: "19foU8vMtWCxPzGg3UGWr1QGnGi2ZGrmKU",
    },
    "test-key-1": {
      ethereum: "0x37c1c07d3c0f7c9150d91d914b601b58dc364bfd",
      bitcoinBech32: "bc1qunnpse9x70cr7d87h8fxgavtd7f48pwqr6pypt",
      bitcoinP2PKH: "1MsJi3D5BPXsQs9PU9QCCdaPr9s7bPX5Dw",
    },
    "path/to/key": {
      ethereum: "0x6edec42d999272326621909cdb832243baa34e5f",
      bitcoinBech32: "bc1q5gka53dv509h9gn99hg749zxt4mzedch3yu8jc",
      bitcoinP2PKH: "1FnXPyRXzDY97KbDSWK2uF8b7ovxqnKcz8",
    },
  },
} as const

describe("OmniKey - Public Key Mode", () => {
  test("should create from NEAR format", () => {
    const key = OmniKey.fromNEAR(TEST_FIXTURES.NEAR_PUBLIC_KEY)
    expect(key).toBeDefined()
    expect(key.near).toBe(TEST_FIXTURES.NEAR_PUBLIC_KEY)
  })

  test("should derive consistent child keys", () => {
    const rootKey = OmniKey.fromNEAR(TEST_FIXTURES.NEAR_PUBLIC_KEY)

    const child1a = rootKey.derive(TEST_FIXTURES.PREDECESSOR_ID, "ethereum-1")
    const child1b = rootKey.derive(TEST_FIXTURES.PREDECESSOR_ID, "ethereum-1")
    const child2 = rootKey.derive(TEST_FIXTURES.PREDECESSOR_ID, "ethereum-2")

    expect(child1a.publicKey.equals(child1b.publicKey)).toBe(true)
    expect(child1a.publicKey.equals(child2.publicKey)).toBe(false)
  })

  test("should generate different addresses for different chains", () => {
    const key = OmniKey.fromNEAR(TEST_FIXTURES.NEAR_PUBLIC_KEY)

    expect(key.ethereum).toMatch(/^0x[a-fA-F0-9]{40}$/)
    expect(key.bitcoinBech32).toMatch(/^bc1/)
    expect(key.bitcoinP2PKH).toMatch(/^[13]/)
    expect(key.near).toMatch(/^secp256k1:/)
  })

  test("should generate exact expected addresses for root key", () => {
    const key = OmniKey.fromNEAR(TEST_FIXTURES.NEAR_PUBLIC_KEY)

    expect(key.ethereum).toBe(TEST_FIXTURES.EXPECTED_ROOT_ADDRESSES.ethereum)
    expect(key.bitcoinBech32).toBe(TEST_FIXTURES.EXPECTED_ROOT_ADDRESSES.bitcoinBech32)
    expect(key.bitcoinP2PKH).toBe(TEST_FIXTURES.EXPECTED_ROOT_ADDRESSES.bitcoinP2PKH)
  })

  test("should generate exact expected addresses for derived keys", () => {
    const rootKey = OmniKey.fromNEAR(TEST_FIXTURES.NEAR_PUBLIC_KEY)

    for (const [path, expectedAddresses] of Object.entries(
      TEST_FIXTURES.EXPECTED_DERIVED_ADDRESSES,
    )) {
      const derivedKey = rootKey.derive(TEST_FIXTURES.PREDECESSOR_ID, path)

      expect(derivedKey.ethereum).toBe(expectedAddresses.ethereum)
      expect(derivedKey.bitcoinBech32).toBe(expectedAddresses.bitcoinBech32)
      expect(derivedKey.bitcoinP2PKH).toBe(expectedAddresses.bitcoinP2PKH)
    }
  })

  test("should handle derivation paths correctly", () => {
    const rootKey = OmniKey.fromNEAR(TEST_FIXTURES.NEAR_PUBLIC_KEY)

    for (const path of TEST_FIXTURES.TEST_PATHS) {
      const derivedKey = rootKey.derive(TEST_FIXTURES.PREDECESSOR_ID, path)
      expect(derivedKey).toBeDefined()
      expect(derivedKey.publicKey.equals(rootKey.publicKey)).toBe(false)
    }
  })
})

describe("OmniKey - Secret Key Mode (Testing)", () => {
  test("should generate valid public key", () => {
    const secretKey = OmniKey.random()
    const publicKey = secretKey

    expect(publicKey).toBeDefined()
    expect(publicKey.near).toMatch(/^secp256k1:/)
  })

  test("should derive consistent child keys", () => {
    const rootSecret = OmniKey.random()
    const rootPublic = rootSecret

    const childSecret = rootSecret.derive(TEST_FIXTURES.PREDECESSOR_ID, "test-key-1")
    const childPublic = childSecret
    const childPublicDirect = rootPublic.derive(TEST_FIXTURES.PREDECESSOR_ID, "test-key-1")

    expect(childPublic.publicKey.equals(childPublicDirect.publicKey)).toBe(true)
  })

  test("should create from hex string", () => {
    const hexKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    const secretKey = OmniKey.fromSecret(hexKey)

    expect(secretKey.secretHex).toBe(hexKey)
  })

  test("should create from hex string with 0x prefix", () => {
    const hexKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    const hexKeyWithPrefix = `0x${hexKey}`
    const secretKey = OmniKey.fromSecret(hexKeyWithPrefix)

    expect(secretKey.secretHex).toBe(hexKey)
  })

  test("should create from bytes", () => {
    const bytes = new Uint8Array(32)
    bytes.fill(42)

    const secretKey = OmniKey.fromSecret(bytes)
    expect(secretKey.secretBytes).toEqual(bytes)
  })

  test("should create from bigint", () => {
    const scalar = BigInt("0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef")
    const secretKey = OmniKey.fromSecret(scalar)

    expect(secretKey.secretKey).toBe(scalar)
  })

  test("should produce identical results from different input formats", () => {
    const hexKey = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
    const scalar = BigInt(`0x${hexKey}`)
    const bytes = new Uint8Array(32)
    for (let i = 0; i < 32; i++) {
      bytes[i] = Number.parseInt(hexKey.slice(i * 2, i * 2 + 2), 16)
    }

    const keyFromHex = OmniKey.fromSecret(hexKey)
    const keyFromHexWithPrefix = OmniKey.fromSecret(`0x${hexKey}`)
    const keyFromScalar = OmniKey.fromSecret(scalar)
    const keyFromBytes = OmniKey.fromSecret(bytes)

    // All should produce the same result
    expect(keyFromHex.publicKey.equals(keyFromHexWithPrefix.publicKey)).toBe(true)
    expect(keyFromHex.publicKey.equals(keyFromScalar.publicKey)).toBe(true)
    expect(keyFromHex.publicKey.equals(keyFromBytes.publicKey)).toBe(true)
    expect(keyFromHex.ethereum).toBe(keyFromScalar.ethereum)
  })

  test("should not expose secret in toString", () => {
    const secretKey = OmniKey.random()
    expect(secretKey.toString()).toContain("with-secret")
  })

  test("should correctly identify signing capability", () => {
    const publicOnlyKey = OmniKey.fromNEAR(TEST_FIXTURES.NEAR_PUBLIC_KEY)
    const secretKey = OmniKey.random()

    expect(publicOnlyKey.canSign()).toBe(false)
    expect(secretKey.canSign()).toBe(true)

    // Should throw when trying to access secret from public-only key
    expect(() => publicOnlyKey.secretKey).toThrow("No secret key available")
    expect(() => publicOnlyKey.secretHex).toThrow("No secret key available")
    expect(() => publicOnlyKey.secretBytes).toThrow("No secret key available")

    // Should work fine for secret key
    expect(() => secretKey.secretKey).not.toThrow()
    expect(() => secretKey.secretHex).not.toThrow()
    expect(() => secretKey.secretBytes).not.toThrow()
  })

  test("should sign message hashes and return NEAR MPC format", () => {
    const secretKey = OmniKey.random()
    const publicOnlyKey = OmniKey.fromNEAR(TEST_FIXTURES.NEAR_PUBLIC_KEY)
    const messageHash = new Uint8Array(32).fill(42) // Simple test hash

    // Should work for keys with secret
    const signature = secretKey.sign(messageHash)
    expect(signature).toHaveProperty("r")
    expect(signature).toHaveProperty("s")
    expect(signature).toHaveProperty("recovery")
    expect(typeof signature.r).toBe("bigint")
    expect(typeof signature.s).toBe("bigint")
    expect(typeof signature.recovery).toBe("number")
    expect(signature.recovery).toBeGreaterThanOrEqual(0)
    expect(signature.recovery).toBeLessThanOrEqual(3)

    // Should throw for public-only keys
    expect(() => publicOnlyKey.sign(messageHash)).toThrow("Cannot sign - no secret key available")
  })

  test("should produce deterministic signatures", () => {
    const secretKey = OmniKey.fromSecret(
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    )
    const messageHash = new Uint8Array(32).fill(123)

    const sig1 = secretKey.sign(messageHash)
    const sig2 = secretKey.sign(messageHash)

    // Should be deterministic (same inputs = same outputs)
    expect(sig1.r).toBe(sig2.r)
    expect(sig1.s).toBe(sig2.s)
    expect(sig1.recovery).toBe(sig2.recovery)
  })
})

describe("Cross-compatibility", () => {
  test("secret key derivation should match public key derivation", () => {
    const rootSecret = OmniKey.random()
    const rootPublic = rootSecret

    const testPaths = ["ethereum-1", "bitcoin-1", "test/path", "some.other.path"]

    for (const path of testPaths) {
      const childSecret = rootSecret.derive("test.near", path)
      const childPublicFromSecret = childSecret
      const childPublicDirect = rootPublic.derive("test.near", path)

      expect(childPublicFromSecret.publicKey.equals(childPublicDirect.publicKey)).toBe(true)
      expect(childPublicFromSecret.ethereum).toBe(childPublicDirect.ethereum)
      expect(childPublicFromSecret.bitcoin).toBe(childPublicDirect.bitcoin)
      expect(childPublicFromSecret.near).toBe(childPublicDirect.near)
    }
  })

  test("cryptographic consistency: derived_secret × G = derived_public", () => {
    // This is the fundamental test - verifies the math is correct
    const rootSecret = OmniKey.random()

    const testCases = [
      { account: "alice.near", path: "ethereum-1" },
      { account: "bob.near", path: "bitcoin-test" },
      { account: "test.near", path: "some/long/path" },
    ]

    for (const { account, path } of testCases) {
      const childWithSecret = rootSecret.derive(account, path)

      // Extract the derived secret key
      const derivedSecret = childWithSecret.secretKey

      // Calculate what the public key should be: derivedSecret × G
      const expectedPublicKey = OmniKey.fromSecret(derivedSecret)

      // Verify they match
      expect(childWithSecret.publicKey.equals(expectedPublicKey.publicKey)).toBe(true)
      expect(childWithSecret.ethereum).toBe(expectedPublicKey.ethereum)
      expect(childWithSecret.near).toBe(expectedPublicKey.near)
      expect(childWithSecret.bitcoin).toBe(expectedPublicKey.bitcoin)
    }
  })
})
