//! Implementation of [`CompaniesRepository`] backed by MacroDB.

use crate::domain::{
    companies_repo::CompaniesRepository,
    model::{CrmCompany, CrmDomain, CrmError},
};
use sqlx::PgPool;

/// PostgreSQL-backed [`CompaniesRepository`].
#[derive(Clone)]
pub struct CompaniesRepositoryImpl {
    /// The underlying sqlx::PgPool connected to macrodb.
    pool: PgPool,
}

impl CompaniesRepositoryImpl {
    /// Creates a new instance of CompaniesRepositoryImpl
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

impl CompaniesRepository for CompaniesRepositoryImpl {
    #[tracing::instrument(skip(self), err)]
    async fn get_company_by_domain(
        &self,
        team_id: &uuid::Uuid,
        domain: &str,
    ) -> Result<Option<CrmCompany>, CrmError> {
        let normalized_domain = domain.to_ascii_lowercase();

        let company = sqlx::query!(
            r#"
            SELECT c.id, c.team_id, c.name, c.email_sync, c.created_at
            FROM crm_companies c
            JOIN crm_domains d ON d.company_id = c.id
            WHERE c.team_id = $1
              AND LOWER(d.domain) = $2
            LIMIT 1
            "#,
            team_id,
            normalized_domain,
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| CrmError::StorageLayerError(e.into()))?;

        let Some(company) = company else {
            return Ok(None);
        };

        let domains = sqlx::query!(
            r#"
            SELECT id, company_id, domain, created_at
            FROM crm_domains
            WHERE company_id = $1
            ORDER BY created_at ASC
            "#,
            company.id,
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| CrmError::StorageLayerError(e.into()))?
        .into_iter()
        .map(|row| CrmDomain {
            id: row.id,
            company_id: row.company_id,
            domain: row.domain,
            created_at: row.created_at,
        })
        .collect();

        Ok(Some(CrmCompany {
            id: company.id,
            team_id: company.team_id,
            name: company.name,
            email_sync: company.email_sync,
            created_at: company.created_at,
            domains,
        }))
    }

