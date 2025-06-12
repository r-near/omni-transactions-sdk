/**
 * Experimental file to test actual MPC contract sign method calls
 *
 * This script uses a real testnet account to make actual signature requests
 * to the MPC contract and validates the signature format and correctness.
 */

import os from "node:os"
import path from "node:path"
import { Account } from "@near-js/accounts"
import { getSignerFromKeystore } from "@near-js/client"
import { UnencryptedFileSystemKeyStore } from "@near-js/keystores-node"
import { JsonRpcProvider } from "@near-js/providers"
import { hexToBytes } from "@noble/curves/abstract/utils"
import { ed25519 } from "@noble/curves/ed25519"
import { secp256k1 } from "@noble/curves/secp256k1"
import { base58 } from "@scure/base"
import { Contract, type MPCSignature } from "../src/contract.js"
import { OmniKey } from "../src/omni-key.js"

// Test account configuration
const TEST_ACCOUNT_ID = "omni-sdk-test.testnet"
const MPC_CONTRACT_TESTNET = "v1.signer-prod.testnet"
const NETWORK_ID = "testnet"

// NEAR connection setup
const provider = new JsonRpcProvider({ url: "https://rpc.testnet.near.org" })
const keyStore = new UnencryptedFileSystemKeyStore(path.join(os.homedir(), ".near-credentials"))

// Test data for signature requests
const TEST_MESSAGE = "deadbeef".repeat(16) // 64 chars = 32 bytes minimum for EDDSA
const TEST_MESSAGE_HEX = TEST_MESSAGE
const TEST_PATH_EDDSA = "solana-test"
const TEST_DOMAIN_ID_EDDSA = 1 // Ed25519

// Test data for ECDSA signature requests
const TEST_HASH_ECDSA = "a0b1c2d3e4f5061728394a5b6c7d8e9f0a1b2c3d4e5f6071829304a5b6c7d8e9" // 32-byte hash
const TEST_PATH_ECDSA = "ethereum-test"
const TEST_DOMAIN_ID_ECDSA = 0 // secp256k1

async function createTestAccount(): Promise<Account> {
  console.log(`Creating account connection for: ${TEST_ACCOUNT_ID}`)

  // Get signer from keystore
  const signer = await getSignerFromKeystore(TEST_ACCOUNT_ID, NETWORK_ID, keyStore)
  console.log(`✓ Created signer for account: ${await signer.getPublicKey()}`)

  // Create account with provider and signer (new API without Connection)
  const account = new Account(TEST_ACCOUNT_ID, provider, signer)

  // Test that the account works by checking balance
  try {
    const state = await account.state()
    console.log("✓ Account connected successfully")
    console.log(`  Balance: ${state.amount} yoctoNEAR`)
    console.log(`  Storage used: ${state.storage_usage} bytes`)
    return account
  } catch (error) {
    console.error("✗ Failed to connect to account:", (error as Error).message)
    throw error
  }
}

async function testMPCViewMethods(account: Account) {
  console.log("\n=== Testing MPC View Methods ===")

  try {
    // Use Contract class for all view methods
    const contract = new Contract(account, { networkId: "testnet", provider })

    // Test getting public key
    const publicKey = await contract.getPublicKey()
    console.log(`✓ MPC Public Key: ${publicKey}`)

    // Test getting derived public key for ECDSA path with domain_id 0
    const derivedKeyECDSA = await contract.getDerivedPublicKey(
      TEST_ACCOUNT_ID,
      TEST_PATH_ECDSA,
      TEST_DOMAIN_ID_ECDSA,
    )
    console.log(
      `✓ Derived Key for ${TEST_PATH_ECDSA} (domain ${TEST_DOMAIN_ID_ECDSA}): ${derivedKeyECDSA}`,
    )

    // Test getting derived public key for EDDSA path with domain_id 1
    const derivedKeyEDDSA = await contract.getDerivedPublicKey(
      TEST_ACCOUNT_ID,
      TEST_PATH_EDDSA,
      TEST_DOMAIN_ID_EDDSA,
    )
    console.log(
      `✓ Derived Key for ${TEST_PATH_EDDSA} (domain ${TEST_DOMAIN_ID_EDDSA}): ${derivedKeyEDDSA}`,
    )

    // Note: Most MPC contracts support both ECDSA and EDDSA
    console.log("✓ Contract supports both ECDSA and EDDSA signature types")

    // Test getting latest key version
    const keyVersion = await contract.getLatestKeyVersion()
    console.log(`✓ Latest Key Version: ${keyVersion}`)
  } catch (error) {
    console.error("✗ View method failed:", (error as Error).message)
  }
}

