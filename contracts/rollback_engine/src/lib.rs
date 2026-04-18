#![no_std]

//! # RollbackEngine
//! Records rollback decisions driven by AUTO thresholds or MANUAL initiator action,
//! with durable metrics + timestamps and explicit completion events.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, Address,
    Env, String, Symbol,
};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// AUTO path only: metric thresholds were not met — rollback not justified.
    AutoCriteriaNotMet = 1,
    /// `triggered_by` must be `AUTO` or `MANUAL`.
    InvalidTrigger = 2,
    /// Deployment already marked `ROLLED_BACK`.
    AlreadyRolledBack = 3,
}

// ---------------------------------------------------------------------------
// On-chain status + rollback record
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DeploymentChainStatus {
    Active,
    RolledBack,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Status(String),
    Rollback(String),
}

/// Immutable rollback audit row (final state has `finished == true`).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RollbackRecord {
    pub deployment_id: String,
    pub error_rate: u32,
    pub latency_ms: u32,
    pub crash_count: u32,
    /// `AUTO` or `MANUAL` (see [`AUTO`] and [`MANUAL`]).
    pub triggered_by: Symbol,
    pub initiator: Address,
    pub timestamp_trigger: u64,
    pub ledger_trigger: u32,
    pub timestamp_complete: u64,
    pub ledger_complete: u32,
    pub finished: bool,
}

#[contract]
pub struct RollbackEngine;

/// Symbol for automatic rollback (SLO breach).
pub const AUTO: Symbol = symbol_short!("AUTO");
/// Symbol for operator-initiated rollback.
pub const MANUAL: Symbol = symbol_short!("MANUAL");

#[contractimpl]
impl RollbackEngine {
    /// Returns stored chain status for `deployment_id`, defaulting to [`DeploymentChainStatus::Active`].
    pub fn get_status(env: Env, deployment_id: String) -> DeploymentChainStatus {
        env.storage()
            .persistent()
            .get(&DataKey::Status(deployment_id))
            .unwrap_or(DeploymentChainStatus::Active)
    }

    /// Returns the last stored [`RollbackRecord`] for a deployment, if any.
    pub fn get_rollback_record(env: Env, deployment_id: String) -> Option<RollbackRecord> {
        env.storage().persistent().get(&DataKey::Rollback(deployment_id))
    }

