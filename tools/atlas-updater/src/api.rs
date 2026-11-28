// The offline translation service for the browser extension.
//
// The helper listens on 127.0.0.1:47632 only, a fixed port the extension knows. It answers:
//   GET  /api/offline/ping                  what is installed (no secret)
//   POST /api/offline/unbind                 Authorization: Bearer <token> (removes this binding)
//   POST /api/offline/translate              Authorization: Bearer <token>, {"pair": "enfr", "texts": ["..."]}
//   POST /api/offline/speak                  Authorization: Bearer <token>, {"voice": "supertonic-3", "text": "...", "reading": "normal"}
//   POST /api/offline/ocr                    Authorization: Bearer <token>, {"image": "<base64 PNG or JPEG>", "engine": "ppocr"}
//
// Only extension pages may call it: the Origin must be chrome-extension:// or moz-extension://, and the Host must be
// this computer. Translation needs a token from a binding the user allowed in the helper window (see bind.rs). A web page cannot read the
// answers either, because no Access-Control-Allow-Origin header is sent for any other origin.

use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Sender};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use base64::Engine as _;

use crate::bind::{self, BindRequest, Bindings, Shared};
use crate::engine::{self, Engine};
use crate::json;
use crate::ocr;
use crate::packs;
use crate::speak;
use crate::store;
use crate::voices;

pub const PORT: u16 = 47632;

/// The version of this local API. An extension asks for protocol 2 or newer for offline translation (OFFLINE_PROTOCOL in
/// background/translationService.js). Bump it only when an older extension would misread an answer.
pub const PROTOCOL: u32 = 2;

/// What this helper can do. An extension uses the features it knows, and ignores the rest.
const FEATURES: &[&str] = &["offline", "packs", "bind", "translate", "speak", "ocr"];
/// The most a request body may be. A page is translated in batches, so this is generous.
const MAX_BODY: usize = 16 * 1024 * 1024;
/// The most texts in one request.
const MAX_TEXTS: usize = 500;
/// How long the window has to answer a bind request before the extension gets a timeout.
const BIND_WAIT: Duration = Duration::from_secs(120);

struct Request {
    method: String,
    path: String,
    headers: Vec<(String, String)>,
    body: String,
}

impl Request {
    fn header(&self, name: &str) -> Option<&str> {
        self.headers.iter().find(|(k, _)| k == name).map(|(_, v)| v.as_str())
    }
}

/// Starts the service in the background. Fails when the port is in use.
pub fn serve(engine: Arc<Engine>, bindings: Shared, requests: Sender<BindRequest>) -> Result<(), String> {
    let listener = TcpListener::bind(("127.0.0.1", PORT)).map_err(|e| {
        format!(
            "the offline translation port {} is in use ({}). Close the other program that uses it, then start the helper again.",
            PORT, e
        )
    })?;
    thread::spawn(move || {
        for stream in listener.incoming() {
            if let Ok(mut stream) = stream {
                let engine = Arc::clone(&engine);
                let bindings = Arc::clone(&bindings);
                let requests = requests.clone();
                thread::spawn(move || handle(&mut stream, &engine, &bindings, &requests));
            }
        }
    });
    Ok(())
}

fn read_request(stream: &mut TcpStream) -> Result<Request, String> {
    let clone = stream.try_clone().map_err(|e| e.to_string())?;
    let mut reader = BufReader::new(clone);
    let mut line = String::new();
    reader.read_line(&mut line).map_err(|e| e.to_string())?;
    let mut parts = line.trim_end().split(' ');
    let method = parts.next().unwrap_or("").to_string();
    let target = parts.next().unwrap_or("");
    let path = target.split('?').next().unwrap_or("").to_string();
    let mut headers: Vec<(String, String)> = Vec::new();
    let mut content_length = 0usize;
    loop {
        let mut header = String::new();
        let n = reader.read_line(&mut header).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        let header = header.trim_end();
        if header.is_empty() {
            break;
        }
        if let Some((k, v)) = header.split_once(':') {
            let key = k.trim().to_ascii_lowercase();
            let value = v.trim().to_string();
            if key == "content-length" {
                content_length = value.parse().unwrap_or(0);
            }
            headers.push((key, value));
        }
    }
    if content_length > MAX_BODY {
        return Err("the request is too large".to_string());
    }
    let mut body = vec![0u8; content_length];
    reader.read_exact(&mut body).map_err(|e| e.to_string())?;
    Ok(Request { method, path, headers, body: String::from_utf8_lossy(&body).to_string() })
}

