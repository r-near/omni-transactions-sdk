# omni-transactions-sdk

A TypeScript SDK for NEAR Chain Signatures, enabling multi-blockchain transaction signing through NEAR's MPC (Multi-Party Computation) network.

## Overview

NEAR Chain Signatures allows any NEAR account to sign transactions for multiple blockchains (Ethereum, Bitcoin, etc.) using a single NEAR account. The MPC network collectively holds secret keys and can sign transactions on behalf of users without exposing private keys.

This SDK provides:
- ✅ **Universal key derivation** - Generate addresses for multiple blockchains from a NEAR account
- ✅ **MPC integration** - Submit transactions to NEAR's MPC network for signing
- ✅ **Testing utilities** - Local secret key implementation for development and testing
- 🚧 **Library adapters** - Work with popular libraries like viem, web3.js *(coming soon)*

## Quick Start

### Installation

```bash
bun install omni-transactions-sdk
# or
npm install omni-transactions-sdk
```

### Basic Usage

```typescript
import { MPCKey, Contract, SignatureType } from 'omni-transactions-sdk'
import { Account } from "@near-js/accounts"
import { KeyPairSigner } from "@near-js/signers"
import { JsonRpcProvider } from "@near-js/providers"

// Step 1: Start with MPC root public key (obtained from MPC contract)
const mpcRootKey = MPCKey.fromNEAR(
  "secp256k1:3tFRbMqmoa6AAALMrEFAYCEoHcqKxeW38YptwowBVBtXK1vo36HDbUWuR6EZmoK4JcH6HDkNMGGqP1ouV7VZUWya"
)

// Step 2: Derive keys using your NEAR account ID and custom paths
const callerAccountId = "alice.near"

// Common path patterns:
const ethKey = mpcRootKey.derive(callerAccountId, "ethereum,1")
const btcKey = mpcRootKey.derive(callerAccountId, "bitcoin,1") 
const customKey = mpcRootKey.derive(callerAccountId, "trading/ethereum/main")

// Step 3: Generate blockchain addresses from derived keys
console.log("Ethereum address:", ethKey.ethereum)  // 0xa2869d3977dea9afc9b9c069491ac08f06f9e458
console.log("Bitcoin address:", btcKey.bitcoin)    // bc1q96j504ke29e7ttnh0wkhnhr5qpj8alexu6h0gc
console.log("Custom path address:", customKey.ethereum)

// Step 4: Sign transactions using MPC network
const provider = new JsonRpcProvider({ url: "https://rpc.testnet.near.org" })
const signer = KeyPairSigner.fromSecretKey("your-private-key") // In practice, use secure key management
const account = new Account(callerAccountId, provider, signer)
const contract = new Contract(account, { networkId: "testnet", provider })

// Sign an Ethereum transaction hash
const ethTxHash = "a0b1c2d3e4f5061728394a5b6c7d8e9f0a1b2c3d4e5f6071829304a5b6c7d8e9f"
const signature = await contract.sign({
  path: "ethereum,1",
  message: ethTxHash,
  signatureType: SignatureType.ECDSA
})
console.log("MPC signature:", signature)
```

### Testing with Secret Keys

```typescript
import { MockMPCKey } from 'omni-transactions-sdk'

// Testing: Create with secret key for local development
const testKey = MockMPCKey.random()
// or
const testKey = MockMPCKey.fromSecret("0x1234...")

// Derive child keys (both public and secret)
const childKey = testKey.derive("test.near", "test-path")
console.log("Child Ethereum:", childKey.ethereum)
console.log("Child secret:", childKey.secretHex)

// Local signing for testing
const messageHash = new Uint8Array(32) // Your message hash
const signature = childKey.sign(messageHash)
console.log("Local signature:", signature)
```

## Background: NEAR Chain Signatures

### What is Chain Signatures?

NEAR Chain Signatures is a groundbreaking technology that allows NEAR accounts to control addresses on any blockchain. Instead of managing separate private keys for each blockchain, users can:

1. **Single source of truth**: Use their NEAR account to control addresses on Ethereum, Bitcoin, etc.
2. **No key management**: Never handle private keys directly - the MPC network manages them collectively
3. **Cross-chain transactions**: Sign transactions for any blockchain using familiar NEAR wallet interfaces

### How it Works

```mermaid
graph TB
    A[NEAR Account: alice.near] --> B[MPC Network]
    B --> C[Ethereum Address: 0x...]
    B --> D[Bitcoin Address: bc1...]
    B --> E[Other Blockchains...]
    
    F[Unsigned Transaction] --> B
    B --> G[Signed Transaction]
```

1. **Account Setup**: A NEAR account requests a root public key from the MPC network
2. **Address Generation**: Derive blockchain-specific addresses using hierarchical key derivation
3. **Transaction Signing**: Submit transaction hash to MPC network, receive signature
4. **Cross-chain Execution**: Use signed transaction on target blockchain

## Mathematical Foundation

