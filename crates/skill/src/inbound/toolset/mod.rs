//! AI tools for discovering skills.

mod search_skills;

use std::sync::Arc;

use ai_toolset::AsyncToolCollection;

use search_skills::SearchSkills;

use crate::domain::ports::SkillQueryService;

/// Tool context for the skill toolset.
pub struct SkillToolContext<SkillSvc> {
    /// The skill service implementation.
    pub service: Arc<SkillSvc>,
}

impl<SkillSvc> Clone for SkillToolContext<SkillSvc> {
    fn clone(&self) -> Self {
        Self {
            service: self.service.clone(),
        }
    }
}

impl<SkillSvc> SkillToolContext<SkillSvc>
where
    SkillSvc: SkillQueryService,
{
    /// Create a new skill tool context.
    pub fn new(service: Arc<SkillSvc>) -> Self {
        Self { service }
    }
}

/// Build the skill toolset — currently just [`SearchSkills`], which lets the
/// AI discover the user's skills to attach or read.
pub fn skill_toolset<SkillSvc>() -> AsyncToolCollection<SkillToolContext<SkillSvc>>
where
    SkillSvc: SkillQueryService,
{
    AsyncToolCollection::new().add_tool::<SearchSkills, SkillToolContext<SkillSvc>>()
}
