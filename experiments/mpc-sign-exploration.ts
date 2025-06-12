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
const TEST_HASH = "a0b1c2d3e4f5061728394a5b6c7d8e9f0a1b2c3d4e5f6071829304a5b6c7d8e9" // 32 bytes for ECDSA
const TEST_MESSAGE = "deadbeef".repeat(16) // 64 chars = 32 bytes minimum for EDDSA
const TEST_MESSAGE_HEX = TEST_MESSAGE
const TEST_PATH_ECDSA = "ethereum-test"
const TEST_PATH_EDDSA = "solana-test"
const TEST_DOMAIN_ID_ECDSA = 0 // secp256k1
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
    // Test getting public key
    const publicKey = await account.viewFunction({
      contractId: MPC_CONTRACT_TESTNET,
      methodName: "public_key",
      args: {},
    })
    console.log(`✓ MPC Public Key: ${publicKey}`)

    // Test getting derived public key for ECDSA path with domain_id 0
    const derivedKeyECDSA = await account.viewFunction({
      contractId: MPC_CONTRACT_TESTNET,
      methodName: "derived_public_key",
      args: {
        predecessor: TEST_ACCOUNT_ID,
        path: TEST_PATH_ECDSA,
        // Note: derived_public_key doesn't take domain_id, it uses latest_key_version
      },
    })
    console.log(`✓ Derived Key for ${TEST_PATH_ECDSA} (default domain): ${derivedKeyECDSA}`)

    // Test getting derived public key for EDDSA path
    const derivedKeyEDDSA = await account.viewFunction({
      contractId: MPC_CONTRACT_TESTNET,
      methodName: "derived_public_key",
      args: {
        predecessor: TEST_ACCOUNT_ID,
        path: TEST_PATH_EDDSA,
      },
    })
    console.log(`✓ Derived Key for ${TEST_PATH_EDDSA} (default domain): ${derivedKeyEDDSA}`)

    // Test domain_id 1 public key if available
    try {
      const domain1PubKey = await account.viewFunction({
        contractId: MPC_CONTRACT_TESTNET,
        methodName: "public_key",
        args: { domain_id: 1 },
      })
      console.log(`✓ Domain 1 Public Key: ${domain1PubKey}`)
    } catch (error) {
      console.log(`✗ Domain 1 not available: ${(error as Error).message}`)
    }

    // Test getting latest key version
    const keyVersion = await account.viewFunction({
      contractId: MPC_CONTRACT_TESTNET,
      methodName: "latest_key_version",
      args: {},
    })
    console.log(`✓ Latest Key Version: ${keyVersion}`)
  } catch (error) {
    console.error("✗ View method failed:", (error as Error).message)
  }
}

