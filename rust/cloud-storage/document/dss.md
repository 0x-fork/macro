# Document Storage Service Audit

## Question

> I want you to audit @rust/cloud-storage/document_storage_service/ and give me an overview of how document content is fetched. I want to know the params / return types for document content and document metadata endpoints. I also want you to understand then summarize how _authorization_ (not authentication) works.

## Response

### How Document Content is Fetched

Document content is fetched through a layered architecture:

1. **Storage Layer**: Content stored in S3 buckets (`document_storage_bucket`, `docx_document_upload_bucket`, `upload_staging_bucket`)
2. **Database Layer**: Document text retrieved via `macro_db_client::document_text::get_document_text()`
3. **Authorization Layer**: All requests pass through `DocumentAccessExtractor<T>` middleware before reaching handlers

---

### Document Content Endpoints

| Endpoint | Method | Params | Response |
|----------|--------|--------|----------|
| `/documents/{document_id}` | GET | `document_id` (path) | `GetDocumentResponse { document_metadata, user_access_level, view_location }` |
| `/documents/{document_id}/text` | GET | `document_id` (path) | `GetDocumentTextResponse { text: String }` |
| `/documents/{document_id}/{version_id}` | GET | `document_id`, `document_version_id` (path) | Specific version content |
| `/documents/{document_id}/export` | GET | `document_id` (path) | `{ presigned_url: String }` (CloudFront signed URL) |
| `/documents/{document_id}/location` | GET | `document_id` (path) | S3 presigned URL |
| `/documents/{document_id}/{version_id}/key` | GET | `document_id`, `document_version_id` (path) | Encryption key |
| `/documents/preview` | POST | `{ document_ids: Vec<String> }` (body) | `{ previews: Vec<DocumentPreview> }` |

---

### Document Metadata Endpoints

| Endpoint | Method | Params | Response |
|----------|--------|--------|----------|
| `/documents/list` | GET | (none - uses auth user) | `GetDocumentSearchResponse { Vec<GetDocumentListResult> }` |
| `/documents/` | GET | (none - uses auth user) | List of user's documents |
| `/documents/{document_id}/basic` | GET | `document_id` (path) | `DocumentBasic` struct |
| `/internal/documents/metadata` | POST | `{ document_ids: Vec<String> }` (body) + auth header | `{ documents: Vec<{item_id, item_name, item_owner, file_type}> }` |
| `/internal/documents/list_with_access` | GET | `file_types`, `min_access_level`, `page`, `page_size` (query) | `{ documents, results_returned }` |

---

### Authorization System

**Access Levels** (hierarchical):
```
Owner > Edit > Comment > View
```

**Two Authorization Mechanisms**:

#### 1. DocumentAccessExtractor (Public Endpoints)
Located at `macro_middleware/src/cloud_storage/ensure_access/document.rs`

The extractor checks in order:
1. **Ownership check** - if user owns document → `Owner` access (short circuit)
2. **Deletion check** - if deleted and not owner → `Unauthorized`
3. **Permission query** - calls `get_users_access_level_v2()` to fetch highest access level
4. **Level comparison** - compares actual level against required level (generic type `T`)

Usage pattern:
```rust
DocumentAccessExtractor<ViewAccessLevel>   // Read endpoints
DocumentAccessExtractor<EditAccessLevel>   // Modify endpoints
DocumentAccessExtractor<OwnerAccessLevel>  // Admin endpoints (permissions)
```

#### 2. Permission Query Logic
Located at `macro_db_client/src/share_permission/access_level/document.rs`

Queries access from two sources:
- **UserItemAccess table** - explicit grants (direct or inherited from parent projects)
- **SharePermission table** - public access (`isPublic=true`)

Uses recursive CTE to traverse project hierarchy, returning the **highest** access level found.

#### 3. Internal Endpoints (`/internal/*`)
- Bypass per-document authorization checks
- Secured via `x-document-storage-service-auth-key` header
- All internal requests receive **Owner** level access automatically
- Default user ID: `macro|INTERNAL@macro.com`

**Key Authorization Facts**:
- Project-level permissions cascade to contained documents
- Only owners can access deleted documents
- No RBAC - simple level-based permissions only
