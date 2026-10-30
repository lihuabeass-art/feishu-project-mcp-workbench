//! Update checks and package requests must use the same desktop proxy policy.
//! Keep this separate from MCP traffic, which has its own connection contract.
use reqwest::ClientBuilder;

#[cfg(windows)]
mod windows;

pub fn configure(builder: ClientBuilder) -> ClientBuilder {
    #[cfg(windows)]
    let builder = windows::configure(builder);
    builder
}
