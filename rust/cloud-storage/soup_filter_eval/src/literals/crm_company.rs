//! CRM company literal evaluation against the `SoupCrmCompany` payload.

use item_filters::ast::crm_company::CrmCompanyLiteral;

use crate::item::{bool_eq, uuid_eq};
use crate::{Data, Truth};

pub(crate) fn eval(literal: &CrmCompanyLiteral, data: &Data) -> Truth {
    match literal {
        CrmCompanyLiteral::Id(id) => uuid_eq(data, "id", id),
        CrmCompanyLiteral::Hidden(want) => bool_eq(data, "hidden", *want),
    }
}
