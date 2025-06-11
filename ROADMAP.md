# ROADMAP

## Overview
Building a TypeScript SDK for NEAR Chain Signatures (MPC network) that allows developers to sign transactions for multiple blockchains using NEAR's MPC smart contract.

## Core Concept
1. Developer constructs unsigned transaction using their preferred library (viem, etc.)
2. SDK submits transaction hash to NEAR MPC smart contract for signing
3. SDK manages the signature request/response flow
4. SDK returns completed signed transaction in the original library's format

## Phase 1: MVP - Ethereum Support

### 1.1 Foundation
- [x] `OmniPublicKey` class with multi-chain address derivation
- [x] Package rename to `omni-transactions-sdk`

### 1.2 Core MPC Integration
- [ ] NEAR MPC smart contract interface
- [ ] Signature request/response handling
- [ ] Integration with near-api-js (user brings wallet connection)
- [ ] Error handling and retry logic

### 1.3 Ethereum Integration
- [ ] Viem adapter for transaction flow:
  - Accept viem unsigned transaction
  - Extract transaction hash
  - Submit to MPC for signing
  - Return signed transaction compatible with viem
- [ ] Support for different Ethereum networks (mainnet, testnets)

### 1.4 Testing Infrastructure
- [x] `OmniSecretKey` class for testing (same derivation scheme)
- [x] Standard test fixtures and examples
- [ ] Mock MPC signer for unit tests
- [ ] Integration test suite with test networks

### 1.5 Documentation & Tooling
- [ ] Comprehensive README with examples
- [ ] API documentation
- [ ] Auto-commit workflow setup
- [ ] Semantic commit standards

## Phase 2: Bitcoin Support

### 2.1 Bitcoin Integration
- [ ] Bitcoin transaction handling
- [ ] Support for P2PKH and P2WPKH addresses
- [ ] UTXO management utilities
- [ ] Integration with popular Bitcoin libraries

### 2.2 Enhanced Testing
- [ ] Bitcoin testnet integration
- [ ] Cross-chain test scenarios

## Phase 3: Extended Features

### 3.1 Enhanced Wallet Integration
- [ ] NEAR Wallet Selector integration
- [ ] Multiple wallet provider support

### 3.2 Additional Chains
- [ ] Solana support
- [ ] Other EVM chains optimization

### 3.3 Advanced Features
- [ ] Batch transaction signing
- [ ] Transaction simulation
- [ ] Fee estimation utilities
- [ ] Bridge transaction support

## Phase 4: Production Ready

### 4.1 Performance & Reliability
- [ ] Caching strategies
- [ ] Connection pooling
- [ ] Rate limiting
- [ ] Monitoring and metrics

### 4.2 Developer Experience
- [ ] CLI tools
- [ ] React hooks
- [ ] Framework integrations
- [ ] Migration guides

## Technical Decisions

### Architecture
- **Monolithic package**: Single `omni-transactions-sdk` package
- **Modular design**: Chain-specific modules within the package
- **Library agnostic**: Work with existing transaction libraries rather than replacing them

### Integration Strategy
- **Viem**: Manual transaction construction + signature attachment
- **NEAR**: near-api-js integration, user-provided wallet connection
- **Testing**: Local secret key with same derivation scheme as MPC network

### Quality Standards
- **Commits**: Semantic commits, batched changes
- **Testing**: Unit tests + integration tests with test networks
- **Documentation**: Comprehensive examples and API docs