    #[tracing::instrument(skip(self), err)]
    async fn populate_contact(
        &self,
        team_id: &uuid::Uuid,
        link_id: &uuid::Uuid,
        domain: &str,
        email: &str,
    ) -> Result<(), CrmError> {
        // TEMP: timing logs at tracing::warn — added for performance
        // debugging in testing. Remove once we have steady-state metrics.
        let total_start = std::time::Instant::now();
        let normalized_domain = domain.to_ascii_lowercase();
        let normalized_email = email.to_ascii_lowercase();

        let q_start = std::time::Instant::now();
        let mut tx = self
            .pool
            .begin()
            .await
            .map_err(|e| CrmError::StorageLayerError(e.into()))?;
        tracing::warn!(
            elapsed_ms = q_start.elapsed().as_millis() as u64,
            "populate_contact: tx.begin"
        );

        // Serialize on (team_id, lower(domain)) for the duration of this
        // transaction. Without this lock two concurrent populate_contact
        // calls can both observe "no existing company" and both insert one,
        // leaving the team with duplicate crm_companies rows. The
        // UNIQUE(team_id, LOWER(domain)) on crm_domains catches the race at
        // the second insert, but only after the first transaction has
        // already created an orphan company. The advisory lock prevents
        // that orphan from ever existing. Lock scope is the (team, domain)
        // key only — different teams/different domains run in parallel.
        let q_start = std::time::Instant::now();
        sqlx::query!(
            r#"SELECT pg_advisory_xact_lock(hashtextextended($1, 0))"#,
            format!("{team_id}:{normalized_domain}"),
        )
        .execute(&mut *tx)
        .await
        .map_err(|e| CrmError::StorageLayerError(e.into()))?;
        tracing::warn!(
            elapsed_ms = q_start.elapsed().as_millis() as u64,
            "populate_contact: advisory_xact_lock"
        );

        // Look up the company for this (team, domain). The killswitch lives
        // here: a pre-existing row with email_sync=false means the team has
        // opted this domain out and we must not write anything.
        let q_start = std::time::Instant::now();
        let existing = sqlx::query!(
            r#"
            SELECT c.id, c.email_sync
            FROM crm_companies c
            JOIN crm_domains d ON d.company_id = c.id
            WHERE c.team_id = $1
              AND LOWER(d.domain) = $2
            LIMIT 1
            "#,
            team_id,
            normalized_domain,
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| CrmError::StorageLayerError(e.into()))?;
        tracing::warn!(
            elapsed_ms = q_start.elapsed().as_millis() as u64,
            "populate_contact: select existing company"
        );

        let company_id = match existing {
            Some(row) if !row.email_sync => {
                // Killswitch: team has opted this domain out. Commit the
                // (empty) transaction and return so the caller acks.
                let q_start = std::time::Instant::now();
                tx.commit()
                    .await
                    .map_err(|e| CrmError::StorageLayerError(e.into()))?;
                tracing::warn!(
                    elapsed_ms = q_start.elapsed().as_millis() as u64,
                    "populate_contact: tx.commit (killswitch path)"
                );
                tracing::warn!(
                    elapsed_ms = total_start.elapsed().as_millis() as u64,
                    "populate_contact: TOTAL (killswitch path)"
                );
                return Ok(());
            }
            Some(row) => row.id,
            None => {
                let q_start = std::time::Instant::now();
                let new_company = sqlx::query!(
                    r#"
                    INSERT INTO crm_companies (team_id, name)
                    VALUES ($1, 'TODO')
                    RETURNING id
                    "#,
                    team_id,
                )
                .fetch_one(&mut *tx)
                .await
                .map_err(|e| CrmError::StorageLayerError(e.into()))?;
                tracing::warn!(
                    elapsed_ms = q_start.elapsed().as_millis() as u64,
                    "populate_contact: insert new company"
                );

                // The advisory lock guarantees no concurrent insert for the
                // same (team_id, lower(domain)). The UNIQUE index on
                // crm_domains backs that promise up — `ON CONFLICT DO
                // NOTHING` is defensive. If it does fire (e.g. an old row
                // predating the advisory lock somehow exists), the
                // crm_companies row we just inserted would be orphaned with
                // no domain pointing at it. Detect via rows_affected, look
                // up the real company id, and delete the orphan.
                let q_start = std::time::Instant::now();
                let domain_insert = sqlx::query!(
                    r#"
                    INSERT INTO crm_domains (company_id, team_id, domain)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (team_id, LOWER(domain)) DO NOTHING
                    "#,
                    new_company.id,
                    team_id,
                    normalized_domain,
                )
                .execute(&mut *tx)
                .await
                .map_err(|e| CrmError::StorageLayerError(e.into()))?;
                tracing::warn!(
                    elapsed_ms = q_start.elapsed().as_millis() as u64,
                    "populate_contact: insert new domain"
                );

                if domain_insert.rows_affected() == 0 {
                    let q_start = std::time::Instant::now();
                    let existing_company_id = sqlx::query_scalar!(
                        r#"
                        SELECT c.id
                        FROM crm_companies c
                        JOIN crm_domains d ON d.company_id = c.id
                        WHERE c.team_id = $1
                          AND LOWER(d.domain) = $2
                        LIMIT 1
                        "#,
                        team_id,
                        normalized_domain,
                    )
                    .fetch_one(&mut *tx)
                    .await
                    .map_err(|e| CrmError::StorageLayerError(e.into()))?;
                    tracing::warn!(
                        elapsed_ms = q_start.elapsed().as_millis() as u64,
                        "populate_contact: re-select existing company id (orphan recovery)"
                    );

                    let q_start = std::time::Instant::now();
                    sqlx::query!(r#"DELETE FROM crm_companies WHERE id = $1"#, new_company.id,)
                        .execute(&mut *tx)
                        .await
                        .map_err(|e| CrmError::StorageLayerError(e.into()))?;
                    tracing::warn!(
                        elapsed_ms = q_start.elapsed().as_millis() as u64,
                        "populate_contact: delete orphan company"
                    );

                    existing_company_id
                } else {
                    new_company.id
                }
            }
        };

        // Upsert the contact. `ON CONFLICT DO UPDATE SET email = EXCLUDED.email`
        // is a no-op write that exists only to force RETURNING to fire on the
        // conflict path, so we get the existing row's id without a second
        // round trip.
        let q_start = std::time::Instant::now();
        let contact_id = sqlx::query_scalar!(
            r#"
            INSERT INTO crm_contacts (company_id, email)
            VALUES ($1, $2)
            ON CONFLICT (company_id, email) DO UPDATE SET email = EXCLUDED.email
            RETURNING id
            "#,
            company_id,
            normalized_email,
        )
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| CrmError::StorageLayerError(e.into()))?;
        tracing::warn!(
            elapsed_ms = q_start.elapsed().as_millis() as u64,
            "populate_contact: upsert contact"
        );

        let q_start = std::time::Instant::now();
        sqlx::query!(
            r#"
            INSERT INTO crm_contact_sources (contact_id, link_id)
            VALUES ($1, $2)
            ON CONFLICT (contact_id, link_id) DO NOTHING
            "#,
            contact_id,
            link_id,
        )
        .execute(&mut *tx)
        .await
        .map_err(|e| CrmError::StorageLayerError(e.into()))?;
        tracing::warn!(
            elapsed_ms = q_start.elapsed().as_millis() as u64,
            "populate_contact: upsert contact_source"
        );

        let q_start = std::time::Instant::now();
        tx.commit()
            .await
            .map_err(|e| CrmError::StorageLayerError(e.into()))?;
        tracing::warn!(
            elapsed_ms = q_start.elapsed().as_millis() as u64,
            "populate_contact: tx.commit"
        );

        tracing::warn!(
            elapsed_ms = total_start.elapsed().as_millis() as u64,
            "populate_contact: TOTAL"
        );

        Ok(())
    }

