import { describe, expect, test } from "bun:test"
import { ECDSAHashSchema, PathSchema, PayloadSchema } from "./contract-types.js"
import {
  Contract,
  DEFAULT_CONTRACT_IDS,
  validateECDSAHash,
  validateEDDSAMessage,
} from "./contract.js"

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

    expect(() => PathSchema.parse("")).toThrow() // empty
    expect(() => PathSchema.parse("invalid_path")).toThrow() // underscore not allowed
    expect(() => PathSchema.parse("path with spaces")).toThrow() // spaces not allowed
  })

  test("PayloadSchema validates both ECDSA and EDDSA", () => {
    const ecdsaPayload = {
      type: "Ecdsa" as const,
      hash: "a0b1c2d3e4f5061728394a5b6c7d8e9f0a1b2c3d4e5f6071829304a5b6c7d8e9",
    }
    expect(PayloadSchema.parse(ecdsaPayload)).toEqual(ecdsaPayload)

    const eddsaPayload = {
      type: "Eddsa" as const,
      message: "deadbeef".repeat(16), // 64 chars = 32 bytes minimum
    }
    expect(PayloadSchema.parse(eddsaPayload)).toEqual(eddsaPayload)
  })
})

describe("Contract utility functions", () => {
  test("validateECDSAHash uses Zod validation", () => {
    const validHash = "a0b1c2d3e4f5061728394a5b6c7d8e9f0a1b2c3d4e5f6071829304a5b6c7d8e9"
    expect(validateECDSAHash(validHash)).toBe(validHash)

    expect(() => validateECDSAHash("invalid")).toThrow()
    expect(() => validateECDSAHash("a0b1c2")).toThrow()
  })

  test("validateEDDSAMessage validates message length", () => {
    const validMessage = "deadbeef".repeat(16) // 64 chars = 32 bytes
    expect(validateEDDSAMessage(validMessage)).toBe(validMessage)

    expect(() => validateEDDSAMessage("short")).toThrow()
    expect(() => validateEDDSAMessage("xyz")).toThrow() // invalid hex
  })
})

describe("Contract static methods", () => {
  test("createECDSARequest creates and validates correct format", () => {
    const hash = "a0b1c2d3e4f5061728394a5b6c7d8e9f0a1b2c3d4e5f6071829304a5b6c7d8e9"
    const request = Contract.createECDSARequest("ethereum-1", hash, 0)

    expect(request).toEqual({
      request: {
        domain_id: 0,
        path: "ethereum-1",
        payload_v2: { type: "Ecdsa", hash },
      },
    })
  })

  test("createECDSARequest validates input", () => {
    expect(() => Contract.createECDSARequest("ethereum-1", "invalid", 0)).toThrow()
    expect(() => Contract.createECDSARequest("invalid_path", "a".repeat(64), 0)).toThrow()
  })

  test("createEDDSARequest creates and validates correct format", () => {
    const message = "deadbeef".repeat(16) // 64 chars = 32 bytes minimum
    const request = Contract.createEDDSARequest("solana-1", message, 1)

    expect(request).toEqual({
      request: {
        domain_id: 1,
        path: "solana-1",
        payload_v2: { type: "Eddsa", message },
      },
    })
  })

  test("createEDDSARequest validates input", () => {
    expect(() => Contract.createEDDSARequest("solana-1", "short", 1)).toThrow()
    expect(() => Contract.createEDDSARequest("invalid_path", "a".repeat(64), 1)).toThrow()
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
