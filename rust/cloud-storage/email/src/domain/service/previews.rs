use entity_access::domain::models::EntityAccessReceipt;
use entity_access::domain::models::MemberTeamRole;
use filter_ast::Expr;
use item_filters::ast::email::{Email, EmailLiteral};

use crate::domain::{
    models::{
        EmailErr, EnrichedEmailThreadPreview, GetEmailsRequest, PreviewCursorQuery, UserProvider,
    },
    ports::EmailRepo,
};
use frecency::domain::{
    models::{AggregateId, FrecencyByIdsRequest, FrecencyData},
    ports::FrecencyQueryService,
};
use item_filters::ast::LiteralTree;
use macro_user_id::cowlike::CowLike;
use macro_user_id::email::ReadEmailParts;
use model_entity::EntityType;
use models_pagination::{CollectBy, PaginateOn, PaginatedCursor, SimpleSortMethod};
use std::collections::{HashMap, HashSet};
use uuid::Uuid;

use super::EmailServiceImpl;

impl<T, U, E, CS> EmailServiceImpl<T, U, E, CS>
where
    T: EmailRepo,
    U: FrecencyQueryService,
    E: crate::domain::ports::EmailMessageEnqueuer,
    CS: crm::domain::service::CrmService,
    anyhow::Error: From<T::Err>,
{
    #[tracing::instrument(err, skip(self, req))]
    pub(crate) async fn get_email_thread_previews_impl(
        &self,
        req: GetEmailsRequest,
    ) -> Result<PaginatedCursor<EnrichedEmailThreadPreview, Uuid, SimpleSortMethod, ()>, EmailErr>
    {
        let GetEmailsRequest {
            view,
            link_id,
            macro_id,
            limit,
            query,
            team_receipt,
        } = req;

        println!(
            "[email_request] entry: link_id={link_id} macro_id={} view={view:?} limit={limit:?} team_receipt_present={}",
            macro_id.as_ref(),
            team_receipt.is_some()
        );
        println!("[email_request] filter={:?}", query.filter());

        println!("[email_request] -> validate_team_scope");
        let team_id = self
            .validate_team_scope(team_receipt.as_ref(), query.filter())
            .await?;
        println!("[email_request] <- validate_team_scope OK team_id={team_id:?}");

        let sort_method = *query.sort_method();

        const MIN_PAGE: u32 = 20;
        const MAX_PAGE: u32 = 500;

        let limit = limit.unwrap_or_default().clamp(MIN_PAGE, MAX_PAGE);

        let query = PreviewCursorQuery {
            view,
            link_id,
            limit,
            query,
            team_id,
        };

        let previews = self
            .email_repo
            .previews_for_view_cursor(query, macro_id.copied().into_owned())
            .await
            .map_err(anyhow::Error::from)?;

        let thread_ids: Vec<Uuid> = previews.iter().map(|p| p.id).collect();

        let ids: Vec<_> = thread_ids
            .iter()
            .map(|id| EntityType::EmailThread.with_entity_string(id.to_string()))
            .collect();

        let frecency_request = FrecencyByIdsRequest {
            user_id: macro_id,
            ids: ids.as_slice(),
        };

        let (attachment_map_result, participant_result, labels_result, frecency_scores) = tokio::join!(
            self.email_repo.attachments_by_thread_ids(&thread_ids),
            self.email_repo.contacts_by_thread_ids(&thread_ids),
            self.email_repo.labels_by_thread_ids(&thread_ids),
            self.frecency_service
                .get_frecencies_by_ids(frecency_request)
        );

        let mut attachment_map = attachment_map_result
            .map_err(anyhow::Error::from)?
            .into_iter()
            .group_by(|v| v.thread_id);
        let mut participant_map = participant_result
            .map_err(anyhow::Error::from)?
            .into_iter()
            .group_by(|v| v.thread_id);
        let mut labels_map = labels_result
            .map_err(anyhow::Error::from)?
            .into_iter()
            .group_by(|v| v.thread_id);

        let mut frecency_scores_map: HashMap<AggregateId<'static>, FrecencyData> =
            frecency_scores?.into_inner();

        Ok(previews
            .into_iter()
            .map(|thread| {
                let id = AggregateId {
                    user_id: thread.owner_id.clone(),
                    entity: EntityType::EmailThread.with_entity_string(thread.id.to_string()),
                };

                EnrichedEmailThreadPreview {
                    attachments: attachment_map.remove(&thread.id).unwrap_or_default(),
                    labels: labels_map.remove(&thread.id).unwrap_or_default(),
                    participants: participant_map.remove(&thread.id).unwrap_or_default(),
                    frecency_score: frecency_scores_map
                        .remove(&id)
                        .map(|data| id.into_aggregate(data)),
                    thread,
                }
            })
            .paginate_on(limit as usize, sort_method)
            .into_page())
    }

    pub(crate) async fn get_link_by_auth_id_and_macro_id_impl(
        &self,
        auth_id: &str,
        macro_id: macro_user_id::user_id::MacroUserIdStr<'_>,
    ) -> Result<Option<crate::domain::models::Link>, EmailErr> {
        Ok(self
            .email_repo
            .link_by_fusionauth_and_macro_id(auth_id, macro_id, UserProvider::Gmail)
            .await
            .map_err(anyhow::Error::from)?)
    }

    /// Verify that a query is allowed to run team-scoped behavior.
    ///
    /// Three layered checks, in order:
    ///   1. Did the query actually request `EmailLiteral::TeamScope`? If not,
    ///      this is a normal per-mailbox query — no further checks apply.
    ///   2. Is a team-membership receipt present? If not, the caller asked
    ///      for team-wide visibility without proof of team membership —
    ///      reject as `Unauthorized`. (This shouldn't happen via the soup
    ///      handler, which 403s upstream, but the email service is the
    ///      resource boundary and validates defensively.)
    ///   3. For each `Email::Domain(_)` literal in the AST, the team must
    ///      have a CRM organization tracking that domain with
    ///      `email_sync = true`. Otherwise the team has not opted into
    ///      sharing emails for that domain — reject the query.
    /// Returns `Some(team_id)` when team_scope was requested AND the receipt
    /// passed all checks (membership, domain authorization). `None` when
    /// team_scope wasn't requested — the caller should run the normal
    /// per-link query path.
    async fn validate_team_scope(
        &self,
        team_receipt: Option<&EntityAccessReceipt<MemberTeamRole>>,
        filter: &LiteralTree<EmailLiteral>,
    ) -> Result<Option<Uuid>, EmailErr> {
        println!(
            "[team_scope] validate_team_scope: receipt_present={}",
            team_receipt.is_some()
        );

        let wants_team_scope = filter_requests_team_scope(filter);
        println!("[team_scope] filter_requests_team_scope = {wants_team_scope}");

        if !wants_team_scope {
            println!("[team_scope] team_scope not requested -> skipping validation");
            return Ok(None);
        }

        let receipt = match team_receipt {
            Some(r) => r,
            None => {
                println!(
                    "[team_scope] REJECT: team_scope requested but no team_receipt -> Unauthorized"
                );
                return Err(EmailErr::Unauthorized);
            }
        };
        println!(
            "[team_scope] receipt: entity_id={} entity_type={:?} permission={:?} auth={:?}",
            receipt.entity().entity_id,
            receipt.entity().entity_type,
            receipt.entity_permission(),
            receipt.auth()
        );

        let team_id = Uuid::parse_str(&receipt.entity().entity_id).map_err(|e| {
            println!("[team_scope] REJECT: team_receipt entity_id is not a valid uuid: {e}");
            EmailErr::RepoErr(anyhow::anyhow!(
                "team_receipt entity_id is not a valid uuid: {e}"
            ))
        })?;
        println!("[team_scope] parsed team_id = {team_id}");

        let domains = collect_domain_literals(filter);
        println!(
            "[team_scope] domains found in filter ({} total): {:?}",
            domains.len(),
            domains
        );
        if domains.is_empty() {
            println!("[team_scope] no domain literals to validate -> OK");
            return Ok(Some(team_id));
        }

        for domain in domains {
            println!("[team_scope] -> lookup CRM company for team_id={team_id} domain={domain}");
            let company = self
                .crm_service
                .get_company_by_domain(&team_id, &domain)
                .await
                .map_err(|e| {
                    println!("[team_scope] CRM lookup ERROR for domain={domain}: {e}");
                    EmailErr::RepoErr(anyhow::anyhow!("crm lookup failed: {e}"))
                })?;

            match &company {
                Some(c) => println!(
                    "[team_scope] CRM company found: id={} name={:?} email_sync={} domains={:?}",
                    c.id,
                    c.name,
                    c.email_sync,
                    c.domains.iter().map(|d| &d.domain).collect::<Vec<_>>()
                ),
                None => println!(
                    "[team_scope] no CRM company found for team_id={team_id} domain={domain}"
                ),
            }

            match company {
                Some(company) if company.email_sync => {
                    println!("[team_scope] domain={domain} ACCEPTED (email_sync=true)");
                }
                Some(_) => {
                    println!(
                        "[team_scope] REJECT: domain={domain} company exists but email_sync=false"
                    );
                    return Err(EmailErr::DomainNotPermittedForTeamScope(domain));
                }
                None => {
                    println!(
                        "[team_scope] REJECT: domain={domain} has no CRM company for this team"
                    );
                    return Err(EmailErr::DomainNotPermittedForTeamScope(domain));
                }
            }
        }

        println!("[team_scope] all domains validated -> OK");
        Ok(Some(team_id))
    }
}

