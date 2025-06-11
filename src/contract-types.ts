/**
 * TypeScript types and Zod schemas for NEAR Chain Signatures (MPC) contract
 *
 * Based on signature.rs from the NEAR MPC contract
 */

import { z } from "zod"

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
 * Payload for signature request
 */
export const PayloadSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("Ecdsa"), hash: ECDSAHashSchema }),
  z.object({ type: z.literal("Eddsa"), message: EDDSAMessageSchema }),
])
export type Payload = z.infer<typeof PayloadSchema>

/**
 * Derivation path (alphanumeric with hyphens)
 */
export const PathSchema = z
  .string()
  .min(1)
  .regex(/^[a-zA-Z0-9-]+$/)
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
 * MPC signature response format (actual format returned by NEAR MPC)
 */
export const MPCSignatureResponseSchema = z.object({
  scheme: z.literal("Secp256k1"),
  big_r: z.object({
    affine_point: hexString, // Compressed point format
  }),
  s: z.object({
    scalar: hexString,
  }),
  recovery_id: z.number().int().min(0).max(3),
})
export type MPCSignatureResponse = z.infer<typeof MPCSignatureResponseSchema>

/**
 * Standard ECDSA signature components (converted from MPC format)
 */
export const ECDSASignatureSchema = z.object({
  r: hexStringBytes(32),
  s: hexStringBytes(32),
  recovery_id: z.number().int().min(0).max(3),
})
export type ECDSASignature = z.infer<typeof ECDSASignatureSchema>

/**
 * Signature result from MPC contract
 */
export const SignatureResultSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("Ok"), signature: ECDSASignatureSchema }),
  z.object({ type: z.literal("Err"), error: z.string() }),
])
export type SignatureResult = z.infer<typeof SignatureResultSchema>

/**
 * Configuration for MPC contract connection
 */
export const ContractConfigSchema = z.object({
  networkId: z.enum(["mainnet", "testnet"]),
  contractId: z.string().optional(),
  provider: z.any().optional(), // JsonRpcProvider - using any to avoid circular imports
})
export type ContractConfig = z.infer<typeof ContractConfigSchema>