fn reason(status: u16) -> &'static str {
    match status {
        200 => "OK",
        204 => "No Content",
        400 => "Bad Request",
        403 => "Forbidden",
        404 => "Not Found",
        409 => "Conflict",
        502 => "Bad Gateway",
        _ => "Internal Server Error",
    }
}

fn send(stream: &mut TcpStream, status: u16, origin: Option<&str>, body: &str) {
    let mut head = format!(
        "HTTP/1.1 {} {}\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n",
        status,
        reason(status),
        body.len()
    );
    if let Some(origin) = origin {
        head.push_str(&format!(
            "Access-Control-Allow-Origin: {}\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\nVary: Origin\r\n",
            origin
        ));
    }
    head.push_str("\r\n");
    let _ = stream.write_all(head.as_bytes());
    let _ = stream.write_all(body.as_bytes());
}

fn error_body(message: &str) -> String {
    format!("{{\"ok\":false,\"message\":{}}}", json::quote(message))
}

/// The extension origins are the only pages that may use the service.
fn is_extension_origin(origin: &str) -> bool {
    origin.starts_with("chrome-extension://") || origin.starts_with("moz-extension://")
}

fn handle(stream: &mut TcpStream, engine: &Engine, bindings: &Shared, requests: &Sender<BindRequest>) {
    let request = match read_request(stream) {
        Ok(r) => r,
        Err(message) => return send(stream, 400, None, &error_body(&message)),
    };
    let host_ok = request
        .header("host")
        .map_or(false, |h| h == format!("127.0.0.1:{}", PORT) || h == format!("localhost:{}", PORT));
    if !host_ok {
        return send(stream, 403, None, &error_body("forbidden"));
    }
    let origin = request.header("origin").map(str::to_string);
    if let Some(o) = &origin {
        if !is_extension_origin(o) {
            return send(stream, 403, None, &error_body("only the Atlas Translation extension may use this service"));
        }
    }
    let allow = origin.as_deref();
    match (request.method.as_str(), request.path.as_str()) {
        ("OPTIONS", _) => send(stream, 204, allow, ""),
        ("GET", "/api/offline/ping") => {
            let body = ping_body();
            send(stream, 200, allow, &body)
        }
        ("POST", "/api/offline/bind") => {
            let (status, body) = bind_request(&request.body, origin.as_deref(), requests);
            send(stream, status, allow, &body)
        }
        ("POST", "/api/offline/unbind") => {
            // The token itself proves which binding to remove, so only the extension that holds it can unbind.
            let token = request.header("authorization").and_then(|h| h.strip_prefix("Bearer ")).unwrap_or("");
            let removed = {
                let mut guard = bindings.lock().unwrap_or_else(|p| p.into_inner());
                guard.remove_token(token)
            };
            if removed {
                send(stream, 200, allow, "{\"ok\":true}")
            } else {
                send(stream, 403, allow, &error_body("this browser is not bound"))
            }
        }
        ("POST", "/api/offline/speak") => {
            // The token is checked under the lock, which is then released: speaking can take a few seconds.
            let token = request.header("authorization").and_then(|h| h.strip_prefix("Bearer "));
            let allowed = {
                let guard = bindings.lock().unwrap_or_else(|p| p.into_inner());
                token_allowed(&guard, token)
            };
            let (status, body) = speak_request(&request.body, allowed);
            send(stream, status, allow, &body)
        }
        ("POST", "/api/offline/ocr") => {
            // As for speaking, the lock is released before the text is read.
            let token = request.header("authorization").and_then(|h| h.strip_prefix("Bearer "));
            let allowed = {
                let guard = bindings.lock().unwrap_or_else(|p| p.into_inner());
                token_allowed(&guard, token)
            };
            let (status, body) = ocr_request(&request.body, allowed, &store::data_dir());
            send(stream, status, allow, &body)
        }
        ("POST", "/api/offline/translate") => {
            let token = request.header("authorization").and_then(|h| h.strip_prefix("Bearer "));
            let (status, body) = {
                // The token is checked under the lock, which is released before the (slow) translation.
                let allowed = {
                    let guard = bindings.lock().unwrap_or_else(|p| p.into_inner());
                    token_allowed(&guard, token)
                };
                translate_allowed(&request.body, engine, allowed)
            };
            send(stream, status, allow, &body)
        }
        _ => send(stream, 404, allow, &error_body("not found")),
    }
}

