import { describe, expect, test } from "bun:test"
import { ECDSAHashSchema, EDDSAMessageSchema, PathSchema, PayloadSchema } from "./contract-types.js"
import { DEFAULT_CONTRACT_IDS } from "./contract.js"

describe("Zod schema validation", () => {
  test("ECDSAHashSchema validates 32-byte hex strings", () => {
    const validHash = "a0b1c2d3e4f5061728394a5b6c7d8e9f0a1b2c3d4e5f6071829304a5b6c7d8e9"
    expect(ECDSAHashSchema.parse(validHash)).toBe(validHash)

    // Test invalid cases
    expect(() => ECDSAHashSchema.parse("invalid")).toThrow()
    expect(() => ECDSAHashSchema.parse("a0b1c2")).toThrow()
    expect(() => ECDSAHashSchema.parse(`gg${"a".repeat(62)}`)).toThrow() // invalid hex chars
  })

  test("PathSchema validates derivation paths", () => {
    expect(PathSchema.parse("ethereum-1")).toBe("ethereum-1")
    expect(PathSchema.parse("bitcoin-test")).toBe("bitcoin-test")
    expect(PathSchema.parse("solana123")).toBe("solana123")
    expect(PathSchema.parse("invalid_path")).toBe("invalid_path") // underscore allowed
    expect(PathSchema.parse("path with spaces")).toBe("path with spaces") // spaces allowed

    expect(() => PathSchema.parse("")).toThrow() // empty
  })

  test("PayloadSchema validates both ECDSA and EDDSA", () => {
    const ecdsaPayload = {
      Ecdsa: "a0b1c2d3e4f5061728394a5b6c7d8e9f0a1b2c3d4e5f6071829304a5b6c7d8e9",
    }
    expect(PayloadSchema.parse(ecdsaPayload)).toEqual(ecdsaPayload)

    const eddsaPayload = {
      Eddsa: "deadbeef".repeat(16), // 64 chars = 32 bytes minimum
    }
    expect(PayloadSchema.parse(eddsaPayload)).toEqual(eddsaPayload)
  })
})

describe("Contract input validation", () => {
  // Note: We can't easily test the actual sign() method without a real account and provider
  // These tests focus on the validation logic that would be called

  test("ECDSAHashSchema validates 32-byte hex hashes", () => {
    const validHash = "a0b1c2d3e4f5061728394a5b6c7d8e9f0a1b2c3d4e5f6071829304a5b6c7d8e9"
    expect(ECDSAHashSchema.parse(validHash)).toBe(validHash)
    expect(() => ECDSAHashSchema.parse("invalid")).toThrow()
    expect(() => ECDSAHashSchema.parse("a0b1c2")).toThrow() // too short
  })

  test("EDDSAMessageSchema validates hex messages", () => {
    const validMessage = "deadbeef".repeat(16) // 64 chars = 32 bytes minimum
    expect(EDDSAMessageSchema.parse(validMessage)).toBe(validMessage)
    expect(() => EDDSAMessageSchema.parse("short")).toThrow() // too short
    expect(() => EDDSAMessageSchema.parse("invalid_hex")).toThrow() // invalid hex
  })
})

describe("Contract constants", () => {
  test("DEFAULT_CONTRACT_IDS has correct values", () => {
    expect(DEFAULT_CONTRACT_IDS.mainnet).toBe("v1.signer")
    expect(DEFAULT_CONTRACT_IDS.testnet).toBe("v1.signer-prod.testnet")
  })
})

// Note: Integration tests with actual Contract instances will require
// setting up NEAR accounts and providers, which we'll do separately
// in the experiments directory
