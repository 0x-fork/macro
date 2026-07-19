use crate::scheme::MacroScheme;
use logger::Logger;
use serde::{Deserialize, Serialize};
use std::{borrow::Cow, collections::HashMap, path::PathBuf, sync::Arc};
use tauri::{Emitter, Manager, Runtime, plugin::Plugin};
use tauri_plugin_opener::OpenerExt;
use url::Url;

#[cfg(test)]
mod tests;

pub mod scheme;

#[derive(Debug, Clone)]
struct InternalUrl<'a>(Cow<'a, Url>);

impl<'a> InternalUrl<'a> {
    /// attempts to remap the internal url to a different path if required
    /// if no remap is required, returns None.
    /// the frontend sometimes tries to navigate to urls which are invalid in a tauri context
    /// via setting window.location.href to e.g. '/app/login' when tauri would expect '/#/app/login'
    /// this function returns the correctly remaped url if it exists.
    fn remap_path(&self) -> Option<InternalUrl<'static>> {
        None
    }
}

#[derive(Debug, Clone)]
struct ExternalUrl<'a>(Cow<'a, Url>);

/// Possible outcomes when trying to perform on_navigation
#[derive(Debug, Clone)]
enum NavigationOutput<'a> {
    /// This is an external [Url] which will be opened in a browser
    External(ExternalUrl<'a>),
    /// This is a valid internal [Url]
    Internal(InternalUrl<'a>),
    /// The frontend attempted to navigate to an internal [Url]
    /// which is invalid in a Tauri context.
    InternalTransformed {
        #[expect(dead_code)]
        original: InternalUrl<'a>,
        remapped: InternalUrl<'static>,
    },
}

#[derive(Clone, Copy, Debug)]
pub enum Platform {
    Mobile,
    Desktop,
}

#[derive(Clone)]
pub struct MacroNavigationPlugin {
    internal_domains: Arc<[Url]>,
    /// Origins of the hosted web app (e.g. https://macro.com). Navigations to
    /// `/app/...` paths on these origins are app links: they are converted to
    /// an in-app `navigate` event instead of loading in the webview or the
    /// system browser.
    app_link_domains: Arc<[Url]>,
    allowed_file_prefix: Option<PathBuf>,
}

#[derive(Debug, Deserialize)]
struct AuthCallbackQuery<'a> {
    original_url: Option<Url>,
    #[serde(flatten, borrow)]
    remaining: HashMap<Cow<'a, str>, Cow<'a, str>>,
}

#[derive(Debug, Serialize)]
struct MacroCallbackQuery<'a> {
    original_url: MacroScheme,
    #[serde(flatten, borrow)]
    remaining: HashMap<Cow<'a, str>, Cow<'a, str>>,
}

impl MacroNavigationPlugin {
    pub fn new(allow_list: &'static [&'static str]) -> Result<Self, url::ParseError> {
        Ok(MacroNavigationPlugin {
            internal_domains: allow_list
                .iter()
                .map(|s| s.parse())
                .collect::<Result<Arc<_>, _>>()?,
            app_link_domains: Arc::new([]),
            allowed_file_prefix: None,
        })
    }

    pub fn with_app_link_domains(
        mut self,
        domains: &'static [&'static str],
    ) -> Result<Self, url::ParseError> {
        self.app_link_domains = domains
            .iter()
            .map(|s| s.parse())
            .collect::<Result<Arc<_>, _>>()?;
        Ok(self)
    }

    pub fn with_allowed_file_prefix(mut self, prefix: PathBuf) -> Self {
        self.allowed_file_prefix = Some(prefix);
        self
    }

    #[tracing::instrument(ret, level = tracing::Level::DEBUG, skip(self))]
    fn get_destination<'a>(&self, url: &'a Url) -> NavigationOutput<'a> {
        let internal = match self.as_internal_url(url) {
            Ok(internal) => internal,
            Err(external) => return NavigationOutput::External(external),
        };
        match internal.remap_path() {
            Some(remapped) => NavigationOutput::InternalTransformed {
                original: internal,
                remapped,
            },
            None => NavigationOutput::Internal(internal),
        }
    }

    /// Returns the [MacroScheme] conversion for links that point at the hosted
    /// web app (e.g. `https://macro.com/app/task/<id>`), so they can be routed
    /// inside the app like a deep link instead of leaving the bundle.
    #[tracing::instrument(ret, level = tracing::Level::DEBUG, skip(self))]
    fn as_app_link(&self, url: &Url) -> Option<MacroScheme> {
        if !matches!(url.scheme(), "http" | "https") {
            return None;
        }
        let is_app_domain = self.app_link_domains.iter().any(|cur| {
            cur.scheme().eq(url.scheme())
                && cur.domain().eq(&url.domain())
                && cur.port().eq(&url.port())
        });
        if !is_app_domain {
            return None;
        }
        let path = url.path();
        if path != "/app" && !path.starts_with("/app/") {
            return None;
        }
        MacroScheme::from_url(url).ok()
    }

    #[tracing::instrument(ret, level = tracing::Level::DEBUG, skip(self))]
    fn as_internal_url<'a>(&self, url: &'a Url) -> Result<InternalUrl<'a>, ExternalUrl<'a>> {
        let is_allowed_domain = self.internal_domains.iter().any(|cur| {
            cur.scheme().eq(url.scheme())
                && cur.domain().eq(&url.domain())
                && cur.port().eq(&url.port())
        });

        let is_allowed_file = url.scheme() == "file"
            && self.allowed_file_prefix.as_ref().is_some_and(|prefix| {
                url.to_file_path()
                    .ok()
                    .and_then(|path| path.canonicalize().ok())
                    .and_then(|canonical| {
                        prefix
                            .canonicalize()
                            .ok()
                            .map(|cp| canonical.starts_with(cp))
                    })
                    .unwrap_or(false)
            });

        if is_allowed_domain || is_allowed_file {
            Ok(InternalUrl(Cow::Borrowed(url)))
        } else {
            Err(ExternalUrl(Cow::Borrowed(url)))
        }
    }
}