async function testMPCSignMethodECDSA(account: Account) {
  console.log("\\n=== Testing MPC ECDSA Sign Method ===")

  try {
    console.log(`Attempting to sign hash: ${TEST_HASH_ECDSA}`)
    console.log(`Path: ${TEST_PATH_ECDSA}`)
    console.log(`Domain ID: ${TEST_DOMAIN_ID_ECDSA} (secp256k1)`)
    console.log(`Account: ${TEST_ACCOUNT_ID}`)

    // Use our Contract class to make the signature request
    const contract = new Contract(account, { networkId: "testnet", provider })

    // Make the signature request using simplified API
    console.log("\\nMaking ECDSA signature request...")
    const signature = await contract.sign(TEST_PATH_ECDSA, TEST_HASH_ECDSA, "ecdsa")

    console.log("\\n✓ ECDSA Sign method returned successfully!")
    console.log("Signature type:", signature.constructor.name)
    console.log("Signature:", signature)

    if (signature instanceof secp256k1.Signature) {
      console.log("  r:", signature.r.toString())
      console.log("  s:", signature.s.toString())
      console.log("  recovery:", signature.recovery)
    }

    return signature
  } catch (error) {
    console.error("✗ ECDSA Sign method failed:", (error as Error).message)
    throw error
  }
}

async function testMPCSignMethodEDDSA(account: Account) {
  console.log("\n=== Testing MPC EDDSA Sign Method ===")

  try {
    console.log(`Attempting to sign message: ${TEST_MESSAGE}`)
    console.log(`Path: ${TEST_PATH_EDDSA}`)
    console.log(`Domain ID: ${TEST_DOMAIN_ID_EDDSA} (Ed25519)`)
    console.log(`Account: ${TEST_ACCOUNT_ID}`)

    // Use our Contract class to make the signature request
    const contract = new Contract(account, { networkId: "testnet", provider })

    // Make the signature request using simplified API
    console.log("\nMaking EDDSA signature request...")
    const signature = await contract.sign(TEST_PATH_EDDSA, TEST_MESSAGE, "eddsa")

    console.log("\n✓ EDDSA Sign method returned successfully!")
    console.log("Signature type:", signature.constructor.name)
    console.log("Signature:", signature)

    return signature
  } catch (error) {
    console.error("✗ EDDSA Sign method failed:", (error as Error).message)
    throw error
  }
}

async function testECDSASignatureVerification(signature: MPCSignature, account: Account) {
  console.log("\\n=== Testing ECDSA Signature Verification ===")

  try {
    // Use our Contract class to get the derived secp256k1 public key for domain 0
    const contract = new Contract(account, { networkId: "testnet", provider })
    const derivedPubKeyDomain0 = await contract.getDerivedPublicKey(
      TEST_ACCOUNT_ID,
      TEST_PATH_ECDSA,
      TEST_DOMAIN_ID_ECDSA,
    )
    console.log(`Derived public key: ${derivedPubKeyDomain0}`)

    // Parse the NEAR public key using OmniKey
    const expectedKey = OmniKey.fromNEAR(derivedPubKeyDomain0)
    const expectedPubKeyHex = expectedKey.publicKey.toHex(true) // compressed format
    console.log(`Expected public key (hex): ${expectedPubKeyHex}`)

    // Verify the signature (only if signature is secp256k1.Signature for ECDSA)
    if (signature instanceof secp256k1.Signature) {
      const hashBytes = hexToBytes(TEST_HASH_ECDSA)
      console.log(`Hash to verify (hex): ${TEST_HASH_ECDSA}`)
      console.log(`Hash bytes length: ${hashBytes.length}`)

      // Recover the public key from the signature
      const recoveredPoint = signature.recoverPublicKey(hashBytes)
      const recoveredPubKey = recoveredPoint.toHex(true) // compressed format
      console.log(`Recovered public key: ${recoveredPubKey}`)

      // Check if they match
      const keysMatch = recoveredPubKey.toLowerCase() === expectedPubKeyHex.toLowerCase()
      console.log(`Public key recovery: ${keysMatch ? "PASSED" : "FAILED"}`)

      // Also verify the signature directly using the hex format
      const isValid = secp256k1.verify(signature, hashBytes, expectedPubKeyHex)

      console.log(`\\n✓ Signature verification: ${isValid ? "PASSED" : "FAILED"}`)
      return { keysMatch, isValid }
    }
    console.log("\\n✗ Expected secp256k1.Signature for ECDSA signature")
    return { keysMatch: false, isValid: false }
  } catch (error) {
    console.error("✗ ECDSA Signature verification failed:", (error as Error).message)
    return { keysMatch: false, isValid: false }
  }
}