fn ping_body() -> String {
    let installed: Vec<String> = match packs::catalogue() {
        Ok(cat) => cat
            .packs
            .iter()
            .filter(|p| packs::is_installed_in(&store::packs_dir(), p))
            .map(|p| json::quote(&p.pair))
            .collect(),
        Err(_) => Vec::new(),
    };
    // The protocol number and the features let an extension of another version use what this helper supports, and skip
    // the rest. An unknown field or feature is ignored by the extension, so a newer helper is never a failure for it.
    let features: Vec<String> = FEATURES.iter().map(|f| json::quote(f)).collect();
    // The read-aloud voices that are installed, with the languages each one speaks, so the extension can pick one for
    // a language. The runtime must be installed too; the extension speaks in the browser otherwise.
    let data = store::data_dir();
    // The text recognition engines whose models are installed. "ocr" is true when at least one is.
    let ocr_engines: Vec<String> = ocr::installed_engines(&data).iter().map(|e| json::quote(e)).collect();
    let voices_root = data.join("voices");
    let speech_voices: Vec<String> = match voices::catalogue() {
        Ok(list) => list
            .iter()
            .filter(|v| voices::is_installed_in(&voices_root, v))
            .map(|v| {
                let languages: Vec<String> = v.languages.iter().map(|l| json::quote(l)).collect();
                format!("{{\"id\":{},\"languages\":[{}]}}", json::quote(&v.id), languages.join(","))
            })
            .collect(),
        Err(_) => Vec::new(),
    };
    format!(
        "{{\"ok\":true,\"name\":\"Atlas Helper\",\"version\":{},\"protocol\":{},\"features\":[{}],\"engine\":{},\"packs\":[{}],\"speech\":{{\"runtime\":{},\"voices\":[{}]}},\"ocr_engines\":[{}],\"ocr\":{}}}",
        json::quote(&crate::app_version()),
        PROTOCOL,
        features.join(","),
        engine::find_binary().is_some(),
        installed.join(","),
        speak::runtime_installed(&data),
        speech_voices.join(","),
        ocr_engines.join(","),
        !ocr::installed_engines(&data).is_empty()
    )
}

/// Asks the user, through the helper window, to bind an extension. The answer is the new token, or a refusal.
fn bind_request(body: &str, origin: Option<&str>, requests: &Sender<BindRequest>) -> (u16, String) {
    // Only an extension page can ask. A request with no Origin header is refused, so a script cannot bind itself.
    let origin = match origin {
        Some(o) => o.to_string(),
        None => return (403, error_body("only the Atlas Translation extension may bind")),
    };
    let name = match json::parse(body) {
        Ok(value) => value.get("name").and_then(|v| v.as_str()).unwrap_or("").trim().to_string(),
        Err(_) => return (400, error_body("the request is not valid JSON")),
    };
    let name: String = if name.is_empty() { "Browser extension".to_string() } else { name.chars().take(80).collect() };
    let (reply, answer) = mpsc::channel();
    if requests.send(BindRequest { name, origin, reply }).is_err() {
        return (503, error_body("the helper window is closed. Start the helper again."));
    }
    match answer.recv_timeout(BIND_WAIT) {
        Ok(Some(token)) => (200, format!("{{\"ok\":true,\"token\":{}}}", json::quote(&token))),
        Ok(None) => (403, error_body("the user did not allow the binding in the helper window")),
        Err(_) => (408, error_body("the helper window did not answer")),
    }
}

/// Whether the request's token belongs to a bound browser.
fn token_allowed(bindings: &Bindings, token: Option<&str>) -> bool {
    token.map_or(false, |t| bindings.verify(t))
}

/// Returns the HTTP status and the JSON body for a speak request.
fn speak_request(body: &str, allowed: bool) -> (u16, String) {
    speak_from(body, allowed, &store::data_dir())
}

