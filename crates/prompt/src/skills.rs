//! Renders attached skill content into the system prompt.
//!
//! Skills are markdown documents of AI instructions a user attaches to a chat
//! input via a `/<skillname>` slash command. Their content is only known at
//! request time (resolved per-message from the document store), so this
//! section is rendered by [`render`] rather than declared as a `'static`
//! prompt.

static TITLE: &str = "Attached skills";

/// A resolved skill ready to be rendered into the system prompt.
pub struct ResolvedSkill {
    /// The skill document's name, if known.
    pub name: Option<String>,
    /// The skill's markdown instructions (or an error description if the
    /// skill could not be resolved).
    pub content: String,
}

/// Renders the attached-skills section, or `None` when no skills are
/// attached — there is nothing to instruct, so the section is omitted rather
/// than emitting an empty, confusing block. Each skill's content is wrapped
/// in a `<skill>` tag; the model is instructed to follow it for the rest of
/// the conversation.
pub fn render(skills: &[ResolvedSkill]) -> Option<String> {
    if skills.is_empty() {
        return None;
    }

    let skills_xml: String = skills
        .iter()
        .map(|skill| {
            let name = skill.name.as_deref().unwrap_or("untitled skill");
            format!("<skill name=\"{name}\">\n{}\n</skill>\n", skill.content)
        })
        .collect();

    Some(format!(
        "# {TITLE}\n\
         The user has attached the following skills to this conversation. Each \
         skill's content contains instructions you must follow for the rest of \
         this conversation.\n\
         \n\
         {skills_xml}"
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_skills_omit_the_section() {
        assert!(render(&[]).is_none());
    }

    #[test]
    fn renders_each_skill_wrapped_in_a_skill_tag() {
        let section = render(&[
            ResolvedSkill {
                name: Some("Linear Importer".to_string()),
                content: "Follow these steps to import a Linear issue.".to_string(),
            },
            ResolvedSkill {
                name: None,
                content: "Some untitled instructions.".to_string(),
            },
        ])
        .unwrap();

        assert!(section.contains(&format!("# {TITLE}")));
        assert!(section.contains("<skill name=\"Linear Importer\">"));
        assert!(section.contains("Follow these steps to import a Linear issue."));
        assert!(section.contains("<skill name=\"untitled skill\">"));
        assert!(section.contains("Some untitled instructions."));
    }
}