    #[tracing::instrument(skip(self), err)]
    async fn depopulate_contact(
        &self,
        team_id: &uuid::Uuid,
        link_id: &uuid::Uuid,
        domain: &str,
        email: &str,
    ) -> Result<(), CrmError> {
        // TEMP: timing logs at tracing::warn — added for performance
        // debugging in testing. Remove once we have steady-state metrics.
        let total_start = std::time::Instant::now();
        let normalized_domain = domain.to_ascii_lowercase();
        let normalized_email = email.to_ascii_lowercase();

        let q_start = std::time::Instant::now();
        let mut tx = self
            .pool
            .begin()
            .await
            .map_err(|e| CrmError::StorageLayerError(e.into()))?;
        tracing::warn!(
            elapsed_ms = q_start.elapsed().as_millis() as u64,
            "depopulate_contact: tx.begin"
        );

        // Take the lock BEFORE looking at any state. A concurrent
        // populate_contact for the same (team, domain) might have a tx
        // open that has inserted rows but hasn't committed yet — without
        // the lock our SELECT below would miss those rows, return
        // Ok(()) here, and the in-flight populate would then commit and
        // leave the team with CRM data for a since-deleted sent message.
        // Holding the lock for the rest of this tx forces populate to
        // either commit first (we then see + tear down its rows) or
        // wait until we're done (its row will be inserted after, and
        // a future depopulate will catch it).
        let q_start = std::time::Instant::now();
        sqlx::query!(
            r#"SELECT pg_advisory_xact_lock(hashtextextended($1, 0))"#,
            format!("{team_id}:{normalized_domain}"),
        )
        .execute(&mut *tx)
        .await
        .map_err(|e| CrmError::StorageLayerError(e.into()))?;
        tracing::warn!(
            elapsed_ms = q_start.elapsed().as_millis() as u64,
            "depopulate_contact: advisory_xact_lock"
        );

        // Resolve (contact_id, company_id, email_sync) for this
        // (team, domain, email). Returning None here means there is
        // nothing to tear down: commit the empty tx and ack.
        let q_start = std::time::Instant::now();
        let row = sqlx::query!(
            r#"
            SELECT
                ct.id AS contact_id,
                co.id AS company_id,
                co.email_sync AS "email_sync!"
            FROM crm_contacts ct
            JOIN crm_companies co ON co.id = ct.company_id
            JOIN crm_domains d ON d.company_id = co.id
            WHERE co.team_id = $1
              AND LOWER(ct.email) = $2
              AND LOWER(d.domain) = $3
            LIMIT 1
            "#,
            team_id,
            normalized_email,
            normalized_domain,
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| CrmError::StorageLayerError(e.into()))?;
        tracing::warn!(
            elapsed_ms = q_start.elapsed().as_millis() as u64,
            "depopulate_contact: resolve (contact, company, email_sync)"
        );

        let Some(row) = row else {
            let q_start = std::time::Instant::now();
            tx.commit()
                .await
                .map_err(|e| CrmError::StorageLayerError(e.into()))?;
            tracing::warn!(
                elapsed_ms = q_start.elapsed().as_millis() as u64,
                "depopulate_contact: tx.commit (no-row path)"
            );
            tracing::warn!(
                elapsed_ms = total_start.elapsed().as_millis() as u64,
                "depopulate_contact: TOTAL (no-row path)"
            );
            return Ok(());
        };

        // 1. Drop the per-link source row.
        let q_start = std::time::Instant::now();
        sqlx::query!(
            r#"
            DELETE FROM crm_contact_sources
            WHERE contact_id = $1 AND link_id = $2
            "#,
            row.contact_id,
            link_id,
        )
        .execute(&mut *tx)
        .await
        .map_err(|e| CrmError::StorageLayerError(e.into()))?;
        tracing::warn!(
            elapsed_ms = q_start.elapsed().as_millis() as u64,
            "depopulate_contact: delete contact_source"
        );

        // 2. Keep the contact iff any other link in the team still
        //    references it.
        let q_start = std::time::Instant::now();
        let other_sources = sqlx::query_scalar!(
            r#"
            SELECT EXISTS(
                SELECT 1 FROM crm_contact_sources WHERE contact_id = $1 LIMIT 1
            ) AS "exists!"
            "#,
            row.contact_id,
        )
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| CrmError::StorageLayerError(e.into()))?;
        tracing::warn!(
            elapsed_ms = q_start.elapsed().as_millis() as u64,
            "depopulate_contact: check remaining sources for contact"
        );

