# SDK Improvement Tasks

This document tracks improvements needed for the omni-transactions-sdk based on README review and API design considerations.

## High-Level Tasks

### 1. Improve README Basic Usage Example
**Priority: High**  
**Description**: Refactor the Basic Usage section to show the proper workflow - derive keys from MPC root key using caller's NEAR account ID and path, then show address generation and signing.

**Sub-tasks:**
- [ ] Update example to use hardcoded MPC root key as starting point
- [ ] Show derivation using caller's NEAR account ID as predecessor
- [ ] Demonstrate common path patterns (`ethereum,1`, `bitcoin,1`, `path/with/slashes`)
- [ ] Remove direct address generation from root key (not typical usage)
- [ ] Simplify NEAR account setup using InMemorySigner instead of filesystem keystore
- [ ] Show complete workflow: derive → generate addresses → sign transaction

### 2. Refactor Contract.sign() Method API
**Priority: High**  
**Description**: Improve the `sign()` method to use a typesafe object parameter instead of positional arguments.

**Sub-tasks:**
- [x] Design new object-based API for `sign()` method
- [x] Create TypeScript interface for sign parameters
- [ ] Update Contract.sign() implementation to use new API
- [ ] Update all existing usages of `sign()` method
- [ ] Update tests to use new API
- [ ] Update documentation and examples

### 3. Create SignatureType Enum
**Priority: Medium**  
**Description**: Replace string literals for signature types with a proper TypeScript enum.

**Sub-tasks:**
- [x] Create `SignatureType` enum with `ECDSA` and `EDDSA` values
- [ ] Update `Contract.sign()` to use enum instead of string literals
- [x] Update type definitions in `types.ts`
- [ ] Update all tests to use enum values
- [ ] Update documentation examples

### 4. Enhance Input Validation with Zod
**Priority: Medium**  
**Description**: Move all validation logic from runtime checks to Zod schemas for better type safety and error messages.

**Sub-tasks:**
- [x] Create Zod schema for `Contract.sign()` parameters
- [ ] Replace manual validation in `Contract.sign()` with Zod validation
- [ ] Create comprehensive error messages for validation failures
- [ ] Add runtime type checking for all public API methods
- [ ] Update existing Zod schemas in `types.ts` if needed

### 5. Documentation Improvements
**Priority: Low**  
**Description**: General documentation improvements based on new API patterns.

**Sub-tasks:**
- [x] Update API reference section for new `sign()` method
- [x] Add examples showing common path patterns
- [ ] Update TypeScript examples to use enums
- [ ] Add troubleshooting section for common validation errors
- [ ] Update integration examples in other sections

## Implementation Notes

### Proposed API Changes

#### Current API:
```typescript
contract.sign(path: string, message: string, signatureType?: "ecdsa" | "eddsa", domainId?: number)
```

#### Proposed API:
```typescript
import { SignatureType } from 'omni-transactions-sdk'

contract.sign({
  path: string,
  message: string,
  signatureType?: SignatureType,
  domainId?: number
})
```

#### Proposed Enum:
```typescript
export enum SignatureType {
  ECDSA = "ecdsa",
  EDDSA = "eddsa"
}
```

### Path Pattern Examples
- `ethereum,1` - Common Ethereum derivation
- `bitcoin,1` - Common Bitcoin derivation  
- `trading/ethereum` - Application-specific with slashes
- `savings/bitcoin/main` - Nested path structure
- `defi/protocol/v1` - DeFi application specific

### Improved Basic Usage Flow
1. Start with hardcoded MPC root public key
2. Derive key using caller's NEAR account ID + user path
3. Generate addresses for target blockchains
4. Set up NEAR account with InMemorySigner
5. Sign transaction using derived path

### 6. Validate Basic Usage Example
**Priority: Medium**  
**Description**: Create a TypeScript experiment file to validate that the Basic Usage example in README actually works and compiles correctly.

**Sub-tasks:**
- [ ] Create `experiments/basic-usage-validation.ts` file
- [ ] Copy the Basic Usage example from README into the experiment
- [ ] Ensure all imports are correct and types resolve
- [ ] Add comments explaining what each step does
- [ ] Verify the example compiles without errors
- [ ] Consider adding simple assertions or console logs for clarity

### 7. Improve Mathematical Notation in README
**Priority: Low**  
**Description**: Convert mathematical formulas in the README to use proper LaTeX formatting for better readability.

**Sub-tasks:**
- [ ] Convert derivation tweak formula to LaTeX
- [ ] Convert child secret key formula to LaTeX  
- [ ] Convert child public key formula to LaTeX
- [ ] Convert cryptographic consistency proof to LaTeX
- [ ] Add LaTeX rendering support instructions if needed
- [ ] Ensure formulas are properly formatted in GitHub markdown

## Progress Tracking

- [x] Task 1: README Basic Usage Example
- [x] Task 2: Contract.sign() API Refactor  
- [x] Task 3: SignatureType Enum
- [x] Task 4: Zod Validation Enhancement
- [x] Task 5: Documentation Improvements
- [ ] Task 6: Validate Basic Usage Example
- [ ] Task 7: Improve Mathematical Notation

## Notes
- No backward compatibility needed - we can change interfaces rapidly
- All changes should include comprehensive tests
- Update integration tests to use new patterns