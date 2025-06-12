# MPC Integration Test Plan

## Overview

Convert the current exploration script into comprehensive integration tests that validate the complete NEAR Chain Signatures (MPC) workflow for both ECDSA and EDDSA signature schemes.

## Test Structure

### File Organization Strategy
**Current:**
```
tests/
├── mpc-integration.test.ts (basic view tests)
└── omni-key.test.ts (OmniKey unit tests)
```

**Proposed:**
```
tests/
├── omni-key.test.ts (unit tests - keep as-is)
└── integration/
    ├── contract-view-methods.test.ts (renamed from mpc-integration.test.ts)
    └── contract-signatures.test.ts (new - comprehensive signing tests)
```

**Rationale:**
- **Clear separation**: Unit tests vs integration tests in different directories
- **Independent execution**: Can run `bun test tests/` (unit only) or `bun test tests/integration/` (integration only)
- **Better naming**: No need for `.integration.` suffix since directory makes it clear
- **Scalable**: Easy to add more integration tests as needed
- **CI-friendly**: Can run fast unit tests first, then slower integration tests

## Test Requirements

### Environment Setup
- **Test Account**: Use existing `omni-sdk-test.testnet` or create dedicated test account
- **Provider**: JsonRpcProvider for testnet
- **Network**: NEAR testnet only (no mainnet tests)
- **Timeout**: Longer timeout for network operations (30s+)

### Test Categories

#### 1. Contract View Methods (`describe("MPC Contract View Methods")`)
- ✅ `getPublicKey()` - root public key retrieval
- ✅ `getDerivedPublicKey()` - with different domain_ids
- ✅ `getLatestKeyVersion()` - domain versioning
- 🆕 Domain availability testing (0 and 1)

#### 2. ECDSA Signature Tests (`describe("ECDSA (secp256k1) Signatures")`)

**Basic Signing:**
- `test("should sign ECDSA hash with default parameters")`
  - Call: `contract.sign(path, hash32)` (defaults to ECDSA, domain 0)
  - Verify: Returns secp256k1.Signature instance
  - Assert: Signature has r, s, recovery properties

**Explicit Parameters:**
- `test("should sign ECDSA hash with explicit parameters")`
  - Call: `contract.sign(path, hash32, "ecdsa", 0)`
  - Verify: Same behavior as default

**Signature Verification:**
- `test("should produce cryptographically valid ECDSA signatures")`
  - Sign test hash with known path
  - Recover public key from signature
  - Compare with derived public key from contract
  - Verify signature using @noble/curves

**Input Validation:**
- `test("should validate ECDSA hash format")`
  - Invalid hex string → error
  - Wrong length (not 32 bytes) → error
  - Empty/null values → error

#### 3. EDDSA Signature Tests (`describe("EDDSA (Ed25519) Signatures")`)

**Basic Signing:**
- `test("should sign EDDSA message with explicit type")`
  - Call: `contract.sign(path, message64, "eddsa")`
  - Verify: Returns Uint8Array of 64 bytes
  - Assert: Signature is valid byte array

**Domain Routing:**
- `test("should auto-route EDDSA to domain 1")`
  - Call: `contract.sign(path, message, "eddsa")` (no domain specified)
  - Verify: Uses domain_id 1 automatically

**Signature Verification:**
- `test("should produce cryptographically valid EDDSA signatures")`
  - Sign test message with known path
  - Get derived Ed25519 public key for domain 1
  - Verify signature using @noble/curves ed25519.verify

**Input Validation:**
- `test("should validate EDDSA message format")`
  - Invalid hex string → error
  - Too short (< 32 bytes) → error
  - Too long (> 1232 bytes) → error

#### 4. Cross-Scheme Tests (`describe("Multi-Signature Support")`)

**Same Path, Different Schemes:**
- `test("should handle same path with different signature types")`
  - Sign same path with ECDSA and EDDSA
  - Verify both succeed with different results
  - Ensure no interference between schemes

**Domain Isolation:**
- `test("should properly isolate domains")`
  - Verify domain 0 and domain 1 have different root public keys
  - Ensure derived keys differ between domains for same path

#### 5. Error Handling (`describe("Error Scenarios")`)

**Invalid Inputs:**
- `test("should handle invalid paths")`
- `test("should handle malformed messages")`
- `test("should handle unsupported signature types")`

