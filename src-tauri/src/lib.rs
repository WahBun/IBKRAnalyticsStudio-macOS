use reqwest::header::{CONTENT_TYPE, USER_AGENT};
use reqwest::{Client, Proxy, StatusCode, Url};
use serde::Serialize;
use std::net::{SocketAddr, TcpStream};
use std::time::Duration;

const APP_VERSION: &str = "2.1.15";
const FLEX_BASE_URL: &str = "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService";
const RETRY_DELAYS: [u64; 6] = [1, 2, 4, 8, 12, 16];
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(45);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FlexFetchResponse {
    report_text: String,
    content_type: String,
    reference_code: String,
}

#[derive(Debug)]
struct FlexStatus {
    is_success: bool,
    reference_code: String,
    error_code: String,
    error_message: String,
}

enum FlexClientError {
    Transport(String),
    Fatal(String),
}

impl From<String> for FlexClientError {
    fn from(message: String) -> Self {
        Self::Fatal(message)
    }
}

#[tauri::command]
async fn flex_fetch(token: String, query_id: String) -> Result<FlexFetchResponse, String> {
    let token = token.trim().to_string();
    let query_id = query_id.trim().to_string();

    if token.is_empty() {
        return Err("Flex Web Service token is required.".to_string());
    }

    if query_id.is_empty() {
        return Err("Flex Query ID is required.".to_string());
    }

    let clients = build_flex_clients()?;
    let mut transport_errors = Vec::new();

    for (label, client) in clients {
        match fetch_report_with_client(&client, &token, &query_id).await {
            Ok(result) => return Ok(result),
            Err(FlexClientError::Transport(message)) => {
                transport_errors.push(format!("{label}: {message}"));
            }
            Err(FlexClientError::Fatal(message)) => return Err(message),
        }
    }

    Err(format!(
        "IBKR Flex request could not connect. Tried {} route(s): {}",
        transport_errors.len(),
        transport_errors.join(" | ")
    ))
}

async fn fetch_report_with_client(
    client: &Client,
    token: &str,
    query_id: &str,
) -> Result<FlexFetchResponse, FlexClientError> {
    let reference_code = send_request(client, token, query_id).await?;
    get_statement_with_retry(client, token, &reference_code).await
}

fn build_flex_clients() -> Result<Vec<(String, Client)>, String> {
    let mut routes = Vec::new();

    for (label, proxy_url, port) in [
        ("Veee HTTP proxy", "http://127.0.0.1:15236", 15236),
        ("Veee SOCKS proxy", "socks5h://127.0.0.1:15235", 15235),
        ("Local HTTP proxy 7890", "http://127.0.0.1:7890", 7890),
        ("Local SOCKS proxy 7890", "socks5h://127.0.0.1:7890", 7890),
        ("Local HTTP proxy 7897", "http://127.0.0.1:7897", 7897),
        ("Local SOCKS proxy 1080", "socks5h://127.0.0.1:1080", 1080),
    ] {
        if is_local_port_open(port) {
            routes.push((label.to_string(), Some(proxy_url.to_string())));
        }
    }

    routes.push(("Direct connection".to_string(), None));

    routes
        .into_iter()
        .map(|(label, proxy_url)| {
            let mut builder = Client::builder()
                .user_agent(format!("IBKRAnalyticsStudio/{APP_VERSION} Tauri"))
                .connect_timeout(CONNECT_TIMEOUT)
                .timeout(REQUEST_TIMEOUT);

            if let Some(proxy_url) = proxy_url {
                let proxy = Proxy::all(&proxy_url)
                    .map_err(|error| format!("Could not configure {label}. {error}"))?;
                builder = builder.proxy(proxy);
            }

            let client = builder
                .build()
                .map_err(|error| format!("Could not initialize {label}. {error}"))?;
            Ok((label, client))
        })
        .collect()
}

fn is_local_port_open(port: u16) -> bool {
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    TcpStream::connect_timeout(&address, Duration::from_millis(150)).is_ok()
}

async fn send_request(client: &Client, token: &str, query_id: &str) -> Result<String, FlexClientError> {
    let url = build_flex_url("SendRequest", token, query_id)?;
    let response = client
        .get(url)
        .header(USER_AGENT, format!("IBKRAnalyticsStudio/{APP_VERSION} Tauri"))
        .send()
        .await
        .map_err(|error| FlexClientError::Transport(format!(
            "IBKR SendRequest failed. {}",
            redact_token(&error.to_string(), token)
        )))?;

    let status_code = response.status();
    let bytes = response
        .bytes()
        .await
        .map_err(|error| FlexClientError::Fatal(format!("IBKR SendRequest returned an unreadable body. {error}")))?;
    let body = decode_report(&bytes);

    if !status_code.is_success() {
        return Err(FlexClientError::Fatal(format!(
            "IBKR SendRequest failed with HTTP {} {}.",
            status_code.as_u16(),
            status_code
        )));
    }

    let status = parse_flex_status(&body)?;
    if !status.is_success || status.reference_code.trim().is_empty() {
        return Err(FlexClientError::Fatal(status.to_user_message("IBKR could not generate the Flex report.")));
    }

    Ok(status.reference_code)
}

