#![no_std]

//! # MultiSigApproval
//! Tracks per-deployment approval sessions: registered approvers, quorum threshold,
//! ledger-based expiry, and emits completion or expiry events.

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
    /// Session already exists for this deployment id.
    SessionExists = 1,
    /// No session for this deployment id.
    NoSession = 2,
    /// Caller is not in the registered approver list.
    NotApprover = 3,
    /// Session already completed — no further approvals.
    AlreadyComplete = 4,
    /// Session already marked expired.
    AlreadyExpired = 5,
    /// `required_approvals` is zero or exceeds approver count.
    InvalidThreshold = 6,
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Session(String),
}

/// One multi-sig session bound to a single deployment id.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ApprovalSession {
    pub deployment_id: String,
    pub required_approvals: u32,
    pub approvers: Vec<Address>,
    /// Ledger sequence after which approvals are no longer accepted (inclusive check uses `>`).
    pub expiry_ledger: u32,
    /// Distinct approver addresses in order of submission.
    pub approvals: Vec<Address>,
    pub complete: bool,
    pub expired: bool,
}

/// Record of a single approval vote (address + ledger + timestamp).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ApprovalVote {
    pub approver: Address,
    pub ledger: u32,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKeyVote {
    /// Per-deployment list of votes (append-only).
    Votes(String),
}

#[contract]
pub struct MultiSigApproval;

fn vec_contains_address(v: &Vec<Address>, a: &Address) -> bool {
    let mut i = 0u32;
    while i < v.len() {
        if v.get(i).unwrap() == *a {
            return true;
        }
        i += 1;
    }
    false
}

#[contractimpl]
impl MultiSigApproval {
    /// Opens a new approval session. Fails if a session for `deployment_id` already exists.
    pub fn create_session(
        env: Env,
        deployment_id: String,
        required_approvals: u32,
        approvers: Vec<Address>,
        expiry_ledger: u32,
    ) {
        if required_approvals == 0 || required_approvals > approvers.len() {
            panic_with_error!(&env, Error::InvalidThreshold);
        }
        let key = DataKey::Session(deployment_id.clone());
        if env.storage().persistent().has(&key) {
            panic_with_error!(&env, Error::SessionExists);
        }
        let session = ApprovalSession {
            deployment_id: deployment_id.clone(),
            required_approvals,
            approvers: approvers.clone(),
            expiry_ledger,
            approvals: Vec::new(&env),
            complete: false,
            expired: false,
        };
        env.storage().persistent().set(&key, &session);
        let empty_votes = Vec::<ApprovalVote>::new(&env);
        env.storage()
            .persistent()
            .set(&DataKeyVote::Votes(deployment_id), &empty_votes);
    }

    /// Returns the session struct for `deployment_id`, if any.
    pub fn get_session(env: Env, deployment_id: String) -> Option<ApprovalSession> {
        env.storage().persistent().get(&DataKey::Session(deployment_id))
    }