async function testEDDSASignatureVerification(signature: MPCSignature, account: Account) {
  console.log("\n=== Testing EDDSA Signature Verification ===")

  try {
    // Use our Contract class to get the derived Ed25519 public key for domain 1
    const contract = new Contract(account, { networkId: "testnet", provider })
    const derivedPubKeyDomain1 = await contract.getDerivedPublicKey(
      TEST_ACCOUNT_ID,
      TEST_PATH_EDDSA,
      TEST_DOMAIN_ID_EDDSA,
    )
    console.log(`Derived public key: ${derivedPubKeyDomain1}`)

    // Parse the Ed25519 public key (remove ed25519: prefix and decode base58)
    const pubKeyStr = derivedPubKeyDomain1.replace("ed25519:", "")
    const pubKeyBytes = base58.decode(pubKeyStr)
    console.log(`Expected public key (hex): ${Buffer.from(pubKeyBytes).toString("hex")}`)

    // Verify the signature (only if signature is Uint8Array for Ed25519)
    if (signature instanceof Uint8Array) {
      const messageBytes = hexToBytes(TEST_MESSAGE_HEX)
      const isValid = ed25519.verify(signature, messageBytes, pubKeyBytes)

      console.log(`\n✓ Signature verification: ${isValid ? "PASSED" : "FAILED"}`)
      return { keysMatch: true, isValid }
    }
    console.log("\n✗ Expected Uint8Array for Ed25519 signature")
    return { keysMatch: false, isValid: false }
  } catch (error) {
    console.error("✗ EDDSA Signature verification failed:", (error as Error).message)
    return { keysMatch: false, isValid: false }
  }
}

async function main() {
  console.log("Starting Ed25519 MPC signature exploration...")
  console.log(`Test Account: ${TEST_ACCOUNT_ID}`)
  console.log(`MPC Contract: ${MPC_CONTRACT_TESTNET}`)
  console.log(`Network: ${NETWORK_ID}`)

  try {
    // Create account connection
    const account = await createTestAccount()

    // Test view methods first to make sure everything works
    await testMPCViewMethods(account)

    // Test ECDSA signing and verification
    const ecdsaSignature = await testMPCSignMethodECDSA(account)
    const ecdsaVerification = await testECDSASignatureVerification(ecdsaSignature, account)

    // Test EDDSA signing and verification
    const eddsaSignature = await testMPCSignMethodEDDSA(account)
    const eddsaVerification = await testEDDSASignatureVerification(eddsaSignature, account)

    console.log("\n=== Summary ===")
    console.log("ECDSA (secp256k1) Results:")
    console.log("  ✓ Successfully tested MPC ECDSA sign method")
    console.log("  ✓ Got secp256k1.Signature instance")
    console.log(`  ✓ Public key recovery: ${ecdsaVerification.keysMatch ? "PASSED" : "FAILED"}`)
    console.log(`  ✓ Signature verification: ${ecdsaVerification.isValid ? "PASSED" : "FAILED"}`)

    console.log("\nEDDSA (Ed25519) Results:")
    console.log("  ✓ Successfully tested MPC EDDSA sign method")
    console.log("  ✓ Got Ed25519 signature as Uint8Array")
    console.log(`  ✓ Signature verification: ${eddsaVerification.isValid ? "PASSED" : "FAILED"}`)

    if (ecdsaVerification.keysMatch && ecdsaVerification.isValid && eddsaVerification.isValid) {
      console.log(
        "\n🎉 Both ECDSA and EDDSA tests passed! The MPC signatures are cryptographically valid.",
      )
    } else {
      console.log("\n❌ Some signature verifications failed.")
      if (!ecdsaVerification.keysMatch || !ecdsaVerification.isValid) {
        console.log("  - ECDSA signature verification failed")
      }
      if (!eddsaVerification.isValid) {
        console.log("  - EDDSA signature verification failed")
      }
    }
  } catch (error) {
    console.error("\n=== Exploration Failed ===")
    console.error("Error:", (error as Error).message)
  }
}

if (import.meta.main) {
  main().catch(console.error)
}
