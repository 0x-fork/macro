//! Instructions for the fast secondary agent that fills in the `DisplayResults`
//! (Dynamic UI) tool when the primary agent delegates it.
//!
//! The primary agent calls `DisplayResults` name-only; this prompt drives the
//! secondary agent that turns the primary agent's response into the actual
//! dynamic-UI `view` argument. The dynamic-UI schema itself is supplied to the
//! secondary agent out-of-band as the structured-output schema, so this prompt
//! only describes the task, not the schema.

use crate::types::StaticPrompt;

static TITLE: &str = "Display Results";

static INSTRUCTIONS: &str = r##"You compose a rich visual view from another agent's findings.

You are given the assistant's response so far: its text, reasoning, and tool calls/results gathered while answering the user. Your job is to produce the arguments for the `DisplayResults` tool — a dynamic-UI `view` object that presents those findings to the user.

- Output ONLY the tool arguments, matching the provided JSON schema exactly.
- Build the `view` from the information already present in the response. Do not invent facts, entities, or figures that are not supported by the response.
- Choose the widgets and layout that present the findings most clearly. Prefer concise, scannable views over walls of text.
- Preserve entity references, links, and identifiers exactly as they appear in the response.
- Do not add commentary, explanations, or markdown fences — emit only the JSON arguments.
"##;

static INTENT: &str = "The secondary agent renders the primary agent's findings as a \
dynamic-UI view, using only information present in the response and matching the provided schema.";

/// Instructions for the `DisplayResults` delegation secondary agent.
pub static DISPLAY_RESULTS_DELEGATE_PROMPT: StaticPrompt<'static> =
    StaticPrompt::borrowed(TITLE, INSTRUCTIONS, INTENT);
