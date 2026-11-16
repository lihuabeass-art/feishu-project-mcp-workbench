#[test]
fn unsafe_clear_is_rejected_without_writing() {
    let (session, dir) = fixture();
    let fake = Arc::new(Fake { calls: Mutex::new(vec![]), fail_detail: AtomicBool::new(false), partial_page: AtomicBool::new(false), receipts: Mutex::new(vec![]) });
    let installed = crate::remote::install_test_client(&session.config, &session.credential().unwrap(), Box::new(fake.clone()));
    let mut plan = ScheduleSession::load(&session).unwrap();
    let sid = plan.view.session_id.clone();
    let target = plan.view.targets.iter().find(|target| target.read_only_reason.is_none()).unwrap().clone();
    for (start, end) in [("", ""), ("2026-11-16", "2026-11-16")] {
        let error = plan.sync(&session, &sid, vec![Change { id: target.id.clone(), start: start.into(), end: end.into(), cancel: true }]).unwrap_err();
        assert!(error.to_string().contains("清空排期暂不可用"));
        assert!(session.store.recent_actions("p|story|1", 10).unwrap().is_empty());
        assert!(!fake.calls.lock().unwrap().iter().any(|(tool, _)| tool == "update_node"));
        assert_eq!(plan.view.targets.iter().find(|t| t.id == target.id).unwrap().baseline, target.baseline);
    }
    drop(installed); drop(plan); drop(session);
    std::fs::remove_dir_all(dir).unwrap();
}