#[derive(Clone, Serialize, Debug)]
struct NavigatePayload<'a> {
    path: &'a str,
    query: &'a str,
}

/// Emits the `navigate` event the frontend router listens for, performing an
/// in-app (client side) navigation to the path of the given [MacroScheme].
/// We send an event instead of calling `Webview::navigate` because the latter
/// performs a full browser navigation and reloads the app.
pub fn emit_navigate<R: Runtime>(
    handle: &tauri::AppHandle<R>,
    macro_scheme: &MacroScheme,
) -> tauri::Result<()> {
    let payload = NavigatePayload {
        path: macro_scheme.path(),
        query: macro_scheme.query().unwrap_or_default(),
    };
    tracing::trace!("emitting navigate event {payload:?}");
    handle.emit("navigate", payload)
}

#[tracing::instrument(ret, level = tracing::Level::DEBUG)]
fn transform_external_url(mut url: Url) -> Url {
    let Some(query) = url.query() else {
        return url;
    };

    if let Ok(AuthCallbackQuery {
        original_url: Some(cb),
        remaining,
    }) = serde_qs::from_str(query).log_err()
    {
        let Ok(macro_scheme) = MacroScheme::from_url(&cb) else {
            return url;
        };

        url.set_query(Some(
            serde_qs::to_string(&MacroCallbackQuery {
                original_url: macro_scheme,
                remaining,
            })
            .expect("serialization should not fail")
            .as_str(),
        ));
    }
    if url
        .query_pairs()
        .find(|(k, _v)| k.as_ref() == "is_mobile")
        .is_none()
    {
        url.query_pairs_mut().append_pair("is_mobile", "true");
    }
    url
}

impl<R: Runtime> Plugin<R> for MacroNavigationPlugin {
    fn name(&self) -> &'static str {
        std::any::type_name_of_val(self)
    }

    fn initialize(
        &mut self,
        app: &tauri::AppHandle<R>,
        _config: serde_json::Value,
    ) -> Result<(), Box<dyn std::error::Error>> {
        if self.allowed_file_prefix.is_none()
            && let Ok(cache_dir) = app.path().app_cache_dir()
        {
            tracing::debug!("Setting allowed file prefix to {cache_dir:?}");
            self.allowed_file_prefix = Some(cache_dir);
        }
        Ok(())
    }

    fn on_navigation(&mut self, webview: &tauri::Webview<R>, url: &tauri::Url) -> bool {
        // Links to the hosted web app (e.g. https://macro.com/app/task/<id>)
        // are routed in-app like deep links, rather than letting the webview
        // navigate away from the bundle or opening the system browser.
        if let Some(macro_scheme) = self.as_app_link(url) {
            emit_navigate(webview.app_handle(), &macro_scheme).log_and_consume();
            return false;
        }

        let dest = self.get_destination(url);

        match dest {
            NavigationOutput::External(external_url) => {
                // we are navigating somewhere external to the app
                // open in system default browser
                // spawn a detached thread to avoid blocking,
                // on android this panics if called on the main thread
                let app_handle = webview.app_handle().clone();
                let url = external_url.0.into_owned();
                std::thread::spawn(move || {
                    app_handle
                        .opener()
                        .open_url(transform_external_url(url).as_str(), None::<&str>)
                        .log_and_consume();
                });
                false
            }
            NavigationOutput::Internal(_internal_url) => true,
            NavigationOutput::InternalTransformed {
                original: _,
                remapped,
            } => {
                webview.navigate(remapped.0.into_owned()).ok();
                false
            }
        }
    }
}