        if other_sources {
            let q_start = std::time::Instant::now();
            tx.commit()
                .await
                .map_err(|e| CrmError::StorageLayerError(e.into()))?;
            tracing::warn!(
                elapsed_ms = q_start.elapsed().as_millis() as u64,
                "depopulate_contact: tx.commit (contact still referenced path)"
            );
            tracing::warn!(
                elapsed_ms = total_start.elapsed().as_millis() as u64,
                "depopulate_contact: TOTAL (contact still referenced path)"
            );
            return Ok(());
        }

        let q_start = std::time::Instant::now();
        sqlx::query!(r#"DELETE FROM crm_contacts WHERE id = $1"#, row.contact_id,)
            .execute(&mut *tx)
            .await
            .map_err(|e| CrmError::StorageLayerError(e.into()))?;
        tracing::warn!(
            elapsed_ms = q_start.elapsed().as_millis() as u64,
            "depopulate_contact: delete contact"
        );

        // 3. Keep the company when other contacts in the team still
        //    belong to it, OR when the team has opted the domain out.
        //    The killswitch (`email_sync = false`) is stored on
        //    crm_companies and is configuration, not derived data;
        //    dropping the company would silently erase the opt-out and
        //    a future populate would recreate the row with the default
        //    `email_sync = true`.
        if !row.email_sync {
            let q_start = std::time::Instant::now();
            tx.commit()
                .await
                .map_err(|e| CrmError::StorageLayerError(e.into()))?;
            tracing::warn!(
                elapsed_ms = q_start.elapsed().as_millis() as u64,
                "depopulate_contact: tx.commit (killswitched company path)"
            );
            tracing::warn!(
                elapsed_ms = total_start.elapsed().as_millis() as u64,
                "depopulate_contact: TOTAL (killswitched company path)"
            );
            return Ok(());
        }

        let q_start = std::time::Instant::now();
        let other_contacts = sqlx::query_scalar!(
            r#"
            SELECT EXISTS(
                SELECT 1 FROM crm_contacts WHERE company_id = $1 LIMIT 1
            ) AS "exists!"
            "#,
            row.company_id,
        )
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| CrmError::StorageLayerError(e.into()))?;
        tracing::warn!(
            elapsed_ms = q_start.elapsed().as_millis() as u64,
            "depopulate_contact: check remaining contacts for company"
        );

        if other_contacts {
            let q_start = std::time::Instant::now();
            tx.commit()
                .await
                .map_err(|e| CrmError::StorageLayerError(e.into()))?;
            tracing::warn!(
                elapsed_ms = q_start.elapsed().as_millis() as u64,
                "depopulate_contact: tx.commit (company still has contacts path)"
            );
            tracing::warn!(
                elapsed_ms = total_start.elapsed().as_millis() as u64,
                "depopulate_contact: TOTAL (company still has contacts path)"
            );
            return Ok(());
        }

        // crm_domains FK is ON DELETE CASCADE — deleting the company
        // takes its domain rows with it.
        let q_start = std::time::Instant::now();
        sqlx::query!(r#"DELETE FROM crm_companies WHERE id = $1"#, row.company_id,)
            .execute(&mut *tx)
            .await
            .map_err(|e| CrmError::StorageLayerError(e.into()))?;
        tracing::warn!(
            elapsed_ms = q_start.elapsed().as_millis() as u64,
            "depopulate_contact: delete company"
        );

        let q_start = std::time::Instant::now();
        tx.commit()
            .await
            .map_err(|e| CrmError::StorageLayerError(e.into()))?;
        tracing::warn!(
            elapsed_ms = q_start.elapsed().as_millis() as u64,
            "depopulate_contact: tx.commit"
        );

        tracing::warn!(
            elapsed_ms = total_start.elapsed().as_millis() as u64,
            "depopulate_contact: TOTAL"
        );

        Ok(())
    }

