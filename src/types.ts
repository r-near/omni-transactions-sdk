/**
 * TypeScript types and Zod schemas for NEAR Chain Signatures (MPC) contract
 *
 * Based on signature.rs from the NEAR MPC contract and real API responses
 */

import type { Provider } from "@near-js/providers"
import { z } from "zod/v4"

// Enums for type safety

/**
 * Supported signature types for MPC contract
 */
export enum SignatureType {
  ECDSA = "ecdsa",
  EDDSA = "eddsa",
}

// Zod schemas for validation and type safety

/**
 * Hex string validation (even number of characters, valid hex)
 */
const hexString = z
  .string()
  .regex(/^[0-9a-fA-F]+$/)
  .refine((val) => val.length % 2 === 0, {
    message: "Hex string must have even number of characters",
  })

/**
 * Fixed-length hex string (for specific byte lengths)
 */
const hexStringBytes = (bytes: number) =>
  hexString.refine((val) => val.length === bytes * 2, {
    message: `Hex string must be exactly ${bytes} bytes (${bytes * 2} characters)`,
  })

/**
 * ECDSA hash (32 bytes)
 */
export const ECDSAHashSchema = hexStringBytes(32)
export type ECDSAHash = z.infer<typeof ECDSAHashSchema>

/**
 * EDDSA message (32-1232 bytes)
 */
export const EDDSAMessageSchema = hexString.refine(
  (val) => val.length >= 64 && val.length <= 2464, // 32-1232 bytes
  { message: "EDDSA message must be between 32 and 1232 bytes" },
)
export type EDDSAMessage = z.infer<typeof EDDSAMessageSchema>

/**
 * Payload for signature request (matches MPC contract format exactly)
 */
export const PayloadSchema = z.union([
  z.object({ Ecdsa: ECDSAHashSchema }),
  z.object({ Eddsa: EDDSAMessageSchema }),
])
export type Payload = z.infer<typeof PayloadSchema>

/**
 * Derivation path (any non-empty string that isn't just whitespace)
 */
export const PathSchema = z
  .string()
  .min(1, "Path is required and cannot be empty")
  .refine((val) => val.trim().length > 0, { message: "Path is required and cannot be empty" })
export type Path = z.infer<typeof PathSchema>

/**
 * Domain ID for key versioning
 */
export const DomainIdSchema = z.number().int().min(0)
export type DomainId = z.infer<typeof DomainIdSchema>

/**
 * Arguments for signature request (wrapped in request object for MPC contract)
 */
export const SignRequestArgsSchema = z.object({
  request: z.object({
    domain_id: DomainIdSchema.default(0),
    path: PathSchema,
    payload_v2: PayloadSchema,
  }),
})
export type SignRequestArgs = z.infer<typeof SignRequestArgsSchema>

/**
 * ECDSA signature response format (Secp256k1)
 */
export const MPCECDSASignatureResponseSchema = z.object({
  scheme: z.literal("Secp256k1"),
  big_r: z.object({
    affine_point: hexString, // Compressed point format
  }),
  s: z.object({
    scalar: hexString,
  }),
  recovery_id: z.number().int().min(0).max(3),
})
export type MPCECDSASignatureResponse = z.infer<typeof MPCECDSASignatureResponseSchema>

/**
 * EDDSA signature response format (Ed25519)
 * Actual format returned by NEAR MPC contract for Ed25519 signatures
 */
export const MPCEDDSASignatureResponseSchema = z.object({
  scheme: z.literal("Ed25519"),
  signature: z.array(z.number().int().min(0).max(255)).length(64), // 64-byte signature array
})
export type MPCEDDSASignatureResponse = z.infer<typeof MPCEDDSASignatureResponseSchema>

/**
 * MPC signature response format (union of ECDSA and EDDSA)
 */
export const MPCSignatureResponseSchema = z.discriminatedUnion("scheme", [
  MPCECDSASignatureResponseSchema,
  MPCEDDSASignatureResponseSchema,
])
export type MPCSignatureResponse = z.infer<typeof MPCSignatureResponseSchema>

/**
 * Configuration for MPC contract connection
 */
const ProviderSchema = z.custom<Provider>(
  // optional runtime check – keep it lightweight
  (val) => {
    return (
      typeof val === "object" &&
      val !== null &&
      typeof (val as Provider).sendTransaction === "function"
    )
  },
  "Provider is required in config for view calls",
)

export const ContractConfigSchema = z.object({
  networkId: z.enum(["mainnet", "testnet"]),
  contractId: z.string().optional(),
  provider: ProviderSchema,
})
export type ContractConfig = z.infer<typeof ContractConfigSchema>

/**
 * Schema for the new object-based sign request API
 */
export const SignRequestSchema = z.object({
  path: PathSchema,
  message: z.string().min(1, "Message is required and cannot be empty"),
  signatureType: z.enum(SignatureType).default(SignatureType.ECDSA),
  domainId: DomainIdSchema.optional(),
})
export type SignRequest = z.infer<typeof SignRequestSchema>