/// Returns the HTTP status and the JSON body for an OCR request. The picture is base64 (PNG or JPEG), with or without
/// its data: address. The models are read from the data folder.
fn ocr_request(body: &str, allowed: bool, data: &Path) -> (u16, String) {
    let value = match json::parse(body) {
        Ok(v) => v,
        Err(_) => return (400, error_body("the request is not valid JSON")),
    };
    if !allowed {
        return (403, error_body("this browser is not bound to the helper. Bind it again from the extension."));
    }
    let requested = value.get("engine").and_then(|v| v.as_str()).unwrap_or(ocr::ENGINE_OCRS);
    if requested != ocr::ENGINE_PPOCR && requested != ocr::ENGINE_OCRS {
        return (400, error_body("this text recognition engine is not available"));
    }
    let encoded = value.get("image").and_then(|v| v.as_str()).unwrap_or("");
    let encoded = encoded.rsplit(',').next().unwrap_or("").trim();
    let picture = match base64::engine::general_purpose::STANDARD.decode(encoded) {
        Ok(bytes) if !bytes.is_empty() => bytes,
        _ => return (400, error_body("the picture is not valid base64")),
    };
    // The engine asked for when it is installed, otherwise the other installed one.
    let Some(engine) = ocr::engine_for(data, requested) else {
        return (409, error_body("the text recognition models are not installed. Install them in the helper's Offline tab."));
    };
    match ocr::recognise(data, engine, &picture) {
        Ok(lines) => (200, lines_body(&lines)),
        Err(message) => (500, error_body(&message)),
    }
}

fn lines_body(lines: &[ocr::Line]) -> String {
    let items: Vec<String> = lines
        .iter()
        .map(|l| {
            format!(
                "{{\"text\":{},\"box\":[{},{},{},{}]}}",
                json::quote(&l.text),
                l.bbox[0],
                l.bbox[1],
                l.bbox[2],
                l.bbox[3]
            )
        })
        .collect();
    format!("{{\"lines\":[{}]}}", items.join(","))
}

/// The speak request, with the data folder given. The voice and the runtime are read from disk. The sound plays on
/// this computer on its own thread, so the answer does not wait for the end of the sentence.
fn speak_from(body: &str, allowed: bool, data: &Path) -> (u16, String) {
    let value = match json::parse(body) {
        Ok(v) => v,
        Err(_) => return (400, error_body("the request is not valid JSON")),
    };
    if !allowed {
        return (403, error_body("this browser is not bound to the helper. Bind it again from the extension."));
    }
    let voice_id = value.get("voice").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let text = value.get("text").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let reading = value.get("reading").and_then(|v| v.as_str()).unwrap_or("normal").to_string();
    let list = match voices::catalogue() {
        Ok(l) => l,
        Err(e) => return (500, error_body(&e)),
    };
    let voice = match list.iter().find(|v| v.id == voice_id) {
        Some(v) => v,
        None => return (400, error_body("this voice is not in the helper's list")),
    };
    if !voices::is_installed_in(&data.join("voices"), voice) {
        return (409, error_body(&format!("{} is not installed. Install it in the helper's Offline tab.", voice.name)));
    }
    if !speak::runtime_installed(data) {
        return (409, error_body("the read-aloud runtime is not installed. Install it in the helper's Offline tab."));
    }
    let file = match speak::synthesize(data, voice, &text, speak::speed_for(&reading)) {
        Ok(f) => f,
        Err(e) => return (500, error_body(&e)),
    };
    thread::spawn(move || {
        let _ = speak::play(&file);
    });
    (200, "{\"ok\":true}".to_string())
}

fn translate_request(body: &str, engine: &Engine, token: Option<&str>, bindings: &Bindings) -> (u16, String) {
    translate_allowed(body, engine, token_allowed(bindings, token))
}

fn translate_allowed(body: &str, engine: &Engine, allowed: bool) -> (u16, String) {
    translate_from(body, engine, allowed, &store::packs_dir(), engine::find_binary())
}