/// Walks an email-filter AST and returns the deduped set of domains that
/// require CRM `email_sync` authorization under team_scope.
///
/// Sources:
///   - `Email::Domain(d)` → `d` directly. The literal IS a domain.
///   - `Email::Complete(addr)` → `addr.domain_part()`. The team_scope rule
///     is "the address's company must have email_sync enabled", so an exact
///     address like `alice@acme.com` is governed by acme.com's CRM company,
///     not by whether alice is individually in `crm_contacts`.
///   - `Email::Partial(_)` → ignored. Partial is a substring fragment, not a
///     domain. The typed POST endpoint already rejects Partial+team_scope at
///     AST expansion (`ExpandErr::TeamScopeRequiresQualifiedEmail`); on the
///     AST endpoint a Partial literal slips through here as a no-op. If you
///     want to harden that path, reject Partial+team_scope explicitly.
fn collect_domain_literals(filter: &LiteralTree<EmailLiteral>) -> HashSet<String> {
    fn walk(expr: &Expr<EmailLiteral>, out: &mut HashSet<String>) {
        match expr {
            Expr::And(a, b) | Expr::Or(a, b) => {
                walk(a, out);
                walk(b, out);
            }
            Expr::Not(a) => walk(a, out),
            Expr::Literal(
                EmailLiteral::Sender(email)
                | EmailLiteral::Cc(email)
                | EmailLiteral::Bcc(email)
                | EmailLiteral::Recipient(email),
            ) => match email {
                Email::Domain(d) => {
                    let lowered = d.to_ascii_lowercase();
                    println!(
                        "[team_scope] collect_domain_literals: found Domain literal: {lowered}"
                    );
                    out.insert(lowered);
                }
                Email::Complete(addr) => {
                    let domain = addr.0.domain_part().to_ascii_lowercase();
                    println!(
                        "[team_scope] collect_domain_literals: found Complete literal {} -> domain {domain}",
                        addr.0.email_str()
                    );
                    out.insert(domain);
                }
                Email::Partial(_) => {}
            },
            Expr::Literal(_) => {}
        }
    }
    let mut out = HashSet::new();
    match filter.as_ref() {
        Some(expr) => {
            println!("[team_scope] collect_domain_literals: walking filter AST");
            walk(expr, &mut out);
        }
        None => println!("[team_scope] collect_domain_literals: filter is None (empty)"),
    }
    println!(
        "[team_scope] collect_domain_literals: returning {} domain(s)",
        out.len()
    );
    out
}

/// Walks an email-filter AST and returns true if any node is the
/// `EmailLiteral::TeamScope` literal. Used to gate team-scope-specific
/// validation/expansion: without this literal the caller is not asking for
/// team-wide visibility, so checks like CRM domain authorization don't apply.
fn filter_requests_team_scope(filter: &LiteralTree<EmailLiteral>) -> bool {
    fn walk(expr: &Expr<EmailLiteral>) -> bool {
        match expr {
            Expr::And(a, b) | Expr::Or(a, b) => walk(a) || walk(b),
            Expr::Not(a) => walk(a),
            Expr::Literal(EmailLiteral::TeamScope) => {
                println!("[team_scope] filter_requests_team_scope: found TeamScope literal");
                true
            }
            Expr::Literal(_) => false,
        }
    }
    let result = filter.as_ref().map(|e| walk(e)).unwrap_or(false);
    println!("[team_scope] filter_requests_team_scope = {result}");
    result
}
