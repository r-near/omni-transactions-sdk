export { MPCKey, MockMPCKey } from "./omni-key.js"
export {
  Contract,
  DEFAULT_CONTRACT_IDS,
  type MPCSignature,
} from "./contract.js"

// Export Zod schemas and types for MPC contract
export {
  ECDSAHashSchema,
  EDDSAMessageSchema,
  PayloadSchema,
  PathSchema,
  DomainIdSchema,
  SignRequestArgsSchema,
  MPCSignatureResponseSchema,
  ContractConfigSchema,
} from "./types.js"

export type * from "./types.js"
export type * from "./contract.js"
