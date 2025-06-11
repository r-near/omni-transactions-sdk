export { OmniKey } from "./omni-key.js"
export {
  Contract,
  createContract,
  DEFAULT_CONTRACT_IDS,
  validateECDSAHash,
  validateEDDSAMessage,
} from "./contract.js"

// Export Zod schemas and types for MPC contract
export {
  ECDSAHashSchema,
  EDDSAMessageSchema,
  PayloadSchema,
  PathSchema,
  DomainIdSchema,
  SignRequestArgsSchema,
  ECDSASignatureSchema,
  MPCSignatureResponseSchema,
  SignatureResultSchema,
  ContractConfigSchema,
} from "./contract-types.js"

export type * from "./types.js"
export type * from "./contract.js"
export type * from "./contract-types.js"
