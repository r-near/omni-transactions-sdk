/**
 * Experimental file to test actual MPC contract sign method calls
 *
 * This script uses a real testnet account to make actual signature requests
 * to the MPC contract and analyze the response format.
 */

import os from "os"
import path from "path"
import { Account } from "@near-js/accounts"
import { getSignerFromKeystore } from "@near-js/client"
import { UnencryptedFileSystemKeyStore } from "@near-js/keystores-node"
import { JsonRpcProvider } from "@near-js/providers"

// Test account configuration
const TEST_ACCOUNT_ID = "omni-sdk-test.testnet"
const MPC_CONTRACT_TESTNET = "v1.signer-prod.testnet"
const NETWORK_ID = "testnet"

// NEAR connection setup
const provider = new JsonRpcProvider({ url: "https://rpc.testnet.near.org" })
const keyStore = new UnencryptedFileSystemKeyStore(path.join(os.homedir(), ".near-credentials"))

// Test data for signature requests
const TEST_HASH = "a0b1c2d3e4f5061728394a5b6c7d8e9f0a1b2c3d4e5f6071829304a5b6c7d8e9" // 32 bytes
const TEST_PATH = "ethereum-test"
const TEST_DOMAIN_ID = 0

async function createTestAccount(): Promise<Account> {
  console.log(`Creating account connection for: ${TEST_ACCOUNT_ID}`)

  // Get signer from keystore
  const signer = await getSignerFromKeystore(TEST_ACCOUNT_ID, NETWORK_ID, keyStore)
  console.log(`✓ Created signer for account: ${await signer.getPublicKey()}`)

  // Create account with provider and signer
  const account = new Account(TEST_ACCOUNT_ID, provider, signer)

  // Test that the account works by checking balance
  try {
    const state = await account.state()
    console.log(`✓ Account connected successfully`)
    console.log(`  Balance: ${state.amount} yoctoNEAR`)
    console.log(`  Storage used: ${state.storage_usage} bytes`)
    return account
  } catch (error) {
    console.error(`✗ Failed to connect to account:`, (error as Error).message)
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

    // Test getting derived public key for our test path
    const derivedKey = await account.viewFunction({
      contractId: MPC_CONTRACT_TESTNET,
      methodName: "derived_public_key",
      args: {
        predecessor: TEST_ACCOUNT_ID,
        path: TEST_PATH,
      },
    })
    console.log(`✓ Derived Key for ${TEST_PATH}: ${derivedKey}`)

    // Test getting latest key version
    const keyVersion = await account.viewFunction({
      contractId: MPC_CONTRACT_TESTNET,
      methodName: "latest_key_version",
      args: {},
    })
    console.log(`✓ Latest Key Version: ${keyVersion}`)
  } catch (error) {
    console.error(`✗ View method failed:`, (error as Error).message)
  }
}

