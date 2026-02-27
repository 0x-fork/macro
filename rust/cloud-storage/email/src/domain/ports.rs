use crate::domain::models::{
    Attachment, Contact, EmailErr, EmailThreadPreview, EnrichedEmailThreadPreview,
    GetEmailsRequest, Label, Link, PreviewCursorQuery,
};
use macro_user_id::user_id::MacroUserIdStr;
use models_pagination::{PaginatedCursor, SimpleSortMethod};
use uuid::Uuid;

pub trait EmailRepo: Send + Sync + 'static {
    type Err: Send;
    fn previews_for_view_cursor(
        &self,
        query: PreviewCursorQuery,
        user_id: MacroUserIdStr<'static>,
    ) -> impl Future<Output = Result<Vec<EmailThreadPreview>, Self::Err>> + Send;

    fn attachments_by_thread_ids(
        &self,
        thread_ids: &[Uuid],
    ) -> impl Future<Output = Result<Vec<Attachment>, Self::Err>> + Send;

    fn contacts_by_thread_ids(
        &self,
        thread_ids: &[Uuid],
    ) -> impl Future<Output = Result<Vec<Contact>, Self::Err>> + Send;

    fn labels_by_thread_ids(
        &self,
        thread_ids: &[Uuid],
    ) -> impl Future<Output = Result<Vec<Label>, Self::Err>> + Send;

    fn link_by_macro_id(
        &self,
        macro_id: MacroUserIdStr<'_>,
    ) -> impl Future<Output = Result<Option<Link>, Self::Err>> + Send;
}

pub trait EmailService: Send + Sync + 'static {
    /// The response type for `get_thread`. This is an associated type because the
    /// concrete response uses types from `models_email` which can't be depended on
    /// directly from this crate.
    type GetThreadResponse: serde::Serialize + Send;

    fn get_email_thread_previews(
        &self,
        req: GetEmailsRequest,
    ) -> impl Future<
        Output = Result<
            PaginatedCursor<EnrichedEmailThreadPreview, Uuid, SimpleSortMethod, ()>,
            EmailErr,
        >,
    > + Send;

    fn get_link_by_macro_id(
        &self,
        macro_id: MacroUserIdStr<'_>,
    ) -> impl Future<Output = Result<Option<Link>, EmailErr>> + Send;

    fn get_thread(
        &self,
        thread_id: Uuid,
        access_level: models_permissions::share_permission::access_level::AccessLevel,
        offset: i64,
        limit: i64,
    ) -> impl Future<Output = Result<Self::GetThreadResponse, EmailErr>> + Send;
}
