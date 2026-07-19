use super::*;
use crate::scheme::MacroScheme;

#[test]
fn from_url_extracts_correct_path_from_universal_link() {
    let url = Url::parse("https://macro.com/app/component/doc123").unwrap();
    let result = MacroScheme::from_url(&url).unwrap();
    assert_eq!(result.path(), "/component/doc123");
    assert_eq!(result.query(), None);
}

#[test]
fn from_url_extracts_path_and_query_from_universal_link() {
    let url = Url::parse("https://macro.com/app/component/doc123?foo=bar").unwrap();
    let result = MacroScheme::from_url(&url).unwrap();
    assert_eq!(result.path(), "/component/doc123");
    assert_eq!(result.query(), Some("foo=bar"));
}

#[test]
fn from_url_handles_nested_path() {
    let url = Url::parse("https://macro.com/app/component/nested/path/here").unwrap();
    let result = MacroScheme::from_url(&url).unwrap();
    assert_eq!(result.path(), "/component/nested/path/here");
}

#[test]
fn transform_external_url_adds_is_mobile_when_query_exists() {
    let url = Url::parse("https://example.com/path?foo=bar").unwrap();
    let result = transform_external_url(url);
    assert_eq!(
        result.query_pairs().find(|(k, _)| k == "is_mobile"),
        Some((Cow::Borrowed("is_mobile"), Cow::Borrowed("true")))
    );
}

#[test]
fn transform_external_url_no_query_does_not_add_is_mobile() {
    let url = Url::parse("https://example.com/path").unwrap();
    let result = transform_external_url(url);
    assert_eq!(result.query_pairs().find(|(k, _)| k == "is_mobile"), None);
}

#[test]
fn transform_external_url_preserves_existing_is_mobile_true() {
    let url = Url::parse("https://example.com/path?is_mobile=true").unwrap();
    let result = transform_external_url(url);
    let is_mobile_count = result
        .query_pairs()
        .filter(|(k, _)| k == "is_mobile")
        .count();
    assert_eq!(is_mobile_count, 1);
    assert_eq!(
        result.query_pairs().find(|(k, _)| k == "is_mobile"),
        Some((Cow::Borrowed("is_mobile"), Cow::Borrowed("true")))
    );
}

#[test]
fn transform_external_url_preserves_existing_is_mobile_false() {
    let url = Url::parse("https://example.com/path?is_mobile=false").unwrap();
    let result = transform_external_url(url);
    let is_mobile_count = result
        .query_pairs()
        .filter(|(k, _)| k == "is_mobile")
        .count();
    assert_eq!(is_mobile_count, 1);
    assert_eq!(
        result.query_pairs().find(|(k, _)| k == "is_mobile"),
        Some((Cow::Borrowed("is_mobile"), Cow::Borrowed("false")))
    );
}

fn plugin_with_app_links() -> MacroNavigationPlugin {
    MacroNavigationPlugin::new(&["https://macro.com", "http://localhost:3000"])
        .unwrap()
        .with_app_link_domains(&["https://macro.com", "https://dev.macro.com"])
        .unwrap()
}

#[test]
fn as_app_link_converts_app_path_on_app_domain() {
    let plugin = plugin_with_app_links();
    let url =
        Url::parse("https://macro.com/app/task/019f7009-4645-763a-9a97-d2411da16659").unwrap();
    let result = plugin.as_app_link(&url).unwrap();
    assert_eq!(result.path(), "/task/019f7009-4645-763a-9a97-d2411da16659");
    assert_eq!(result.query(), None);
}

#[test]
fn as_app_link_preserves_query() {
    let plugin = plugin_with_app_links();
    let url = Url::parse("https://macro.com/app/channel/abc?message=def").unwrap();
    let result = plugin.as_app_link(&url).unwrap();
    assert_eq!(result.path(), "/channel/abc");
    assert_eq!(result.query(), Some("message=def"));
}

#[test]
fn as_app_link_handles_dev_domain() {
    let plugin = plugin_with_app_links();
    let url = Url::parse("https://dev.macro.com/app/md/doc123").unwrap();
    let result = plugin.as_app_link(&url).unwrap();
    assert_eq!(result.path(), "/md/doc123");
}

#[test]
fn as_app_link_ignores_non_app_paths() {
    let plugin = plugin_with_app_links();
    let url = Url::parse("https://macro.com/blog/some-post").unwrap();
    assert!(plugin.as_app_link(&url).is_none());
    // "/apple" must not match the "/app" prefix
    let url = Url::parse("https://macro.com/apple").unwrap();
    assert!(plugin.as_app_link(&url).is_none());
}

#[test]
fn as_app_link_ignores_other_domains() {
    let plugin = plugin_with_app_links();
    let url = Url::parse("https://example.com/app/task/123").unwrap();
    assert!(plugin.as_app_link(&url).is_none());
    // internal (bundle/dev server) origins are not app link origins
    let url = Url::parse("http://localhost:3000/app/task/123").unwrap();
    assert!(plugin.as_app_link(&url).is_none());
}

#[test]
fn as_app_link_ignores_non_http_schemes() {
    let plugin = plugin_with_app_links();
    let url = Url::parse("tauri://localhost/app/task/123").unwrap();
    assert!(plugin.as_app_link(&url).is_none());
}

#[test]
fn as_app_link_without_configured_domains_matches_nothing() {
    let plugin = MacroNavigationPlugin::new(&["https://macro.com"]).unwrap();
    let url = Url::parse("https://macro.com/app/task/123").unwrap();
    assert!(plugin.as_app_link(&url).is_none());
}

#[test]
fn transform_external_url_preserves_other_query_params() {
    let url = Url::parse("https://example.com/path?foo=bar&baz=qux").unwrap();
    let result = transform_external_url(url);
    assert_eq!(
        result.query_pairs().find(|(k, _)| k == "foo"),
        Some((Cow::Borrowed("foo"), Cow::Borrowed("bar")))
    );
    assert_eq!(
        result.query_pairs().find(|(k, _)| k == "baz"),
        Some((Cow::Borrowed("baz"), Cow::Borrowed("qux")))
    );
    assert_eq!(
        result.query_pairs().find(|(k, _)| k == "is_mobile"),
        Some((Cow::Borrowed("is_mobile"), Cow::Borrowed("true")))
    );
}
