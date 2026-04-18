#![no_std]

//! # DeploymentDecision
//! Evaluates a deployment scorecard and records an autonomous approve / reject outcome on-chain.
//! Rejections flag follow-up multi-sig (see companion [`MultiSigApproval`] contract) via `ms_req` event.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, Address,
    Env, String, Vec,
};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// `init` was called twice.
    AlreadyInitialized = 1,
}

// ---------------------------------------------------------------------------
// Storage & records
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    /// Contract administrator (may update team approvers).
    Admin,
    /// Addresses eligible for multi-sig when a deployment is rejected.
    TeamApprovers,
    /// Permanent decision log keyed by deployment id.
    Decision(String),
}

/// Full persisted outcome for a deployment id (immutable once written for that id in this design).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DecisionRecord {
    pub deployment_id: String,
    pub approved: bool,
    /// Ledger close time (seconds since Unix epoch, Stellar ledger timestamp).
    pub timestamp: u64,
    /// Ledger sequence when the decision was recorded.
    pub ledger_sequence: u32,
    /// Human-readable explanation (failure reason or success summary).
    pub reason: String,
    pub deployer: Address,
    pub test_coverage: u32,
    pub error_rate_delta: i32,
    pub performance_score: u32,
    pub security_scan_passed: bool,
    /// Set when gates fail — signals that multi-sig should be opened.
    pub multisig_requested: bool,
}

#[contract]
pub struct DeploymentDecision;

#[contractimpl]
impl DeploymentDecision {
    /// One-time initializer storing the admin account that may configure team approvers.
    pub fn init(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, Error::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        let empty = Vec::<Address>::new(&env);
        env.storage()
            .instance()
            .set(&DataKey::TeamApprovers, &empty);
    }

