use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use serde::Serialize;
use tauri::{Emitter, EventTarget, Manager, Runtime, State, WebviewWindow};

pub const SCANNER_EVENT: &str = "hardware://simulated-scan";
const MAX_BARCODE_BYTES: usize = 255;
const MAX_CHUNK_BYTES: usize = 4096;

#[derive(Debug, PartialEq)]
enum ParsedRecord {
  Scan(String),
  Error(String),
}

#[derive(Default)]
struct ScannerParser {
  buffer: Vec<u8>,
  discarding: bool,
}

impl ScannerParser {
  fn feed(&mut self, chunk: &[u8]) -> Vec<ParsedRecord> {
    let mut records = Vec::new();
    for &byte in chunk {
      if byte == b'\r' {
        if self.discarding {
          self.discarding = false;
        } else if self.buffer.is_empty() || self.buffer.iter().all(|byte| *byte == b' ') {
          records.push(ParsedRecord::Error("Barcode must not be empty.".into()));
        } else {
          // Only printable ASCII enters the buffer; preserve the payload exactly.
          records.push(ParsedRecord::Scan(
            String::from_utf8(std::mem::take(&mut self.buffer)).expect("validated ASCII"),
          ));
        }
        self.buffer.clear();
      } else if !self.discarding {
        let error = if !(b' '..=b'~').contains(&byte) {
          Some("Barcode must contain printable ASCII only.")
        } else if self.buffer.len() == MAX_BARCODE_BYTES {
          Some("Barcode exceeds the 255-byte limit.")
        } else {
          None
        };
        if let Some(message) = error {
          self.buffer.clear();
          self.discarding = true;
          records.push(ParsedRecord::Error(message.into()));
        } else {
          self.buffer.push(byte);
        }
      }
    }
    records
  }
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ScannerEvent {
  Scan {
    #[serde(rename = "sessionId")]
    session_id: String,
    #[serde(rename = "scanId")]
    scan_id: String,
    barcode: String,
  },
  Error {
    #[serde(rename = "sessionId")]
    session_id: String,
    message: String,
  },
}

struct Session {
  id: String,
  sequence: u64,
  parser: ScannerParser,
}

#[derive(Default)]
pub struct ScannerSimulator {
  next_session: AtomicU64,
  sessions: Mutex<HashMap<String, Session>>,
}

impl ScannerSimulator {
  fn start(&self, window: &str) -> Result<String, String> {
    let id = (self.next_session.fetch_add(1, Ordering::Relaxed) + 1).to_string();
    self
      .sessions
      .lock()
      .map_err(|error| error.to_string())?
      .insert(
        window.into(),
        Session {
          id: id.clone(),
          sequence: 0,
          parser: ScannerParser::default(),
        },
      );
    Ok(id)
  }

  fn feed(&self, window: &str, session_id: &str, chunk: &str) -> Result<Vec<ScannerEvent>, String> {
    if chunk.is_empty() || chunk.len() > MAX_CHUNK_BYTES {
      return Err("Input chunk must contain between 1 and 4096 bytes.".into());
    }
    let mut sessions = self.sessions.lock().map_err(|error| error.to_string())?;
    let session = sessions
      .get_mut(window)
      .filter(|session| session.id == session_id)
      .ok_or("Scanner simulator session is not active in this window.")?;
    Ok(
      session
        .parser
        .feed(chunk.as_bytes())
        .into_iter()
        .map(|record| match record {
          ParsedRecord::Scan(barcode) => {
            session.sequence += 1;
            ScannerEvent::Scan {
              session_id: session.id.clone(),
              scan_id: format!("{}:{}", session.id, session.sequence),
              barcode,
            }
          }
          ParsedRecord::Error(message) => ScannerEvent::Error {
            session_id: session.id.clone(),
            message,
          },
        })
        .collect(),
    )
  }

  fn stop(&self, window: &str, session_id: &str) -> Result<(), String> {
    let mut sessions = self.sessions.lock().map_err(|error| error.to_string())?;
    // A late cleanup from the old screen must not stop a newly opened session.
    if sessions
      .get(window)
      .is_some_and(|session| session.id == session_id)
    {
      sessions.remove(window);
    }
    Ok(())
  }