**Network Errors:**
- `test("should handle MPC contract errors gracefully")`
- `test("should provide helpful error messages")`

## Test Data & Fixtures

### Inline Test Fixtures (within test files)
```typescript
// At top of tests/integration/contract-signatures.test.ts
const TEST_VECTORS = {
  ecdsa: {
    hash: "a0b1c2d3e4f5061728394a5b6c7d8e9f0a1b2c3d4e5f6071829304a5b6c7d8e9",
    path: "ethereum-test",
    expectedDomain: 0
  },
  eddsa: {
    message: "deadbeef".repeat(16), // 64 chars = 32 bytes
    path: "solana-test", 
    expectedDomain: 1
  },
  paths: [
    "ethereum-1",
    "bitcoin-main", 
    "solana-devnet",
    "cosmos-hub",
    "special/path/with/slashes"
  ]
}

const TEST_CONFIG = {
  accountId: "omni-sdk-test.testnet",
  networkId: "testnet",
  contractId: "v1.signer-prod.testnet",
  rpcUrl: "https://rpc.testnet.near.org",
  credentialsPath: path.join(os.homedir(), ".near-credentials")
}
```

**Benefits:**
- No separate fixture files to maintain
- Test data is co-located with tests that use it
- Easier to understand test context
- Simpler file structure

## Test Utilities

### Helper Functions
- `createTestContract()` - Set up Contract instance with test config
- `validateSignatureFormat()` - Common signature validation
- `expectValidECDSASignature()` - ECDSA-specific assertions  
- `expectValidEDDSASignature()` - EDDSA-specific assertions

### Assertions
- `toBeValidSecp256k1Signature()` - Custom matcher for ECDSA
- `toBeValidEd25519Signature()` - Custom matcher for EDDSA
- `toMatchDerivedPublicKey()` - Verify signature against derived key

## Performance & Reliability

### Test Timeouts
- View method tests: 10s
- Signature tests: 30s (network + MPC processing)
- Integration suite: 5 minutes total

### Retry Logic
- Network failures: 3 retries with exponential backoff
- Rate limiting: Respect NEAR RPC limits
- Gas exhaustion: Handle gracefully

### Test Isolation
- Each test uses unique derivation paths
- No shared state between tests
- Clean setup/teardown

## Success Criteria

### Functional Requirements
- ✅ Both ECDSA and EDDSA signatures work end-to-end
- ✅ All signatures are cryptographically valid
- ✅ Public key recovery matches derived keys
- ✅ Error handling is robust and informative
- ✅ API defaults work correctly (ECDSA default, auto-domain routing)

### Quality Requirements  
- ✅ Test coverage > 90% for Contract class
- ✅ All tests pass consistently (no flaky tests)
- ✅ Clear test documentation and error messages
- ✅ Fast feedback (< 5 minute test suite)

## Implementation Notes

### Current State
- Exploration script proves both ECDSA and EDDSA work
- Contract class has simplified API: `sign(path, message, type?, domain?)`
- Provider-based view calls eliminate deprecation warnings
- Zod validation ensures type safety

### Migration Strategy
1. **Create integration directory**: `mkdir tests/integration/`
2. **Move and rename existing test**: `mpc-integration.test.ts` → `tests/integration/contract-view-methods.test.ts`
3. **Extract reusable utilities** from exploration script into helper functions
4. **Create new signature test file**: `tests/integration/contract-signatures.test.ts` with both ECDSA and EDDSA tests
5. **Add inline fixtures** and test vectors within the test files
6. **Convert exploration flow** into structured test cases with proper assertions
7. **Add comprehensive error testing** and edge cases
8. **Implement custom matchers** for signature validation
9. **Update package.json scripts** for selective test execution

### Package.json Script Updates
```json
{
  "scripts": {
    "test": "bun test tests/",                    // Unit tests only (fast)
    "test:integration": "bun test tests/integration/",  // Integration tests only  
    "test:all": "bun test",                      // All tests (unit + integration)
    "test:watch": "bun test --watch tests/",     // Watch unit tests
    "test:ci": "bun test --coverage"             // CI with coverage
  }
}
```

### Dependencies
- `bun:test` as test runner
- Existing NEAR.js packages for testnet interaction
- `@noble/curves` for cryptographic verification
- Existing test account with sufficient balance