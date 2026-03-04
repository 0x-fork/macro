pub mod attachment;
pub mod contact;
pub mod draft;
pub mod error;
pub mod label;
pub mod link;
pub mod message;
pub mod preview;
pub mod thread;

#[cfg(test)]
mod tests;

pub use attachment::{Attachment, AttachmentDraft, AttachmentForwarded, MessageAttachment};
pub use contact::{Contact, ContactInfo, RecipientType};
pub use draft::{
    CreateDraftInput, CreatedDraft, ParsedAddresses, ResolvedDraftInput, SimpleMessageInfo,
    UpsertedContacts, UpsertedRecipient,
};
pub use error::EmailErr;
pub use label::{
    Label, LabelListVisibility, LabelType, LinkLabel, MessageLabel, MessageListVisibility,
    UpdateThreadLabelsResult,
};
pub use link::{Link, UserProvider};
pub use message::{Message, MessageRow, SimpleMessage};
pub use preview::{
    EmailThreadPreview, EnrichedEmailThreadPreview, GetEmailsRequest, PreviewCursorQuery,
    PreviewView, PreviewViewStandardLabel,
};
pub use thread::{Thread, ThreadRow};
