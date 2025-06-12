// User contract API
#[near_bindgen]
impl VersionedMpcContract {
    /// `key_version` must be less than or equal to the value at `latest_key_version`
    /// To avoid overloading the network with too many requests,
    /// we ask for a small deposit for each signature request.
    /// The fee changes based on how busy the network is.
    #[handle_result]
    #[payable]
    pub fn sign(&mut self, request: SignRequestArgs) {
        log!(
            "sign: predecessor={:?}, request={:?}",
            env::predecessor_account_id(),
            request
        );

        let request: SignRequest = request.try_into().unwrap();
        let Ok(public_key) = self.public_key(Some(request.domain_id)) else {
            env::panic_str(
                &InvalidParameters::DomainNotFound
                    .message(format!(
                        "No key was found for the provided domain_id {:?}.",
                        request.domain_id,
                    ))
                    .to_string(),
            );
        };

        let curve_type = public_key.curve_type();

        // ensure the signer sent a valid signature request
        // It's important we fail here because the MPC nodes will fail in an identical way.
        // This allows users to get the error message
        match &curve_type {
            CurveType::SECP256K1 => {
                let hash = *request.payload.as_ecdsa().expect("Payload is not Ecdsa");
                k256::Scalar::from_repr(hash.into())
                    .into_option()
                    .expect("Ecdsa payload cannot be converted to Scalar");
            }
            CurveType::ED25519 => {
                request.payload.as_eddsa().expect("Payload is not EdDSA");
            }
        }

        // Make sure sign call will not run out of gas doing yield/resume logic
        if env::prepaid_gas() < GAS_FOR_SIGN_CALL {
            env::panic_str(
                &InvalidParameters::InsufficientGas
                    .message(format!(
                        "Provided: {}, required: {}",
                        env::prepaid_gas(),
                        GAS_FOR_SIGN_CALL
                    ))
                    .to_string(),
            );
        }

        let predecessor = env::predecessor_account_id();
        // Check deposit and refund if required
        let deposit = env::attached_deposit();
        match deposit.checked_sub(NearToken::from_yoctonear(1)) {
            None => {
                env::panic_str(
                    &InvalidParameters::InsufficientDeposit
                        .message(format!(
                            "Require a deposit of 1 yoctonear, found: {}",
                            deposit.as_yoctonear(),
                        ))
                        .to_string(),
                );
            }
            Some(diff) => {
                if diff > NearToken::from_yoctonear(0) {
                    log!("refund excess deposit {diff} to {predecessor}");
                    Promise::new(predecessor.clone()).transfer(diff);
                }
            }
        }

        let request = SignatureRequest::new(
            request.domain_id,
            request.payload,
            &predecessor,
            &request.path,
        );

        let Self::V1(mpc_contract) = self else {
            env::panic_str("expected V1")
        };

        env::log_str(&serde_json::to_string(&near_sdk::env::random_seed_array()).unwrap());

        let promise_index = env::promise_yield_create(
            "return_signature_and_clean_state_on_success",
            &serde_json::to_vec(&(&request,)).unwrap(),
            RETURN_SIGNATURE_AND_CLEAN_STATE_ON_SUCCESS_CALL_GAS,
            GasWeight(0),
            DATA_ID_REGISTER,
        );

        // Store the request in the contract's local state
        let return_sig_id: CryptoHash = env::read_register(DATA_ID_REGISTER)
            .expect("read_register failed")
            .try_into()
            .expect("conversion to CryptoHash failed");
        if mpc_contract.add_request(&request, return_sig_id) {
            log!("request already present, overriding callback.")
        }

        env::promise_return(promise_index);
    }
}
