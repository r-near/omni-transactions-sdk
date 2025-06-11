/**
 * Experimental file to explore MPC contract RPC request/response formats
 * Based on signature.rs structures from the NEAR MPC contract
 */

import { Account } from "@near-js/accounts"
import { JsonRpcProvider } from "@near-js/providers"

// From signature.rs analysis:
//
// SignRequestArgs (JSON input):
// - path: String
// - payload_v2: Option<Payload> OR deprecated_payload: Option<[u8; 32]>
// - domain_id: Option<DomainId> OR deprecated_key_version: Option<u32>
//
// Payload enum:
// - Ecdsa(Bytes<32, 32>) - exactly 32 bytes, hex-encoded in JSON
// - Eddsa(Bytes<32, 1232>) - 32-1232 bytes, hex-encoded in JSON

// Test data - ECDSA hash (32 bytes) for signature request
const TEST_HASH = "a0b1c2d3e4f5061728394a5b6c7d8e9f0a1b2c3d4e5f6071829304a5b6c7d8e9f"
const TEST_PATH = "ethereum-1"
const TEST_PREDECESSOR = "test.near"

// Contract addresses
const MPC_CONTRACT_TESTNET = "v1.signer-prod.testnet"

// NEAR connection setup
const provider = new JsonRpcProvider({ url: "https://rpc.testnet.near.org" })

interface SignRequestArgs {
  path: string
  // Modern format
  payload_v2?: {
    Ecdsa?: string // hex-encoded 32 bytes
    Eddsa?: string // hex-encoded bytes
  }
  domain_id?: number
  // Legacy format
  payload?: string // hex-encoded 32 bytes (deprecated)
  key_version?: number // deprecated
}

// Experiment 1: Try to understand the sign method call format
async function exploreMPCSignRequest() {
  console.log("=== MPC Sign Request Format Exploration ===")

  // Modern format with payload_v2 and domain_id
  const modernRequest: SignRequestArgs = {
    path: TEST_PATH,
    payload_v2: {
      Ecdsa: TEST_HASH,
    },
    domain_id: 0, // Assuming domain 0 for now
  }

  // Legacy format with deprecated fields
  const legacyRequest: SignRequestArgs = {
    path: TEST_PATH,
    payload: TEST_HASH,
    key_version: 0,
  }

  console.log("Modern request format:", JSON.stringify(modernRequest, null, 2))
  console.log("Legacy request format:", JSON.stringify(legacyRequest, null, 2))

  console.log("\n--- Expected signature request structure ---")
  console.log("Note: Actual signing requires proper account setup and gas fees")
  console.log("For now, we're just exploring the expected request format")
}

// Experiment 2: Understand what a real signature response looks like
async function exploreMPCSignResponse() {
  console.log("=== MPC Sign Response Format Exploration ===")

  // Based on SignatureResult<T, E> enum from Rust:
  // - Ok(T) for successful signatures
  // - Err(E) for errors

  // Need to figure out:
  // 1. What does T look like for ECDSA signatures?
  // 2. What error types are in E?
  // 3. Is it a standard secp256k1 signature format (r, s, recovery_id)?

  console.log("Need to make actual RPC calls to see response format")
}

// Experiment 3: Test different domain IDs and paths
async function exploreDomainAndPaths() {
  console.log("=== Domain ID and Path Exploration ===")

  const testCases = [
    { domain_id: 0, path: "ethereum-1" },
    { domain_id: 1, path: "bitcoin-1" },
    { domain_id: 0, path: "test-key" },
    { domain_id: 0, path: "custom-derivation-path" },
  ]

  for (const testCase of testCases) {
    console.log(`Domain ${testCase.domain_id}, Path: ${testCase.path}`)
    // TODO: Test each combination
  }
}

// Experiment 4: Explore available contract methods
async function exploreContractMethods() {
  console.log("=== Contract Methods Exploration ===")

  try {
    // For view functions, we can use any account ID - doesn't need to exist
    const account = new Account("explorer", provider)

    // Try common view methods to understand contract interface
    const methods = [
      "public_key",
      "derived_public_key",
      "latest_key_version",
      "get_request",
      "get_requests",
    ]

    for (const method of methods) {
      try {
        console.log(`\nTrying method: ${method}`)
        let result: unknown

        if (method === "derived_public_key") {
          // This method needs arguments
          result = await account.viewFunction({
            contractId: MPC_CONTRACT_TESTNET,
            methodName: method,
            args: {
              predecessor: TEST_PREDECESSOR,
              path: TEST_PATH,
            },
          })
        } else {
          result = await account.viewFunction({
            contractId: MPC_CONTRACT_TESTNET,
            methodName: method,
            args: {},
          })
        }

        console.log(
          `✓ ${method}:`,
          typeof result === "string" ? result : JSON.stringify(result, null, 2),
        )
      } catch (error) {
        console.log(`✗ ${method} failed:`, (error as Error).message)
      }
    }
  } catch (error) {
    console.error("Error exploring contract methods:", (error as Error).message)
  }
}

// Main exploration function
async function main() {
  console.log("Starting MPC RPC exploration...")
  console.log("Network: testnet")
  console.log("Contract:", MPC_CONTRACT_TESTNET)
  console.log()

  await exploreContractMethods()
  await exploreMPCSignRequest()
  await exploreMPCSignResponse()
  await exploreDomainAndPaths()

  console.log("\nNext steps:")
  console.log("1. ✓ Add @near-js/* dependencies")
  console.log("2. ✓ Make actual RPC calls to testnet MPC contract")
  console.log("3. Set up test account for function calls")
  console.log("4. Analyze real request/response formats")
  console.log("5. Design Contract class interface")
}

if (import.meta.main) {
  main().catch(console.error)
}