### NEAR MPC Additive Key Derivation

Unlike BIP32's multiplicative derivation, NEAR uses **additive derivation** which allows the MPC network to derive child keys without knowing the parent secret key.

#### Core Formulas

Given a parent key and derivation parameters:

1. **Derivation tweak**: 

   $$\varepsilon = \text{SHA3-256}(\text{"near-mpc-recovery v0.1.0 epsilon derivation:"} + \text{account} + \text{","} + \text{path})$$

2. **Child secret key** (MPC network):

   $$s_{\text{child}} = (\varepsilon + s_{\text{parent}}) \bmod n$$

3. **Child public key** (anyone can compute):

   $$P_{\text{child}} = \varepsilon \cdot G + P_{\text{parent}}$$

#### Cryptographic Consistency

The key insight is that these formulas are mathematically equivalent:

$$\begin{align}
s_{\text{child}} \cdot G &= (\varepsilon + s_{\text{parent}}) \cdot G \\
&= \varepsilon \cdot G + s_{\text{parent}} \cdot G \\
&= \varepsilon \cdot G + P_{\text{parent}} \\
&= P_{\text{child}} \quad \checkmark
\end{align}$$

This ensures that:
- The MPC network can derive child secret keys
- Anyone can derive child public keys  
- Both methods produce corresponding key pairs
- No secret information is leaked during public key derivation

#### Example Calculation

```typescript
// Given:
const account = "alice.near"
const path = "ethereum-1" 
const parentSecret = 0x1234... // Only MPC network knows this

// Anyone can compute:
const derivationString = "near-mpc-recovery v0.1.0 epsilon derivation:alice.near,ethereum-1"
const ε = SHA3-256(derivationString)
const childPublic = ε × G + parentPublic

// Only MPC network can compute:
const childSecret = (ε + parentSecret) mod n

// Mathematical guarantee:
childSecret × G === childPublic ✅
```

### Security Properties

1. **Verifiable**: Anyone can verify that a child public key was correctly derived
2. **Non-linkable**: Child keys don't reveal information about parent or sibling keys
3. **Deterministic**: Same inputs always produce same outputs
4. **Quantum-resistant derivation**: Uses SHA3-256 instead of HMAC-SHA512

## API Reference

### MPCKey Class

Production class for handling public-key-only operations with NEAR Chain Signatures.

#### Static Constructors

```typescript
// From NEAR protocol format
MPCKey.fromNEAR(nearPublicKey: string): MPCKey

// From raw public key point  
MPCKey.fromPoint(point: ProjPointType<bigint>): MPCKey

// From uncompressed bytes (64 bytes)
MPCKey.fromBytes(bytes: Uint8Array): MPCKey
```

#### Instance Methods

**Key Derivation:**
```typescript
// Derive child key using NEAR MPC scheme
derive(predecessorId: string, path: string): MPCKey
```

**Address Generation:**
```typescript
get ethereum(): string      // 0x... (Keccak-256 of public key)
get bitcoin(): string       // bc1... (Bech32 format, modern)
get bitcoinP2PKH(): string  // 1... (P2PKH format, legacy)  
get bitcoinBech32(): string // bc1... (P2WPKH format, modern)
get near(): string          // secp256k1:... (NEAR protocol format)
```

**Public Key Access:**
```typescript
get publicKey(): ProjPointType<bigint>  // Raw secp256k1 point
get bytes(): Uint8Array                 // Uncompressed (65 bytes)
get compressed(): Uint8Array            // Compressed (33 bytes)
get hex(): string                       // Hex representation
```

### MockMPCKey Class

Testing class that extends MPCKey with secret key capabilities for local development.

#### Static Constructors

```typescript
// Generate random key pair
MockMPCKey.random(): MockMPCKey

// From secret key scalar, string, or bytes
MockMPCKey.fromSecret(secret: bigint | string | Uint8Array): MockMPCKey
```

#### Additional Methods

**Secret Key Access:**
```typescript
get secretKey(): bigint      // Raw secret scalar
get secretBytes(): Uint8Array // 32-byte secret key
get secretHex(): string      // Hex representation
```

**Local Signing:**
```typescript
sign(messageHash: Uint8Array): RecoveredSignatureType
```

**Enhanced Derivation:**
```typescript
// Override to return MockMPCKey with derived secret
derive(predecessorId: string, path: string): MockMPCKey
```

### Contract Class

Interface for interacting with NEAR's MPC smart contract.

#### Constructor

```typescript
new Contract(account: Account, config: ContractConfig)
```

#### Methods

```typescript
// Get root public key from MPC contract
getPublicKey(): Promise<string>

// Get derived public key
getDerivedPublicKey(predecessor: string, path: string, domainId?: number): Promise<string>

// Get latest key version
getLatestKeyVersion(): Promise<number>

// Sign message or hash using MPC network
sign(path: string, message: string, signatureType?: "ecdsa" | "eddsa", domainId?: number): Promise<MPCSignature>
```

## Examples

