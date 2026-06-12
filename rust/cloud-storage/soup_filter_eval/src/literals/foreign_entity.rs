//! Foreign entity literal evaluation against the `SoupForeignEntity` payload.

use item_filters::ast::foreign_entity::ForeignEntityLiteral;

use crate::item::{str_eq, uuid_eq};
use crate::{Data, Truth};

pub(crate) fn eval(literal: &ForeignEntityLiteral, data: &Data) -> Truth {
    match literal {
        ForeignEntityLiteral::Id(id) => uuid_eq(data, "id", id),
        ForeignEntityLiteral::ForeignEntityId(fid) => str_eq(data, "foreignEntityId", fid),
        ForeignEntityLiteral::ForeignEntitySource(src) => str_eq(data, "foreignEntitySource", src),
    }
}