  pub fn remove_window(&self, window: &str) -> Result<(), String> {
    self
      .sessions
      .lock()
      .map_err(|error| error.to_string())?
      .remove(window);
    Ok(())
  }
}

#[tauri::command]
pub fn scanner_simulator_start<R: Runtime>(
  window: WebviewWindow<R>,
  simulator: State<'_, ScannerSimulator>,
) -> Result<String, String> {
  simulator.start(window.label())
}

#[tauri::command]
pub fn scanner_simulator_feed<R: Runtime>(
  window: WebviewWindow<R>,
  simulator: State<'_, ScannerSimulator>,
  session_id: String,
  chunk: String,
) -> Result<(), String> {
  for event in simulator.feed(window.label(), &session_id, &chunk)? {
    window
      .emit_to(
        EventTarget::webview_window(window.label()),
        SCANNER_EVENT,
        event,
      )
      .map_err(|error| format!("Could not deliver simulated scanner event: {error}"))?;
  }
  Ok(())
}

#[tauri::command]
pub fn scanner_simulator_stop<R: Runtime>(
  window: WebviewWindow<R>,
  simulator: State<'_, ScannerSimulator>,
  session_id: String,
) -> Result<(), String> {
  simulator.stop(window.label(), &session_id)
}

pub fn on_window_event<R: Runtime>(window: &tauri::Window<R>, event: &tauri::WindowEvent) {
  if matches!(event, tauri::WindowEvent::Destroyed) {
    if let Err(error) = window
      .state::<ScannerSimulator>()
      .remove_window(window.label())
    {
      log::error!("Could not close scanner simulator session: {error}");
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn frames_chunks_multiple_scans_and_preserves_payload() {
    let mut parser = ScannerParser::default();
    assert!(parser.feed(b"036000").is_empty());
    assert_eq!(
      parser.feed(b"291452\r 001 \r"),
      vec![
        ParsedRecord::Scan("036000291452".into()),
        ParsedRecord::Scan(" 001 ".into()),
      ]
    );
  }

  #[test]
  fn rejects_empty_malformed_and_oversized_frames_then_recovers() {
    let mut parser = ScannerParser::default();
    assert!(matches!(
      parser.feed(b"\r   \r").as_slice(),
      [ParsedRecord::Error(_), ParsedRecord::Error(_)]
    ));
    assert!(matches!(parser.feed(b"bad\ntrailing\rOK\r").as_slice(), [
      ParsedRecord::Error(_), ParsedRecord::Scan(value)
    ] if value == "OK"));
    assert!(matches!(
      parser.feed("é\r".as_bytes()).as_slice(),
      [ParsedRecord::Error(_)]
    ));
    assert_eq!(parser.feed(&[b'A'; 255]), Vec::new());
    assert_eq!(
      parser.feed(b"\r"),
      vec![ParsedRecord::Scan("A".repeat(255))]
    );
    assert!(matches!(
      parser.feed(&[b'A'; 256]).as_slice(),
      [ParsedRecord::Error(_)]
    ));
    assert!(parser.feed(b"rest").is_empty());
    assert_eq!(
      parser.feed(b"\r001\r"),
      vec![ParsedRecord::Scan("001".into())]
    );
  }

  #[test]
  fn isolates_windows_and_sessions_with_unique_scan_records() {
    let simulator = ScannerSimulator::default();
    let first = simulator.start("main").unwrap();
    assert!(simulator.feed("other", &first, "001\r").is_err());
    assert!(simulator.feed("main", &first, "").is_err());
    assert!(simulator.feed("main", &first, &"A".repeat(4097)).is_err());
    let events = simulator.feed("main", &first, "001\r001\r").unwrap();
    let values: Vec<_> = events
      .iter()
      .map(|event| serde_json::to_value(event).unwrap())
      .collect();
    assert_eq!(values[0]["barcode"], "001");
    assert_eq!(values[1]["barcode"], "001");
    assert_ne!(values[0]["scanId"], values[1]["scanId"]);
    assert_eq!(values[0]["type"], "scan");
    assert_eq!(values[0]["sessionId"], first);
    simulator.feed("main", &first, "partial").unwrap();
    let second = simulator.start("main").unwrap();
    simulator.stop("main", &first).unwrap();
    assert!(simulator.feed("main", &first, "001\r").is_err());
    assert!(matches!(
      simulator.feed("main", &second, "\r").unwrap().as_slice(),
      [ScannerEvent::Error { .. }]
    ));
    simulator.stop("main", &second).unwrap();
    assert!(simulator.feed("main", &second, "001\r").is_err());
  }

  #[test]
  fn enforces_exact_chunk_limit_without_losing_buffered_input() {
    let simulator = ScannerSimulator::default();
    let id = simulator.start("main").unwrap();
    let full_chunk = format!("{}\r", "A".repeat(255)).repeat(16);
    assert_eq!(full_chunk.len(), MAX_CHUNK_BYTES);
    assert_eq!(simulator.feed("main", &id, &full_chunk).unwrap().len(), 16);
    assert!(simulator.feed("main", &id, "036000").unwrap().is_empty());
    assert!(simulator
      .feed("main", &id, &"A".repeat(MAX_CHUNK_BYTES + 1))
      .is_err());
    assert!(matches!(
      simulator.feed("main", &id, "291452\r").unwrap().as_slice(),
      [ScannerEvent::Scan { barcode, .. }] if barcode == "036000291452"
    ));
    simulator.remove_window("main").unwrap();
    assert!(simulator.feed("main", &id, "001\r").is_err());
  }

  #[test]
  fn native_commands_deliver_serialized_events_only_to_requesting_window() {
    use std::sync::Arc;
    use tauri::test::{
      get_ipc_response, mock_builder, mock_context, noop_assets, MockRuntime, INVOKE_KEY,
    };
    use tauri::Listener;

    let app = mock_builder()
      .manage(ScannerSimulator::default())
      .invoke_handler(tauri::generate_handler![
        scanner_simulator_start,
        scanner_simulator_feed,
        scanner_simulator_stop
      ])
      .build(mock_context(noop_assets()))
      .unwrap();
    let main = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
      .build()
      .unwrap();
    let other = tauri::WebviewWindowBuilder::new(&app, "other", Default::default())
      .build()
      .unwrap();
    let received = Arc::new(Mutex::new(Vec::<serde_json::Value>::new()));
    let captured = received.clone();
    main.listen(SCANNER_EVENT, move |event| {
      captured
        .lock()
        .unwrap()
        .push(serde_json::from_str(event.payload()).unwrap());
    });
    let other_received = Arc::new(AtomicU64::new(0));
    let captured = other_received.clone();
    other.listen(SCANNER_EVENT, move |_| {
      captured.fetch_add(1, Ordering::Relaxed);
    });

    let invoke = |window: &WebviewWindow<MockRuntime>, command: &str, args: serde_json::Value| {
      get_ipc_response(
        window,
        tauri::webview::InvokeRequest {
          cmd: command.into(),
          callback: tauri::ipc::CallbackFn(0),
          error: tauri::ipc::CallbackFn(1),
          url: "tauri://localhost".parse().unwrap(),
          body: tauri::ipc::InvokeBody::Json(args),
          headers: Default::default(),
          invoke_key: INVOKE_KEY.into(),
        },
      )
    };
    let session_id = invoke(&main, "scanner_simulator_start", serde_json::json!({}))
      .unwrap()
      .deserialize::<String>()
      .unwrap();
    let feed = |chunk: &str| serde_json::json!({ "sessionId": session_id, "chunk": chunk });
    invoke(&main, "scanner_simulator_feed", feed("036000")).unwrap();
    assert!(received.lock().unwrap().is_empty());
    invoke(
      &main,
      "scanner_simulator_feed",
      feed("291452\r036000291452\r\r"),
    )
    .unwrap();
    let events = received.lock().unwrap();
    assert_eq!(events.len(), 3);
    assert_eq!(events[0]["barcode"], "036000291452");
    assert_eq!(events[0]["sessionId"], session_id);
    assert_ne!(events[0]["scanId"], events[1]["scanId"]);
    assert_eq!(events[2]["type"], "error");
    assert_eq!(other_received.load(Ordering::Relaxed), 0);
    drop(events);
    assert!(invoke(&other, "scanner_simulator_feed", feed("001\r")).is_err());
    invoke(
      &main,
      "scanner_simulator_stop",
      serde_json::json!({ "sessionId": session_id }),
    )
    .unwrap();
    assert!(invoke(&main, "scanner_simulator_feed", feed("001\r")).is_err());
  }
}