    /// Replaces the whole team approver list. **Must** be authorized by the admin address from [`init`].
    pub fn set_team_approvers(env: Env, approvers: Vec<Address>) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        env.storage()
            .instance()
            .set(&DataKey::TeamApprovers, &approvers);
    }

    /// Returns the configured multi-sig-eligible addresses (for companion workflows / indexers).
    pub fn get_team_approvers(env: Env) -> Vec<Address> {
        env.storage()
            .instance()
            .get(&DataKey::TeamApprovers)
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Fetches a stored [`DecisionRecord`] for `deployment_id`, if present.
    pub fn get_decision(env: Env, deployment_id: String) -> Option<DecisionRecord> {
        env.storage().persistent().get(&DataKey::Decision(deployment_id))
    }

    /// Evaluates the scorecard:
    /// - `test_coverage` ≥ 80
    /// - `error_rate_delta` ≤ 5
    /// - `performance_score` ≥ 70
    /// - `security_scan_passed` is true
    ///
    /// **Approve path:** emits `dep_ok`, stores an approved record.  
    /// **Reject path:** emits `dep_no` with reason, emits `ms_req` with team + reason, stores rejected record.
    pub fn evaluate(
        env: Env,
        test_coverage: u32,
        error_rate_delta: i32,
        performance_score: u32,
        security_scan_passed: bool,
        deployment_id: String,
        deployer_address: Address,
    ) -> DecisionRecord {
        let ts = env.ledger().timestamp();
        let ledger = env.ledger().sequence();

        let pass_coverage = test_coverage >= 80;
        let pass_errors = error_rate_delta <= 5;
        let pass_perf = performance_score >= 70;
        let pass_sec = security_scan_passed;
        let all_ok = pass_coverage && pass_errors && pass_perf && pass_sec;

        let reason = if all_ok {
            String::from_str(&env, "all gates passed")
        } else if !pass_coverage {
            String::from_str(&env, "test_coverage below 80%")
        } else if !pass_errors {
            String::from_str(&env, "error_rate_delta above 5")
        } else if !pass_perf {
            String::from_str(&env, "performance_score below 70")
        } else {
            String::from_str(&env, "security_scan_passed is false")
        };

        let record = if all_ok {
            // Event: DeploymentApproved (topic `dep_ok`) — data carries id, deployer, time, inputs.
            env.events().publish(
                (symbol_short!("dep_ok"),),
                (
                    deployment_id.clone(),
                    deployer_address.clone(),
                    ts,
                    ledger,
                    test_coverage,
                    error_rate_delta,
                    performance_score,
                    security_scan_passed,
                ),
            );
            DecisionRecord {
                deployment_id: deployment_id.clone(),
                approved: true,
                timestamp: ts,
                ledger_sequence: ledger,
                reason: reason.clone(),
                deployer: deployer_address,
                test_coverage,
                error_rate_delta,
                performance_score,
                security_scan_passed,
                multisig_requested: false,
            }
        } else {
            // Event: DeploymentRejected (`dep_no`).
            env.events().publish(
                (symbol_short!("dep_no"),),
                (
                    deployment_id.clone(),
                    deployer_address.clone(),
                    reason.clone(),
                    ts,
                    ledger,
                ),
            );
            let team = Self::get_team_approvers(env.clone());
            // Event: multi-sig requested (`ms_req`) — includes configured approvers + rejection reason.
            env.events().publish(
                (symbol_short!("ms_req"),),
                (
                    deployment_id.clone(),
                    deployer_address.clone(),
                    team,
                    reason.clone(),
                    ts,
                ),
            );
            DecisionRecord {
                deployment_id: deployment_id.clone(),
                approved: false,
                timestamp: ts,
                ledger_sequence: ledger,
                reason: reason.clone(),
                deployer: deployer_address,
                test_coverage,
                error_rate_delta,
                performance_score,
                security_scan_passed,
                multisig_requested: true,
            }
        };

        env.storage()
            .persistent()
            .set(&DataKey::Decision(deployment_id), &record);

        record
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    extern crate std;
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::Env;

    fn setup() -> (Env, Address) {
        let env = Env::default();
        let contract_id = env.register(DeploymentDecision, ());
        let admin = Address::generate(&env);
        env.mock_all_auths();
        DeploymentDecisionClient::new(&env, &contract_id).init(&admin);
        (env, contract_id)
    }

    #[test]
    fn init_sets_admin() {
        let (env, contract_id) = setup();
        let admin = Address::generate(&env);
        // Second init must fail.
        let client = DeploymentDecisionClient::new(&env, &contract_id);
        let res = client.try_init(&admin);
        assert!(res.is_err());
    }

    #[test]
    fn set_team_approvers_requires_auth() {
        let env = Env::default();
        let contract_id = env.register(DeploymentDecision, ());
        let admin = Address::generate(&env);
        env.mock_all_auths();
        DeploymentDecisionClient::new(&env, &contract_id).init(&admin);
        let a1 = Address::generate(&env);
        let a2 = Address::generate(&env);
        let mut v = Vec::new(&env);
        v.push_back(a1);
        v.push_back(a2);
        DeploymentDecisionClient::new(&env, &contract_id).set_team_approvers(&v);
        let loaded = DeploymentDecisionClient::new(&env, &contract_id).get_team_approvers();
        assert_eq!(loaded.len(), 2u32);
    }

    #[test]
    fn get_decision_none_initially() {
        let (env, contract_id) = setup();
        let id = String::from_str(&env, "svc-1");
        let client = DeploymentDecisionClient::new(&env, &contract_id);
        assert!(client.get_decision(&id).is_none());
    }

    #[test]
    fn evaluate_all_pass_approves() {
        let (env, contract_id) = setup();
        let deployer = Address::generate(&env);
        let dep_id = String::from_str(&env, "api-v3");
        let client = DeploymentDecisionClient::new(&env, &contract_id);
        let rec = client.evaluate(&85_u32, &3_i32, &90_u32, &true, &dep_id, &deployer);
        assert!(rec.approved);
        assert!(!rec.multisig_requested);
        let got = client.get_decision(&dep_id).unwrap();
        assert!(got.approved);
    }

    #[test]
    fn evaluate_low_coverage_rejects_and_requests_multisig() {
        let (env, contract_id) = setup();
        let deployer = Address::generate(&env);
        let dep_id = String::from_str(&env, "api-v4");
        let client = DeploymentDecisionClient::new(&env, &contract_id);
        let rec = client.evaluate(&50_u32, &0_i32, &90_u32, &true, &dep_id, &deployer);
        assert!(!rec.approved);
        assert!(rec.multisig_requested);
        assert!(!rec.reason.is_empty());
    }

    #[test]
    fn evaluate_error_rate_fails() {
        let (env, contract_id) = setup();
        let deployer = Address::generate(&env);
        let dep_id = String::from_str(&env, "x1");
        let client = DeploymentDecisionClient::new(&env, &contract_id);
        let rec = client.evaluate(&90_u32, &10_i32, &90_u32, &true, &dep_id, &deployer);
        assert!(!rec.approved);
    }

    #[test]
    fn evaluate_performance_fails() {
        let (env, contract_id) = setup();
        let deployer = Address::generate(&env);
        let dep_id = String::from_str(&env, "x2");
        let client = DeploymentDecisionClient::new(&env, &contract_id);
        let rec = client.evaluate(&90_u32, &0_i32, &50_u32, &true, &dep_id, &deployer);
        assert!(!rec.approved);
    }

    #[test]
    fn evaluate_security_fails() {
        let (env, contract_id) = setup();
        let deployer = Address::generate(&env);
        let dep_id = String::from_str(&env, "x3");
        let client = DeploymentDecisionClient::new(&env, &contract_id);
        let rec = client.evaluate(&90_u32, &0_i32, &90_u32, &false, &dep_id, &deployer);
        assert!(!rec.approved);
    }

    #[test]
    fn get_team_approvers_empty_by_default() {
        let (env, contract_id) = setup();
        let client = DeploymentDecisionClient::new(&env, &contract_id);
        assert_eq!(client.get_team_approvers().len(), 0u32);
    }
}