    /// Evaluates rollback rules, emits events, and persists status + record.
    ///
    /// **AUTO:** rollback proceeds only if `error_rate > 10` OR `latency_ms > 2000` OR `crash_count > 5`.  
    /// **MANUAL:** rollback always proceeds (still records metrics).  
    /// Every call must be signed by `initiator`.
    pub fn process_rollback(
        env: Env,
        deployment_id: String,
        error_rate: u32,
        latency_ms: u32,
        crash_count: u32,
        triggered_by: Symbol,
        initiator: Address,
    ) -> RollbackRecord {
        initiator.require_auth();

        if triggered_by != AUTO && triggered_by != MANUAL {
            panic_with_error!(&env, Error::InvalidTrigger);
        }

        if triggered_by == AUTO {
            let breach = error_rate > 10 || latency_ms > 2000 || crash_count > 5;
            if !breach {
                panic_with_error!(&env, Error::AutoCriteriaNotMet);
            }
        }

        match Self::get_status(env.clone(), deployment_id.clone()) {
            DeploymentChainStatus::RolledBack => panic_with_error!(&env, Error::AlreadyRolledBack),
            DeploymentChainStatus::Active => {}
        }

        let ts0 = env.ledger().timestamp();
        let lg0 = env.ledger().sequence();

        // Event: RollbackTriggered (`rb_trig`) — full metric snapshot at trigger time.
        env.events().publish(
            (symbol_short!("rb_trig"),),
            (
                deployment_id.clone(),
                error_rate,
                latency_ms,
                crash_count,
                triggered_by.clone(),
                initiator.clone(),
                ts0,
                lg0,
            ),
        );

        let ts1 = env.ledger().timestamp();
        let lg1 = env.ledger().sequence();

        let record = RollbackRecord {
            deployment_id: deployment_id.clone(),
            error_rate,
            latency_ms,
            crash_count,
            triggered_by: triggered_by.clone(),
            initiator: initiator.clone(),
            timestamp_trigger: ts0,
            ledger_trigger: lg0,
            timestamp_complete: ts1,
            ledger_complete: lg1,
            finished: true,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Rollback(deployment_id.clone()), &record);
        env.storage().persistent().set(
            &DataKey::Status(deployment_id.clone()),
            &DeploymentChainStatus::RolledBack,
        );

        // Event: RollbackComplete (`rb_done`).
        env.events().publish(
            (symbol_short!("rb_done"),),
            (
                deployment_id.clone(),
                initiator.clone(),
                ts1,
                lg1,
                triggered_by,
            ),
        );

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

    #[test]
    fn get_status_defaults_active() {
        let env = Env::default();
        let cid = env.register(RollbackEngine, ());
        let client = RollbackEngineClient::new(&env, &cid);
        let id = String::from_str(&env, "svc-1");
        assert!(matches!(
            client.get_status(&id),
            DeploymentChainStatus::Active
        ));
    }

    #[test]
    fn get_rollback_record_none() {
        let env = Env::default();
        let cid = env.register(RollbackEngine, ());
        let client = RollbackEngineClient::new(&env, &cid);
        let id = String::from_str(&env, "svc-2");
        assert!(client.get_rollback_record(&id).is_none());
    }

    #[test]
    fn manual_rollback_always() {
        let env = Env::default();
        let cid = env.register(RollbackEngine, ());
        let client = RollbackEngineClient::new(&env, &cid);
        let id = String::from_str(&env, "svc-3");
        let who = Address::generate(&env);
        env.mock_all_auths();
        let rec = client.process_rollback(&id, &0_u32, &0_u32, &0_u32, &MANUAL, &who);
        assert!(rec.finished);
        assert_eq!(rec.triggered_by, MANUAL);
        assert!(matches!(
            client.get_status(&id),
            DeploymentChainStatus::RolledBack
        ));
    }

    #[test]
    fn auto_rollback_on_error_rate() {
        let env = Env::default();
        let cid = env.register(RollbackEngine, ());
        let client = RollbackEngineClient::new(&env, &cid);
        let id = String::from_str(&env, "svc-4");
        let who = Address::generate(&env);
        env.mock_all_auths();
        let rec = client.process_rollback(&id, &11_u32, &100_u32, &0_u32, &AUTO, &who);
        assert_eq!(rec.error_rate, 11);
        assert!(rec.finished);
    }

    #[test]
    fn auto_rollback_on_latency() {
        let env = Env::default();
        let cid = env.register(RollbackEngine, ());
        let client = RollbackEngineClient::new(&env, &cid);
        let id = String::from_str(&env, "svc-5");
        let who = Address::generate(&env);
        env.mock_all_auths();
        let rec = client.process_rollback(&id, &0_u32, &2001_u32, &0_u32, &AUTO, &who);
        assert_eq!(rec.latency_ms, 2001);
    }

    #[test]
    fn auto_rollback_on_crashes() {
        let env = Env::default();
        let cid = env.register(RollbackEngine, ());
        let client = RollbackEngineClient::new(&env, &cid);
        let id = String::from_str(&env, "svc-6");
        let who = Address::generate(&env);
        env.mock_all_auths();
        let rec = client.process_rollback(&id, &0_u32, &0_u32, &6_u32, &AUTO, &who);
        assert_eq!(rec.crash_count, 6);
    }

    #[test]
    fn auto_fails_when_thresholds_ok() {
        let env = Env::default();
        let cid = env.register(RollbackEngine, ());
        let client = RollbackEngineClient::new(&env, &cid);
        let id = String::from_str(&env, "svc-7");
        let who = Address::generate(&env);
        env.mock_all_auths();
        let r = client.try_process_rollback(&id, &10_u32, &2000_u32, &5_u32, &AUTO, &who);
        assert!(r.is_err());
    }

    #[test]
    fn double_rollback_fails() {
        let env = Env::default();
        let cid = env.register(RollbackEngine, ());
        let client = RollbackEngineClient::new(&env, &cid);
        let id = String::from_str(&env, "svc-8");
        let who = Address::generate(&env);
        env.mock_all_auths();
        client.process_rollback(&id, &0_u32, &0_u32, &0_u32, &MANUAL, &who);
        let r = client.try_process_rollback(&id, &0_u32, &0_u32, &0_u32, &MANUAL, &who);
        assert!(r.is_err());
    }

    #[test]
    fn invalid_trigger_fails() {
        let env = Env::default();
        let cid = env.register(RollbackEngine, ());
        let client = RollbackEngineClient::new(&env, &cid);
        let id = String::from_str(&env, "svc-9");
        let who = Address::generate(&env);
        env.mock_all_auths();
        let bad = symbol_short!("WHAT");
        let r = client.try_process_rollback(&id, &0_u32, &0_u32, &0_u32, &bad, &who);
        assert!(r.is_err());
    }
}
