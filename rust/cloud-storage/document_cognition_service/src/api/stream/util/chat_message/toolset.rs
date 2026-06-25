use crate::model::stream::ToolSet;

use crate::model::stream::SendChatMessagePayload;

/// Returns the appropriate system prompt for the requested toolset.
pub fn choose_tools_prompt<'a>(
    request: &SendChatMessagePayload,
    all_tools_prompt: &'a (dyn std::fmt::Display + Sync),
) -> &'a (dyn std::fmt::Display + Sync) {
    tools_prompt_for(&request.toolset, all_tools_prompt)
}

/// Returns the appropriate system prompt for a [`ToolSet`] selection. Shared by
/// the send path ([`choose_tools_prompt`]) and the resolve/resume path so a
/// resumed turn uses the same prompt the original turn selected.
pub fn tools_prompt_for<'a>(
    toolset: &ToolSet,
    all_tools_prompt: &'a (dyn std::fmt::Display + Sync),
) -> &'a (dyn std::fmt::Display + Sync) {
    match toolset {
        ToolSet::All => all_tools_prompt,
        ToolSet::None => &prompt::BASE_PROMPT,
    }
}
