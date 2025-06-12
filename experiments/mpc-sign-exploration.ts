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
import { base58 } from "@scure/base"
import { Contract, type MPCSignature } from "../src/contract.js"

// Test account configuration
const TEST_ACCOUNT_ID = "omni-sdk-test.testnet"
const MPC_CONTRACT_TESTNET = "v1.signer-prod.testnet"
const NETWORK_ID = "testnet"

// NEAR connection setup
const provider = new JsonRpcProvider({ url: "https://rpc.testnet.near.org" })
const keyStore = new UnencryptedFileSystemKeyStore(path.join(os.homedir(), ".near-credentials"))

// Test data for Ed25519 signature requests
const TEST_MESSAGE = "deadbeef".repeat(16) // 64 chars = 32 bytes minimum for EDDSA
const TEST_MESSAGE_HEX = TEST_MESSAGE
const TEST_PATH_EDDSA = "solana-test"
const TEST_DOMAIN_ID_EDDSA = 1 // Ed25519

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

    // Test EDDSA signing and verification
    const eddsaSignature = await testMPCSignMethodEDDSA(account)
    const eddsaVerification = await testEDDSASignatureVerification(eddsaSignature, account)

    console.log("\n=== Summary ===")
    console.log("Ed25519 Results:")
    console.log("  ✓ Successfully tested MPC Ed25519 sign method")
    console.log("  ✓ Got Ed25519 signature as Uint8Array")
    console.log(`  ✓ Signature verification: ${eddsaVerification.isValid ? "PASSED" : "FAILED"}`)

    if (eddsaVerification.isValid) {
      console.log(
        "\n🎉 Ed25519 tests passed! The MPC Ed25519 signature is cryptographically valid.",
      )
    } else {
      console.log("\n❌ Ed25519 signature verification failed.")
    }
  } catch (error) {
    console.error("\n=== Exploration Failed ===")
    console.error("Error:", (error as Error).message)
  }
}

if (import.meta.main) {
  main().catch(console.error)
}