    /// Returns all recorded approval votes (with timestamps) for a deployment.
    pub fn get_approval_votes(env: Env, deployment_id: String) -> Vec<ApprovalVote> {
        env.storage()
            .persistent()
            .get(&DataKeyVote::Votes(deployment_id))
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Registers one approval from `approver` (must be in the session approver list, must authorize).
    /// - Emits `appr_ok` when threshold reached.
    /// - Emits `appr_xp` if the ledger is past `expiry_ledger` before threshold.
    pub fn approve(env: Env, deployment_id: String, approver: Address) {
        approver.require_auth();

        let key = DataKey::Session(deployment_id.clone());
        let mut session: ApprovalSession = match env.storage().persistent().get(&key) {
            Some(s) => s,
            None => panic_with_error!(&env, Error::NoSession),
        };

        if session.complete {
            panic_with_error!(&env, Error::AlreadyComplete);
        }
        if session.expired {
            panic_with_error!(&env, Error::AlreadyExpired);
        }

        let now_ledger = env.ledger().sequence();
        let now_ts = env.ledger().timestamp();

        // Past window: mark expired, emit ApprovalExpired (`appr_xp`), persist — do not panic
        // (panic would roll back the event + storage).
        if now_ledger > session.expiry_ledger {
            session.expired = true;
            env.storage().persistent().set(&key, &session);
            env.events().publish(
                (symbol_short!("appr_xp"),),
                (
                    deployment_id.clone(),
                    now_ledger,
                    session.expiry_ledger,
                    now_ts,
                ),
            );
            return;
        }

        if !vec_contains_address(&session.approvers, &approver) {
            panic_with_error!(&env, Error::NotApprover);
        }

        if vec_contains_address(&session.approvals, &approver) {
            return;
        }

        session.approvals.push_back(approver.clone());
        let vote = ApprovalVote {
            approver,
            ledger: now_ledger,
            timestamp: now_ts,
        };
        let mut votes = Self::get_approval_votes(env.clone(), deployment_id.clone());
        votes.push_back(vote);

        let count = session.approvals.len();
        if count >= session.required_approvals {
            session.complete = true;
            env.storage().persistent().set(&key, &session);
            env.storage()
                .persistent()
                .set(&DataKeyVote::Votes(deployment_id.clone()), &votes);
            env.events().publish(
                (symbol_short!("appr_ok"),),
                (deployment_id.clone(), now_ledger, now_ts, count),
            );
        } else {
            env.storage().persistent().set(&key, &session);
            env.storage()
                .persistent()
                .set(&DataKeyVote::Votes(deployment_id.clone()), &votes);
        }
    }

    /// Anyone may call to finalize expiry state after `expiry_ledger` without a quorum.
    /// Emits `appr_xp` once.
    pub fn finalize_expiry(env: Env, deployment_id: String) {
        let key = DataKey::Session(deployment_id.clone());
        let mut session: ApprovalSession = match env.storage().persistent().get(&key) {
            Some(s) => s,
            None => panic_with_error!(&env, Error::NoSession),
        };
        if session.complete {
            panic_with_error!(&env, Error::AlreadyComplete);
        }
        if session.expired {
            panic_with_error!(&env, Error::AlreadyExpired);
        }
        let now_ledger = env.ledger().sequence();
        let now_ts = env.ledger().timestamp();
        if now_ledger <= session.expiry_ledger {
            return;
        }
        if session.approvals.len() >= session.required_approvals {
            return;
        }
        session.expired = true;
        env.storage().persistent().set(&key, &session);
        env.events().publish(
            (symbol_short!("appr_xp"),),
            (
                deployment_id.clone(),
                now_ledger,
                session.expiry_ledger,
                now_ts,
            ),
        );
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
    use soroban_sdk::testutils::Ledger as _;
    use soroban_sdk::Env;

    #[test]
    fn create_session_stores_state() {
        let env = Env::default();
        let cid = env.register(MultiSigApproval, ());
        let client = MultiSigApprovalClient::new(&env, &cid);
        let dep = String::from_str(&env, "dep-a");
        let a1 = Address::generate(&env);
        let a2 = Address::generate(&env);
        let a3 = Address::generate(&env);
        let mut appr = Vec::new(&env);
        appr.push_back(a1.clone());
        appr.push_back(a2.clone());
        appr.push_back(a3.clone());
        client.create_session(&dep, &2_u32, &appr, &10_000_u32);
        let s = client.get_session(&dep).unwrap();
        assert_eq!(s.required_approvals, 2);
        assert!(!s.complete);
    }

    #[test]
    fn create_session_duplicate_fails() {
        let env = Env::default();
        let cid = env.register(MultiSigApproval, ());
        let client = MultiSigApprovalClient::new(&env, &cid);
        let dep = String::from_str(&env, "dep-b");
        let a1 = Address::generate(&env);
        let mut appr = Vec::new(&env);
        appr.push_back(a1.clone());
        client.create_session(&dep, &1_u32, &appr, &10_000_u32);
        let r = client.try_create_session(&dep, &1_u32, &appr, &10_000_u32);
        assert!(r.is_err());
    }

    #[test]
    fn approve_reaches_threshold() {
        let env = Env::default();
        let cid = env.register(MultiSigApproval, ());
        let client = MultiSigApprovalClient::new(&env, &cid);
        let dep = String::from_str(&env, "dep-c");
        let a1 = Address::generate(&env);
        let a2 = Address::generate(&env);
        let mut appr = Vec::new(&env);
        appr.push_back(a1.clone());
        appr.push_back(a2.clone());
        client.create_session(&dep, &2_u32, &appr, &10_000_u32);
        env.mock_all_auths();
        client.approve(&dep, &a1);
        client.approve(&dep, &a2);
        let s = client.get_session(&dep).unwrap();
        assert!(s.complete);
        assert_eq!(client.get_approval_votes(&dep).len(), 2u32);
    }

    #[test]
    fn approve_not_in_list_fails() {
        let env = Env::default();
        let cid = env.register(MultiSigApproval, ());
        let client = MultiSigApprovalClient::new(&env, &cid);
        let dep = String::from_str(&env, "dep-d");
        let a1 = Address::generate(&env);
        let outsider = Address::generate(&env);
        let mut appr = Vec::new(&env);
        appr.push_back(a1.clone());
        client.create_session(&dep, &1_u32, &appr, &10_000_u32);
        env.mock_all_auths();
        let r = client.try_approve(&dep, &outsider);
        assert!(r.is_err());
    }

    #[test]
    fn expiry_blocks_approval() {
        let env = Env::default();
        let cid = env.register(MultiSigApproval, ());
        let client = MultiSigApprovalClient::new(&env, &cid);
        let dep = String::from_str(&env, "dep-e");
        let a1 = Address::generate(&env);
        let mut appr = Vec::new(&env);
        appr.push_back(a1.clone());
        client.create_session(&dep, &1_u32, &appr, &5_u32);
        // Advance ledger past expiry.
        let mut info = env.ledger().get();
        info.sequence_number = 10;
        env.ledger().set(info);
        env.mock_all_auths();
        client.approve(&dep, &a1);
        let s = client.get_session(&dep).unwrap();
        assert!(s.expired);
    }

    #[test]
    fn finalize_expiry_emits() {
        let env = Env::default();
        let cid = env.register(MultiSigApproval, ());
        let client = MultiSigApprovalClient::new(&env, &cid);
        let dep = String::from_str(&env, "dep-f");
        let a1 = Address::generate(&env);
        let a2 = Address::generate(&env);
        let a3 = Address::generate(&env);
        let mut appr = Vec::new(&env);
        appr.push_back(a1.clone());
        appr.push_back(a2.clone());
        appr.push_back(a3.clone());
        client.create_session(&dep, &3_u32, &appr, &5_u32);
        let mut info = env.ledger().get();
        info.sequence_number = 100;
        env.ledger().set(info);
        client.finalize_expiry(&dep);
        let s = client.get_session(&dep).unwrap();
        assert!(s.expired);
    }

    #[test]
    fn invalid_threshold_zero_fails() {
        let env = Env::default();
        let cid = env.register(MultiSigApproval, ());
        let client = MultiSigApprovalClient::new(&env, &cid);
        let dep = String::from_str(&env, "dep-g");
        let a1 = Address::generate(&env);
        let mut appr = Vec::new(&env);
        appr.push_back(a1.clone());
        let r = client.try_create_session(&dep, &0_u32, &appr, &100_u32);
        assert!(r.is_err());
    }

    #[test]
    fn get_session_missing() {
        let env = Env::default();
        let cid = env.register(MultiSigApproval, ());
        let client = MultiSigApprovalClient::new(&env, &cid);
        let dep = String::from_str(&env, "nope");
        assert!(client.get_session(&dep).is_none());
    }
}
