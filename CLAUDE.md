# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Context

This is the **omni-transactions-sdk** - a TypeScript SDK for NEAR Chain Signatures (MPC network). NEAR's MPC smart contract allows developers to request signatures for transactions on multiple blockchains (Ethereum, Bitcoin, etc.) using hierarchical key derivation from a NEAR account.

**Core Flow**: Developer constructs unsigned transaction → SDK submits hash to NEAR MPC → SDK handles signature request/response → Returns signed transaction compatible with popular libraries (viem, etc.)

## Workflow Requirements

**IMPORTANT**: Always commit changes automatically after completing tasks. Use semantic commit format:
- `feat: add new feature`
- `fix: resolve bug`
- `refactor: improve code structure`
- `docs: update documentation`
- `test: add or update tests`

Batch related changes into single commits rather than committing every individual file change.

## Common Commands

- `bun install` - Install dependencies
- `bun run src/index.ts` - Run the main application
- `bun build` - Build the project using TypeScript compiler
- `bun test` - Run tests using Vitest
- `bun run lint` - Run Biome linter and formatter checks
- `bun run typecheck` - Type check without emitting files
- `bun run check-exports` - Verify package exports using Are The Types Wrong

## Project Architecture

### Current Components

- **OmniKey** (`src/omni-key.ts`): Unified secp256k1 key class for NEAR Chain Signatures. Can operate in two modes:
  - *Production mode*: Public key only, can derive addresses and child keys 
  - *Testing mode*: Includes secret key, can mock MPC signing behavior
  - Uses NEAR MPC recovery scheme: `child_pubkey = tweak * G + parent_pubkey` and `child_secret = (epsilon + parent_secret) mod n`

### Planned Architecture (see ROADMAP.md)

- **Chain-specific modules**: Ethereum (viem integration), Bitcoin, future Solana support
- **MPC Integration**: NEAR smart contract interface, signature request/response handling
- **Test utilities**: MPCSecretKey for local testing with same derivation scheme
- **Library adapters**: Work with existing transaction libraries rather than replacing them

### Integration Strategy

- **Viem**: Manual transaction construction + signature attachment (not custom signer)
- **NEAR**: near-api-js integration, user-provided wallet connection
- **Monolithic package**: Single SDK with modular chain support

### Dependencies

- `@noble/curves` and `@noble/hashes` for cryptographic operations
- `@scure/base` for base58 encoding/decoding  
- `@scure/btc-signer` for Bitcoin address generation
- `micro-eth-signer` for Ethereum operations
- `zod` for schema validation
- Future: `viem` for Ethereum integration, `near-api-js` for NEAR MPC calls

### Development Tools

- Bun as runtime and package manager
- Biome for linting/formatting (double quotes, semicolons as needed, 100 char line width)  
- TypeScript with strict settings and NodeNext module resolution
- Vitest for testing
- Changesets for release management

## Development Best Practices

- Remember to use the GitHub CLI (`gh`) for all GitHub-related tasks.