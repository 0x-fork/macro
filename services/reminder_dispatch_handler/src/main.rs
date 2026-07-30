#![recursion_limit = "256"]

use std::sync::Arc;

use aws_lambda_events::event::eventbridge::EventBridgeEvent;
use lambda_runtime::{Error, LambdaEvent, run, service_fn};
use reminder_dispatch_handler::AppContext;

#[tokio::main]
async fn main() -> Result<(), Error> {
    macro_entrypoint::MacroEntrypoint::default().init();

    let context = Arc::new(AppContext::from_env().await?);

    let func = service_fn(move |event: LambdaEvent<EventBridgeEvent>| {
        let context = context.clone();
        async move { handler(context, event).await }
    });

    run(func).await
}

#[tracing::instrument(skip(context, _event), err)]
async fn handler(
    context: Arc<AppContext>,
    _event: LambdaEvent<EventBridgeEvent>,
) -> Result<(), Error> {
    let summary = context.dispatch_due().await?;

    // Only worth a line when the sweep did something; the schedule fires every
    // minute and most sweeps are empty.
    if summary != Default::default() {
        tracing::info!(
            claimed = summary.claimed,
            delivered = summary.delivered,
            failed = summary.failed,
            skipped_recurring = summary.skipped_recurring,
            "dispatched due reminders",
        );
    }

    Ok(())
}
