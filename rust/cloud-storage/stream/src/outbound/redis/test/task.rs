use crate::outbound::redis::task_util::TaskBuilder;
use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{mpsc, oneshot};

#[tokio::test]
async fn test_task_runs_to_completion() {
    let (tx, rx) = oneshot::channel();

    let (_task, _id) = TaskBuilder::spawn(async move {
        tx.send(42).unwrap();
    });

    let result = tokio::time::timeout(Duration::from_secs(1), rx)
        .await
        .expect("task should complete within timeout")
        .expect("channel should not be dropped");

    assert_eq!(result, 42);
}

#[tokio::test]
async fn test_task_kill_aborts_running_task() {
    let (started_tx, started_rx) = oneshot::channel();
    let (abort_detected_tx, abort_detected_rx) = oneshot::channel();

    let (task, _id) = TaskBuilder::spawn(async move {
        started_tx.send(()).unwrap();

        // This will run forever unless aborted
        loop {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }

        // This line is unreachable, but if abort works, we never get here
        #[allow(unreachable_code)]
        {
            let _ = abort_detected_tx.send(());
        }
    });

    // Wait for task to start
    started_rx.await.expect("task should start");

    // Kill the task
    task.kill();

    // The abort_detected channel should be dropped (sender dropped due to abort)
    let result = tokio::time::timeout(Duration::from_millis(100), abort_detected_rx).await;

    match result {
        Ok(Err(_)) => {} // RecvError - sender dropped, task was aborted
        Ok(Ok(_)) => panic!("task should have been aborted, not completed normally"),
        Err(_) => panic!("timeout waiting for abort detection"),
    }
}

#[tokio::test]
async fn test_task_drop_aborts_task() {
    let (started_tx, started_rx) = oneshot::channel();
    let completed = Arc::new(AtomicBool::new(false));
    let completed_clone = completed.clone();

    {
        let (_task, _id) = TaskBuilder::spawn(async move {
            started_tx.send(()).unwrap();

            // Long-running task
            tokio::time::sleep(Duration::from_secs(10)).await;
            completed_clone.store(true, Ordering::SeqCst);
        });

        // Wait for task to start
        started_rx.await.expect("task should start");

        // Task is dropped here
    }

    // Give a moment for any cleanup
    tokio::time::sleep(Duration::from_millis(50)).await;

    // Task should NOT have completed (it was aborted on drop)
    assert!(
        !completed.load(Ordering::SeqCst),
        "task should be aborted on drop, not complete"
    );
}

#[tokio::test]
async fn test_drop_does_not_hang() {
    // This test ensures drop completes quickly even for long-running tasks
    let (started_tx, started_rx) = oneshot::channel();

    let drop_completed = Arc::new(AtomicBool::new(false));
    let drop_completed_clone = drop_completed.clone();

    let handle = tokio::spawn(async move {
        {
            let (_task, _id) = TaskBuilder::spawn(async move {
                started_tx.send(()).unwrap();
                // Simulate infinite task
                loop {
                    tokio::time::sleep(Duration::from_secs(1)).await;
                }
            });

            // Wait for inner task to start
            started_rx.await.unwrap();

            // _task dropped here - should not hang
        }
        drop_completed_clone.store(true, Ordering::SeqCst);
    });

    // The drop should complete almost instantly
    let result = tokio::time::timeout(Duration::from_millis(100), handle).await;

    assert!(result.is_ok(), "drop should not hang");
    assert!(
        drop_completed.load(Ordering::SeqCst),
        "code after drop should execute"
    );
}

#[tokio::test]
async fn test_task_with_mpsc_channel() {
    let (tx, mut rx) = mpsc::channel(10);

    let (task, _id) = TaskBuilder::spawn(async move {
        for i in 0..5 {
            tx.send(i).await.unwrap();
        }
    });

    let mut received = Vec::new();
    while let Some(val) = rx.recv().await {
        received.push(val);
    }

    assert_eq!(received, vec![0, 1, 2, 3, 4]);
    drop(task);
}

#[tokio::test]
async fn test_task_kill_closes_channels() {
    let (tx, mut rx) = mpsc::channel::<i32>(10);

    let (task, _id) = TaskBuilder::spawn(async move {
        loop {
            tx.send(1).await.unwrap();
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    });

    // Receive a few items
    for _ in 0..3 {
        let _ = tokio::time::timeout(Duration::from_millis(100), rx.recv())
            .await
            .expect("should receive")
            .expect("channel open");
    }

    // Kill the task
    task.kill();

    // Channel should eventually close (sender dropped)
    let result = tokio::time::timeout(Duration::from_millis(100), async {
        while rx.recv().await.is_some() {
            // Drain any buffered items
        }
    })
    .await;

    assert!(result.is_ok(), "channel should close after kill");
}

#[tokio::test]
async fn test_task_unique_ids() {
    let results: Vec<_> = (0..100)
        .map(|_| {
            TaskBuilder::spawn(async move { tokio::time::sleep(Duration::from_secs(1)).await })
        })
        .collect();

    let mut id_set = HashSet::new();
    for (_task, id) in &results {
        id_set.insert(id);
    }

    assert_eq!(id_set.len(), 100, "all tasks should have unique ids");
}

#[tokio::test]
async fn test_task_equality() {
    let (task1, id1) = TaskBuilder::spawn(async {});
    let (task2, id2) = TaskBuilder::spawn(async {});

    // Different tasks should have different ids
    assert_ne!(id1, id2);

    // Same id should be equal to itself
    assert_eq!(id1, id1);

    drop(task1);
    drop(task2);
}

#[tokio::test]
async fn test_multiple_kills_safe() {
    let (task, _id) = TaskBuilder::spawn(async {
        loop {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    });

    // Multiple kills should be safe
    task.kill();
    task.kill();
    task.kill();

    // Should not panic or hang
}

#[tokio::test]
async fn test_kill_already_completed_task() {
    let (tx, rx) = oneshot::channel();

    let (task, _id) = TaskBuilder::spawn(async move {
        tx.send(()).unwrap();
    });

    // Wait for completion
    rx.await.unwrap();

    // Small delay to ensure task is fully done
    tokio::time::sleep(Duration::from_millis(10)).await;

    // Killing an already-completed task should be safe
    task.kill();
}

#[tokio::test]
async fn test_concurrent_task_spawning() {
    let counter = Arc::new(AtomicUsize::new(0));
    let (done_tx, mut done_rx) = mpsc::channel(100);

    let mut tasks = Vec::new();

    for _ in 0..50 {
        let counter = counter.clone();
        let done_tx = done_tx.clone();

        let (task, _id) = TaskBuilder::spawn(async move {
            counter.fetch_add(1, Ordering::SeqCst);
            done_tx.send(()).await.unwrap();
        });
        tasks.push(task);
    }

    drop(done_tx); // Drop our sender so channel closes when all tasks done

    // Wait for all tasks to signal completion
    let mut completed = 0;
    while done_rx.recv().await.is_some() {
        completed += 1;
    }

    assert_eq!(completed, 50);
    assert_eq!(counter.load(Ordering::SeqCst), 50);
}

#[tokio::test]
async fn test_task_panic_handling() {
    let (started_tx, started_rx) = oneshot::channel();

    let (task, _id) = TaskBuilder::spawn(async move {
        started_tx.send(()).unwrap();
        panic!("intentional panic");
    });

    // Wait for task to start
    started_rx.await.unwrap();

    // Give time for panic to propagate
    tokio::time::sleep(Duration::from_millis(50)).await;

    // Killing a panicked task should be safe
    task.kill();

    // Drop should also be safe
    drop(task);
}