async function testMPCSignMethod(account: Account) {
  console.log("\n=== Testing MPC Sign Method ===")

  try {
    console.log(`Attempting to sign hash: ${TEST_HASH}`)
    console.log(`Path: ${TEST_PATH}`)
    console.log(`Domain ID: ${TEST_DOMAIN_ID}`)
    console.log(`Account: ${TEST_ACCOUNT_ID}`)

    // Based on the provided example, the correct format wraps everything in a "request" object
    const correctArgs = {
      request: {
        domain_id: TEST_DOMAIN_ID,
        path: TEST_PATH,
        payload_v2: {
          Ecdsa: TEST_HASH,
        },
      },
    }

    console.log("Correct sign request args:", JSON.stringify(correctArgs, null, 2))

    const result = await account.functionCall({
      contractId: MPC_CONTRACT_TESTNET,
      methodName: "sign",
      args: correctArgs,
      gas: 300000000000000n, // 300 TGas
      attachedDeposit: 1n, // Required by MPC contract
    })

    console.log("\n✓ Sign method returned successfully!")
    console.log("Raw result:", JSON.stringify(result, null, 2))

    // Analyze the result structure
    console.log("\n=== Result Analysis ===")
    console.log("Result type:", typeof result)
    console.log("Result keys:", Object.keys(result as any))

    if (result && typeof result === "object") {
      const res = result as any

      // Look for common NEAR transaction result fields
      if (res.transaction) {
        console.log("Transaction hash:", res.transaction.hash)
      }
      if (res.receipts_outcome) {
        console.log("Receipts outcome count:", res.receipts_outcome.length)
        res.receipts_outcome.forEach((receipt: any, i: number) => {
          console.log(`Receipt ${i}:`, receipt.outcome.status)
          if (receipt.outcome.logs) {
            console.log(`  Logs:`, receipt.outcome.logs)
          }
        })
      }
      if (res.status) {
        console.log("Transaction status:", res.status)
        if (res.status.SuccessValue) {
          const successValue = res.status.SuccessValue
          console.log("Success value (base64):", successValue)

          // Try to decode the success value
          try {
            const decoded = Buffer.from(successValue, "base64").toString("utf8")
            console.log("Success value (decoded):", decoded)

            // Try to parse as JSON
            try {
              const parsed = JSON.parse(decoded)
              console.log("Success value (parsed JSON):", parsed)
            } catch {
              console.log("Success value is not JSON")
            }
          } catch {
            console.log("Could not decode success value as UTF-8")
          }
        }
      }
    }

    return result
  } catch (error) {
    console.error(`✗ Sign method failed:`, (error as Error).message)

    // Try to extract more details from the error
    if (error && typeof error === "object") {
      const err = error as any
      if (err.type) {
        console.error("Error type:", err.type)
      }
      if (err.kind) {
        console.error("Error kind:", err.kind)
      }
      if (err.message) {
        console.error("Error details:", err.message)
      }
    }

    throw error
  }
}

async function testLegacySignFormat(account: Account) {
  console.log("\n=== Testing Legacy Sign Format ===")

  try {
    // Test legacy format with payload and key_version
    const legacyArgs = {
      path: TEST_PATH,
      payload: TEST_HASH,
      key_version: TEST_DOMAIN_ID,
    }

    console.log("Legacy sign request args:", JSON.stringify(legacyArgs, null, 2))

    const result = await account.functionCall({
      contractId: MPC_CONTRACT_TESTNET,
      methodName: "sign",
      args: legacyArgs,
      gas: 300000000000000n,
      attachedDeposit: 0n,
    })

    console.log("✓ Legacy format sign succeeded!")
    console.log("Result:", JSON.stringify(result, null, 2))

    return result
  } catch (error) {
    console.error(`✗ Legacy sign format failed:`, (error as Error).message)
    throw error
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

    // Test actual signing - this is the main exploration
    let signResult = null
    try {
      signResult = await testMPCSignMethod(account)
    } catch (error) {
      console.log("Modern format failed, trying legacy format...")
      try {
        signResult = await testLegacySignFormat(account)
      } catch (legacyError) {
        console.error("Both modern and legacy formats failed")
        throw legacyError
      }
    }

    console.log("\n=== Summary ===")
    console.log("✓ Successfully tested MPC sign method")
    console.log("✓ Got real signature response format")
    console.log("Next steps:")
    console.log("1. Update TypeScript types based on actual response")
    console.log("2. Implement proper response parsing in Contract class")
    console.log("3. Add error handling for different failure scenarios")
  } catch (error) {
    console.error("\n=== Exploration Failed ===")
    console.error("Error:", (error as Error).message)
    console.log("\nNext steps:")
    console.log("1. Check account has enough balance for gas fees")
    console.log("2. Verify MPC contract is accessible")
    console.log("3. Check if signing requires special permissions")
  }
}

if (import.meta.main) {
  main().catch(console.error)
}