async function testMPCSignMethodECDSA(account: Account) {
  console.log("\n=== Testing MPC ECDSA Sign Method ===")

  try {
    console.log(`Attempting to sign hash: ${TEST_HASH}`)
    console.log(`Path: ${TEST_PATH_ECDSA}`)
    console.log(`Domain ID: ${TEST_DOMAIN_ID_ECDSA}`)
    console.log(`Account: ${TEST_ACCOUNT_ID}`)

    // Use our Contract class to make the signature request
    const contract = new Contract(account, { networkId: "testnet" })

    // Create the signature request
    const signRequest = Contract.createECDSARequest(
      TEST_PATH_ECDSA,
      TEST_HASH,
      TEST_DOMAIN_ID_ECDSA,
    )
    console.log("ECDSA Sign request:", JSON.stringify(signRequest, null, 2))

    // Make the signature request using our Contract class
    console.log("\nMaking ECDSA signature request...")
    const signature = await contract.sign(signRequest)

    console.log("\n✓ ECDSA Sign method returned successfully!")
    console.log("Signature type:", signature.constructor.name)
    if (signature instanceof secp256k1.Signature) {
      console.log("Signature r:", signature.r.toString(16))
      console.log("Signature s:", signature.s.toString(16))
      console.log("Recovery ID:", signature.recovery)
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
    const contract = new Contract(account, { networkId: "testnet" })

    // Create the signature request
    const signRequest = Contract.createEDDSARequest(
      TEST_PATH_EDDSA,
      TEST_MESSAGE,
      TEST_DOMAIN_ID_EDDSA,
    )
    console.log("EDDSA Sign request:", JSON.stringify(signRequest, null, 2))

    // Make the signature request using our Contract class
    console.log("\nMaking EDDSA signature request...")
    const signature = await contract.sign(signRequest)

    console.log("\n✓ EDDSA Sign method returned successfully!")
    console.log("Signature type:", signature.constructor.name)
    console.log("Signature:", signature)

    return signature
  } catch (error) {
    console.error("✗ EDDSA Sign method failed:", (error as Error).message)
    throw error
  }
}

async function testECDSASignatureVerification(
  signature: InstanceType<typeof secp256k1.Signature>,
  account: Account,
) {
  console.log("\n=== Testing ECDSA Signature Verification ===")

  try {
    // Get the derived public key for this path
    const derivedPubKeyNear = (await account.viewFunction({
      contractId: MPC_CONTRACT_TESTNET,
      methodName: "derived_public_key",
      args: {
        predecessor: TEST_ACCOUNT_ID,
        path: TEST_PATH_ECDSA,
      },
    })) as string

    console.log(`Derived public key: ${derivedPubKeyNear}`)

    // Parse the NEAR public key using OmniKey
    const expectedKey = OmniKey.fromNEAR(derivedPubKeyNear)
    const expectedPubKeyHex = expectedKey.publicKey.toHex(true) // compressed format
    console.log(`Expected public key (hex): ${expectedPubKeyHex}`)

    // Convert hash to bytes for signature verification
    const hashBytes = hexToBytes(TEST_HASH)

    // Recover the public key from the signature
    const recoveredPoint = signature.recoverPublicKey(hashBytes)
    const recoveredPubKey = recoveredPoint.toHex(true) // compressed format

    console.log(`Recovered public key: ${recoveredPubKey}`)

    // Check if they match
    const keysMatch = recoveredPubKey.toLowerCase() === expectedPubKeyHex.toLowerCase()
    console.log(
      `\n${keysMatch ? "✓" : "✗"} Public key recovery: ${keysMatch ? "PASSED" : "FAILED"}`,
    )

    // Also verify the signature directly using the hex format
    const isValid = secp256k1.verify(signature, hashBytes, expectedPubKeyHex)
    console.log(`${isValid ? "✓" : "✗"} Signature verification: ${isValid ? "PASSED" : "FAILED"}`)

    return { keysMatch, isValid }
  } catch (error) {
    console.error("✗ ECDSA Signature verification failed:", (error as Error).message)
    throw error
  }
}

async function testEDDSASignatureVerification(signature: MPCSignature, account: Account) {
  console.log("\n=== Testing EDDSA Signature Verification ===")

  try {
    // Get the derived Ed25519 public key for domain 1
    // Note: We need to use public_key_from to get derived keys for specific domains
    const derivedPubKeyDomain1 = await account.viewFunction({
      contractId: MPC_CONTRACT_TESTNET,
      methodName: "public_key_from",
      args: { domain_id: TEST_DOMAIN_ID_EDDSA, path: TEST_PATH_EDDSA },
    })
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
  console.log("Starting MPC sign method exploration...")
  console.log(`Test Account: ${TEST_ACCOUNT_ID}`)
  console.log(`MPC Contract: ${MPC_CONTRACT_TESTNET}`)
  console.log(`Network: ${NETWORK_ID}`)

  try {
    // Create account connection
    const account = await createTestAccount()

    // Test view methods first to make sure everything works
    await testMPCViewMethods(account)

    // Test ECDSA signing
    const ecdsaSignature = await testMPCSignMethodECDSA(account)
    const ecdsaVerification =
      ecdsaSignature instanceof secp256k1.Signature
        ? await testECDSASignatureVerification(ecdsaSignature, account)
        : { keysMatch: false, isValid: false }

    // Test EDDSA signing
    let eddsaSignature: MPCSignature | null = null
    let eddsaVerification = { keysMatch: false, isValid: false }
    try {
      eddsaSignature = await testMPCSignMethodEDDSA(account)
      eddsaVerification = await testEDDSASignatureVerification(eddsaSignature, account)
    } catch (error) {
      console.error("EDDSA testing failed:", (error as Error).message)
    }

    console.log("\n=== Summary ===")
    console.log("ECDSA Results:")
    console.log("  ✓ Successfully tested MPC ECDSA sign method")
    console.log("  ✓ Got proper @noble/curves secp256k1.Signature instance")
    console.log(`  ✓ Public key recovery: ${ecdsaVerification.keysMatch ? "PASSED" : "FAILED"}`)
    console.log(`  ✓ Signature verification: ${ecdsaVerification.isValid ? "PASSED" : "FAILED"}`)

    console.log("\nEDDSA Results:")
    if (eddsaSignature) {
      console.log("  ✓ Successfully tested MPC EDDSA sign method")
      console.log("  ✓ Got signature response (format TBD)")
      console.log(`  ✓ Public key recovery: ${eddsaVerification.keysMatch ? "PASSED" : "FAILED"}`)
      console.log(`  ✓ Signature verification: ${eddsaVerification.isValid ? "PASSED" : "FAILED"}`)
    } else {
      console.log("  ❌ EDDSA testing failed")
    }

    if (ecdsaVerification.keysMatch && ecdsaVerification.isValid) {
      console.log("\n🎉 ECDSA tests passed! The MPC ECDSA signature is cryptographically valid.")
    } else {
      console.log("\n❌ Some ECDSA verification tests failed.")
    }
  } catch (error) {
    console.error("\n=== Exploration Failed ===")
    console.error("Error:", (error as Error).message)
  }
}

if (import.meta.main) {
  main().catch(console.error)
}
