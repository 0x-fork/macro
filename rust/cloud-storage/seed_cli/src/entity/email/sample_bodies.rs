//! Loads sample email body content from embedded files.

/// A pair of (plaintext body, html body).
pub type SampleBody = (Option<String>, Option<String>);

/// Load all sample email bodies bundled with the CLI.
pub fn load_sample_bodies() -> Vec<SampleBody> {
    vec![
        (
            Some(include_str!("sample_bodies/meeting_followup.txt").to_string()),
            Some(include_str!("sample_bodies/meeting_followup.html").to_string()),
        ),
        (
            Some(include_str!("sample_bodies/project_update.txt").to_string()),
            Some(include_str!("sample_bodies/project_update.html").to_string()),
        ),
        (
            Some(include_str!("sample_bodies/quick_question.txt").to_string()),
            Some(include_str!("sample_bodies/quick_question.html").to_string()),
        ),
        (
            Some(include_str!("sample_bodies/welcome.txt").to_string()),
            Some(include_str!("sample_bodies/welcome.html").to_string()),
        ),
        (
            Some(include_str!("sample_bodies/invoice.txt").to_string()),
            Some(include_str!("sample_bodies/invoice.html").to_string()),
        ),
    ]
}