### Multi-Chain Wallet

```typescript
import { MPCKey } from 'omni-transactions-sdk'

class MultiChainWallet {
  constructor(private nearPublicKey: string) {}
  
  // Generate addresses for a specific purpose
  getAddresses(purpose: string) {
    const key = MPCKey.fromNEAR(this.nearPublicKey)
    const derived = key.derive("wallet.near", purpose)
    
    return {
      ethereum: derived.ethereum,
      bitcoin: derived.bitcoin,
      near: derived.near
    }
  }
  
  // Get trading addresses
  getTradingAddresses() {
    return this.getAddresses("trading")
  }
  
  // Get savings addresses  
  getSavingsAddresses() {
    return this.getAddresses("savings")
  }
}

const wallet = new MultiChainWallet("secp256k1:3tFRbMqmoa6...")
console.log(wallet.getTradingAddresses())
// {
//   ethereum: "0xa2869d3977dea9afc9b9c069491ac08f06f9e458",
//   bitcoin: "bc1q96j504ke29e7ttnh0wkhnhr5qpj8alexu6h0gc", 
//   near: "secp256k1:2Bg4..."
// }
```

### Testing Framework Integration

```typescript
import { MockMPCKey } from 'omni-transactions-sdk'
import { describe, test, expect } from 'bun:test'

describe('Cross-chain integration', () => {
  test('should derive consistent addresses', () => {
    // Use deterministic test key
    const testKey = MockMPCKey.fromSecret("0x1234567890abcdef...")
    
    const ethKey = testKey.derive("test.near", "ethereum-test")
    const btcKey = testKey.derive("test.near", "bitcoin-test")
    
    // Verify addresses are deterministic
    expect(ethKey.ethereum).toBe("0x...")
    expect(btcKey.bitcoin).toBe("bc1...")
    
    // Verify cryptographic consistency
    const recomputedEth = MockMPCKey.fromSecret(ethKey.secretKey)
    expect(ethKey.publicKey.equals(recomputedEth.publicKey)).toBe(true)
  })
})
```

### Bridge Application

```typescript
import { MPCKey } from 'omni-transactions-sdk'

class CrossChainBridge {
  constructor(private nearAccount: string, private rootKey: string) {}
  
  // Generate deposit addresses for users
  generateDepositAddress(userId: string, sourceChain: string) {
    const key = MPCKey.fromNEAR(this.rootKey)
    const userKey = key.derive(this.nearAccount, `bridge/${userId}/${sourceChain}`)
    
    switch (sourceChain) {
      case 'ethereum':
        return userKey.ethereum
      case 'bitcoin':
        return userKey.bitcoin
      default:
        throw new Error(`Unsupported chain: ${sourceChain}`)
    }
  }
  
  // Verify a deposit came from the correct address
  verifyDepositAddress(userId: string, sourceChain: string, address: string) {
    const expectedAddress = this.generateDepositAddress(userId, sourceChain)
    return address === expectedAddress
  }
}

const bridge = new CrossChainBridge("bridge.near", "secp256k1:...")
const depositAddr = bridge.generateDepositAddress("alice", "ethereum")
console.log(`Send ETH to: ${depositAddr}`)
```

## Development

### Setup

```bash
bun install
```

### Running Tests

```bash
bun test          # Run unit tests
bun test:all      # Run all tests (unit + integration)
bun run typecheck # TypeScript type checking
bun run lint      # Code linting and formatting
```

### Building

```bash
bun run build     # Compile TypeScript
```

## Roadmap

- ✅ **Phase 1.1**: Universal key derivation and address generation
- ✅ **Phase 1.2**: NEAR MPC integration for transaction signing
- ✅ **Phase 1.4**: Testing infrastructure and mock MPC signer
- 🚧 **Phase 1.3**: Viem adapter for Ethereum transactions
- 🚧 **Phase 2**: Bitcoin transaction support
- 🚧 **Phase 3**: Additional chains (Solana) and wallet integrations

See [ROADMAP.md](./ROADMAP.md) for detailed development plans.

## Security

This SDK uses audited cryptographic libraries:
- **[@noble/curves](https://github.com/paulmillr/noble-curves)** - Elliptic curve cryptography
- **[@noble/hashes](https://github.com/paulmillr/noble-hashes)** - Cryptographic hash functions
- **[@scure/btc-signer](https://github.com/paulmillr/scure-btc-signer)** - Bitcoin address generation

⚠️ **Important**: The `MockMPCKey` functionality is for testing only. In production, secret keys are managed by NEAR's MPC network and never exposed.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Run `bun test` and `bun run lint`
5. Submit a pull request

## License

MIT License - see [LICENSE](./LICENSE) for details.

## Links

- [NEAR Chain Signatures Documentation](https://docs.near.org/tools/chain-signatures)
- [NEAR MPC Recovery Specification](https://github.com/near/mpc-recovery)
- [@noble/curves Documentation](https://github.com/paulmillr/noble-curves)