/// The translate request, with the packs folder and the engine program given. It needs no network: the language list is
/// built into the helper, and the packs and the engine are read from disk.
fn translate_from(body: &str, engine: &Engine, allowed: bool, packs_root: &Path, binary: Option<PathBuf>) -> (u16, String) {
    let value = match json::parse(body) {
        Ok(v) => v,
        Err(_) => return (400, error_body("the request is not valid JSON")),
    };
    if !allowed {
        return (403, error_body("this browser is not bound to the helper. Bind it again from the extension."));
    }
    let pair = value.get("pair").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let texts: Vec<String> = match value.get("texts").and_then(|v| v.as_array()) {
        Some(items) => {
            if items.len() > MAX_TEXTS {
                return (400, error_body("too many texts in one request"));
            }
            let mut out = Vec::with_capacity(items.len());
            for item in items {
                match item.as_str() {
                    Some(s) => out.push(s.to_string()),
                    None => return (400, error_body("every text must be a string")),
                }
            }
            out
        }
        None => return (400, error_body("texts must be a list")),
    };
    let catalogue = match packs::catalogue() {
        Ok(c) => c,
        Err(e) => return (500, error_body(&e)),
    };
    let pack = match packs::find(&catalogue, &pair) {
        Some(p) => p,
        None => return (400, error_body("this language pair is not available offline")),
    };
    if !packs::is_installed_in(packs_root, pack) {
        return (409, error_body(&format!("the {} language pack is not installed in the helper", pair)));
    }
    let binary = match binary {
        Some(b) => b,
        None => return (409, error_body("the offline engine is not installed in the helper")),
    };
    if texts.is_empty() {
        return (200, "{\"ok\":true,\"translations\":[]}".to_string());
    }
    match engine.translate(&binary, &packs_root.join(&pair), &pair, &texts) {
        Ok(translations) => {
            let quoted: Vec<String> = translations.iter().map(|t| json::quote(t)).collect();
            (200, format!("{{\"ok\":true,\"translations\":[{}]}}", quoted.join(",")))
        }
        Err(e) => (502, error_body(&e)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bound() -> (Bindings, String) {
        let mut bindings = Bindings::in_memory();
        let token = bindings.add("Test browser").unwrap();
        (bindings, token)
    }

    #[test]
    fn ping_reports_the_speech_and_ocr_state() {
        // The extension picks a read-aloud voice and checks for text recognition from these fields.
        let body = json::parse(&ping_body()).expect("the ping answer is valid JSON");
        let speech = body.get("speech").expect("the ping answer has a speech object");
        assert!(speech.get("runtime").is_some());
        assert!(speech.get("voices").and_then(|v| v.as_array()).is_some());
        assert!(body.get("ocr").is_some());
        assert!(body.get("features").and_then(|v| v.as_array()).unwrap().iter().any(|f| f.as_str() == Some("ocr")));
    }

    #[test]
    fn speaking_needs_a_bound_browser_and_a_known_voice() {
        let (bindings, token) = bound();
        let dir = std::env::temp_dir().join(format!("atlas-api-speak-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let body = "{\"voice\":\"supertonic-3\",\"text\":\"hi\"}";
        assert_eq!(speak_from(body, token_allowed(&bindings, None), &dir).0, 403, "no token");
        assert_eq!(speak_from(body, token_allowed(&bindings, Some("wrong")), &dir).0, 403, "unbound token");
        let allowed = token_allowed(&bindings, Some(&token));
        assert_eq!(speak_from("not json", allowed, &dir).0, 400);
        assert_eq!(speak_from("{\"voice\":\"nope\",\"text\":\"hi\"}", allowed, &dir).0, 400);
        // A known voice that is not installed is reported as 409 with a clear message.
        let (status, text) = speak_from(body, allowed, &dir);
        assert_eq!(status, 409);
        assert!(text.contains("not installed"), "{}", text);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn reading_text_needs_a_bound_browser_and_installed_models() {
        let (bindings, token) = bound();
        let dir = std::env::temp_dir().join(format!("atlas-api-ocr-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let body = "{\"image\":\"aGk=\"}";
        assert_eq!(ocr_request(body, token_allowed(&bindings, None), &dir).0, 403, "no token");
        assert_eq!(ocr_request("not json", true, &dir).0, 400);
        assert_eq!(ocr_request("{\"image\":\"aGk=\",\"engine\":\"tesseract\"}", true, &dir).0, 400);
        assert_eq!(ocr_request("{\"image\":\"!!\"}", true, &dir).0, 400, "bad base64");
        let allowed = token_allowed(&bindings, Some(&token));
        let (status, text) = ocr_request(body, allowed, &dir);
        assert_eq!(status, 409);
        assert!(text.contains("not installed"), "{}", text);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn only_extension_origins_are_allowed() {
        assert!(is_extension_origin("chrome-extension://abcdefghijklmnop"));
        assert!(is_extension_origin("moz-extension://1234-5678"));
        assert!(!is_extension_origin("https://example.com"));
        assert!(!is_extension_origin("null"));
    }

    #[test]
    fn a_missing_or_unbound_token_is_refused_before_anything_else() {
        let engine = Engine::new();
        let (bindings, _) = bound();
        let (status, body) = translate_request(r#"{"pair":"enfr","texts":["hi"]}"#, &engine, None, &bindings);
        assert_eq!(status, 403);
        assert!(body.contains("not bound"));
        let (status, _) = translate_request(r#"{"pair":"enfr","texts":["hi"]}"#, &engine, Some("wrong"), &bindings);
        assert_eq!(status, 403);
    }

    #[test]
    fn a_request_must_be_well_formed() {
        let engine = Engine::new();
        let (bindings, token) = bound();
        let t = Some(token.as_str());
        assert_eq!(translate_request("not json", &engine, t, &bindings).0, 400);
        assert_eq!(translate_request(r#"{"pair":"enfr"}"#, &engine, t, &bindings).0, 400);
        assert_eq!(translate_request(r#"{"pair":"enfr","texts":[1]}"#, &engine, t, &bindings).0, 400);
    }

    #[test]
    fn a_pair_that_is_not_in_the_catalogue_is_refused() {
        let engine = Engine::new();
        let (bindings, token) = bound();
        let (status, _) = translate_request(r#"{"pair":"../etc","texts":["hi"]}"#, &engine, Some(token.as_str()), &bindings);
        assert_eq!(status, 400);
    }

    // The offline path with no network. The pack files are on disk, the engine is a program on disk, and nothing is
    // downloaded. The pack files are sparse, so the test does not write tens of megabytes.
    #[cfg(unix)]
    #[test]
    fn a_bound_browser_translates_from_saved_packs_without_a_network() {
        use std::os::unix::fs::PermissionsExt;
        let root = std::env::temp_dir().join(format!("atlas-api-offline-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let pack_dir = root.join("enfr");
        std::fs::create_dir_all(&pack_dir).unwrap();
        let catalogue = packs::catalogue().unwrap();
        let pack = packs::find(&catalogue, "enfr").expect("enfr is in the built-in list");
        for file in &pack.files {
            let handle = std::fs::File::create(pack_dir.join(&file.name)).unwrap();
            handle.set_len(file.size).unwrap();
        }
        std::fs::write(pack_dir.join(packs::MARKER), "{}").unwrap();

        // A fake engine: it says ready, then answers each line with the same line.
        let script = root.join("fake-engine.sh");
        std::fs::write(&script, "#!/bin/sh\necho ready\nwhile IFS= read -r line; do echo \"$line\"; done\n").unwrap();
        std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755)).unwrap();

        let engine = Engine::new();
        let (bindings, token) = bound();
        let body = r#"{"pair":"enfr","texts":["Hello","Good morning"]}"#;
        let (status, reply) = translate_from(body, &engine, token_allowed(&bindings, Some(token.as_str())), &root, Some(script.clone()));
        assert_eq!(status, 200, "{}", reply);
        assert!(reply.contains("\"Hello\"") && reply.contains("\"Good morning\""), "{}", reply);
        engine.stop_all();

        // Without the marker the pack is not installed: the helper says so and does not download it.
        std::fs::remove_file(pack_dir.join(packs::MARKER)).unwrap();
        let (status, reply) = translate_from(body, &engine, token_allowed(&bindings, Some(token.as_str())), &root, Some(script));
        assert_eq!(status, 409, "{}", reply);
        assert!(reply.contains("not installed"), "{}", reply);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn the_port_is_fixed() {
        assert_eq!(PORT, 47632);
    }
}