    #[tracing::instrument(skip(self), err)]
    async fn depopulate_link_in_team(
        &self,
        team_id: &uuid::Uuid,
        link_id: &uuid::Uuid,
    ) -> Result<(), CrmError> {
        // TEMP: timing logs at tracing::warn — added for performance
        // debugging in testing. Remove once we have steady-state metrics.
        let total_start = std::time::Instant::now();

        let q_start = std::time::Instant::now();
        let mut tx = self
            .pool
            .begin()
            .await
            .map_err(|e| CrmError::StorageLayerError(e.into()))?;
        tracing::warn!(
            elapsed_ms = q_start.elapsed().as_millis() as u64,
            "depopulate_link_in_team: tx.begin"
        );

        // 1. Drop the link's source rows scoped to this team.
        let q_start = std::time::Instant::now();
        let sources_result = sqlx::query!(
            r#"
            DELETE FROM crm_contact_sources cs
            USING crm_contacts ct, crm_companies co
            WHERE cs.contact_id = ct.id
              AND ct.company_id = co.id
              AND co.team_id = $1
              AND cs.link_id = $2
            "#,
            team_id,
            link_id,
        )
        .execute(&mut *tx)
        .await
        .map_err(|e| CrmError::StorageLayerError(e.into()))?;
        tracing::warn!(
            elapsed_ms = q_start.elapsed().as_millis() as u64,
            rows_affected = sources_result.rows_affected(),
            "depopulate_link_in_team: delete contact_sources for link"
        );

        // 2. Drop every contact in this team that no longer has any
        //    source.
        let q_start = std::time::Instant::now();
        let contacts_result = sqlx::query!(
            r#"
            DELETE FROM crm_contacts ct
            USING crm_companies co
            WHERE ct.company_id = co.id
              AND co.team_id = $1
              AND NOT EXISTS (
                  SELECT 1 FROM crm_contact_sources WHERE contact_id = ct.id
              )
            "#,
            team_id,
        )
        .execute(&mut *tx)
        .await
        .map_err(|e| CrmError::StorageLayerError(e.into()))?;
        tracing::warn!(
            elapsed_ms = q_start.elapsed().as_millis() as u64,
            rows_affected = contacts_result.rows_affected(),
            "depopulate_link_in_team: delete orphan contacts in team"
        );

        // 3. Drop every company in this team that no longer has any
        //    contact AND is not killswitched. Companies with
        //    `email_sync = false` are preserved so the team's
        //    configuration survives teardown — a future populate will
        //    re-find the row and short-circuit on the same flag.
        //    `crm_domains` falls out via FK cascade.
        let q_start = std::time::Instant::now();
        let companies_result = sqlx::query!(
            r#"
            DELETE FROM crm_companies co
            WHERE co.team_id = $1
              AND co.email_sync = TRUE
              AND NOT EXISTS (
                  SELECT 1 FROM crm_contacts WHERE company_id = co.id
              )
            "#,
            team_id,
        )
        .execute(&mut *tx)
        .await
        .map_err(|e| CrmError::StorageLayerError(e.into()))?;
        tracing::warn!(
            elapsed_ms = q_start.elapsed().as_millis() as u64,
            rows_affected = companies_result.rows_affected(),
            "depopulate_link_in_team: delete orphan companies in team"
        );

        let q_start = std::time::Instant::now();
        tx.commit()
            .await
            .map_err(|e| CrmError::StorageLayerError(e.into()))?;
        tracing::warn!(
            elapsed_ms = q_start.elapsed().as_millis() as u64,
            "depopulate_link_in_team: tx.commit"
        );

        tracing::warn!(
            elapsed_ms = total_start.elapsed().as_millis() as u64,
            "depopulate_link_in_team: TOTAL"
        );

        Ok(())
    }

    #[tracing::instrument(skip(self), err)]
    async fn get_team_id_for_user(&self, macro_id: &str) -> Result<Option<uuid::Uuid>, CrmError> {
        sqlx::query_scalar!(
            r#"
            SELECT team_id
            FROM team_user
            WHERE user_id = $1
            ORDER BY team_role DESC
            LIMIT 1
            "#,
            macro_id,
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| CrmError::StorageLayerError(e.into()))
    }
}