async fn get_statement_with_retry(
    client: &Client,
    token: &str,
    reference_code: &str,
) -> Result<FlexFetchResponse, FlexClientError> {
    for attempt in 0..=RETRY_DELAYS.len() {
        let url = build_flex_url("GetStatement", token, reference_code)?;
        let response = client
            .get(url)
            .header(USER_AGENT, format!("IBKRAnalyticsStudio/{APP_VERSION} Tauri"))
            .send()
            .await
            .map_err(|error| FlexClientError::Transport(format!(
                "IBKR GetStatement failed. {}",
                redact_token(&error.to_string(), token)
            )))?;

        let status_code = response.status();
        let content_type = response
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or("text/plain")
            .to_string();
        let bytes = response
            .bytes()
            .await
            .map_err(|error| FlexClientError::Fatal(format!("IBKR GetStatement returned an unreadable body. {error}")))?;
        let body = decode_report(&bytes);

        if status_code.is_success() && !looks_like_flex_status(&body) {
            return Ok(FlexFetchResponse {
                report_text: body,
                content_type,
                reference_code: reference_code.to_string(),
            });
        }

        let status = if looks_like_flex_status(&body) {
            parse_flex_status(&body)?
        } else {
            FlexStatus {
                is_success: false,
                reference_code: String::new(),
                error_code: status_code.as_u16().to_string(),
                error_message: status_code.to_string(),
            }
        };

        if !should_retry(&status, status_code) || attempt == RETRY_DELAYS.len() {
            return Err(FlexClientError::Fatal(status.to_user_message("IBKR could not retrieve the generated Flex report.")));
        }

        tokio::time::sleep(Duration::from_secs(RETRY_DELAYS[attempt])).await;
    }

    Err(FlexClientError::Fatal("IBKR report generation did not complete in time. Please try again shortly.".to_string()))
}

fn build_flex_url(path: &str, token: &str, code: &str) -> Result<Url, String> {
    Url::parse_with_params(
        &format!("{FLEX_BASE_URL}/{path}"),
        &[("t", token), ("q", code), ("v", "3")],
    )
    .map_err(|error| format!("Could not build the IBKR Flex URL. {error}"))
}

fn redact_token(message: &str, token: &str) -> String {
    let without_token = if token.trim().is_empty() {
        message.to_string()
    } else {
        message.replace(token, "<redacted>")
    };

    redact_query_value(&without_token, "t")
}

fn redact_query_value(message: &str, key: &str) -> String {
    let marker = format!("{key}=");
    let Some(start) = message.find(&marker).map(|index| index + marker.len()) else {
        return message.to_string();
    };

    let rest = &message[start..];
    let end_offset = rest
        .find(|character| character == '&' || character == ')' || character == ' ' || character == '\n')
        .unwrap_or(rest.len());

    format!("{}<redacted>{}", &message[..start], &rest[end_offset..])
}

fn decode_report(bytes: &[u8]) -> String {
    if bytes.starts_with(&[0xef, 0xbb, 0xbf]) {
        return String::from_utf8_lossy(&bytes[3..]).to_string();
    }

    String::from_utf8_lossy(bytes).to_string()
}

fn looks_like_flex_status(body: &str) -> bool {
    let text = body.trim_start();
    text.starts_with("<FlexStatementResponse")
        || (text.starts_with("<?xml") && text.contains("<FlexStatementResponse"))
}

fn should_retry(status: &FlexStatus, status_code: StatusCode) -> bool {
    if status_code.as_u16() >= 500 {
        return true;
    }

    matches!(
        status.error_code.as_str(),
        "1001" | "1003" | "1004" | "1005" | "1006" | "1007" | "1008" | "1009" | "1019" | "1021"
    )
}

fn parse_flex_status(xml: &str) -> Result<FlexStatus, String> {
    let document = roxmltree::Document::parse(xml)
        .map_err(|error| format!("IBKR returned an unreadable XML response. {error}"))?;
    let root = document.root_element();

    Ok(FlexStatus {
        is_success: child_text(root, "Status").eq_ignore_ascii_case("Success"),
        reference_code: child_text(root, "ReferenceCode"),
        error_code: child_text(root, "ErrorCode"),
        error_message: child_text(root, "ErrorMessage"),
    })
}

fn child_text(node: roxmltree::Node<'_, '_>, name: &str) -> String {
    node.children()
        .find(|child| child.is_element() && child.tag_name().name().eq_ignore_ascii_case(name))
        .and_then(|child| child.text())
        .unwrap_or("")
        .trim()
        .to_string()
}

impl FlexStatus {
    fn to_user_message(&self, fallback: &str) -> String {
        if !self.error_code.trim().is_empty() || !self.error_message.trim().is_empty() {
            return format!("IBKR Flex error {}: {}", self.error_code, self.error_message)
                .trim()
                .to_string();
        }

        fallback.to_string()
    }
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![flex_fetch])
        .run(tauri::generate_context!())
        .expect("error while running IBKR Analytics Studio");
}
